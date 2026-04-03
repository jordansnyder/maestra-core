'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DMXFixture, ChannelMapping } from '@/lib/types'
import { X, SlidersHorizontal, RotateCcw, ChevronUp, ChevronDown, Undo2 } from '@/components/icons'
import { entitiesApi } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

/**
 * Convert a native entity-state value to a 0–255 integer for slider display.
 * Entity state uses semantic units: range/color = 0.0–1.0, number = 0–100,
 * boolean = true/false. We display all channels as 0–255 DMX values.
 */
function toDisplayValue(native: unknown, type: ChannelMapping['type']): number {
  if (type === 'boolean') return native === true || native === 1 ? 255 : 0
  const n = typeof native === 'number' ? native : 0
  if (type === 'number') return Math.round(Math.max(0, Math.min(255, (n / 100) * 255)))
  // 'range', 'color', 'enum' (fallback) — stored as 0.0–1.0
  return Math.round(Math.max(0, Math.min(255, n * 255)))
}

/**
 * Convert a 0–255 slider display value back to the native entity-state format.
 */
function toNativeValue(display: number, type: ChannelMapping['type']): number | boolean {
  if (type === 'boolean') return display > 127
  if (type === 'number') return Math.round((display / 255) * 100)
  // 'range', 'color', 'enum' — stored as 0.0–1.0; keep 4 decimal places
  return Math.round((display / 255) * 10000) / 10000
}

interface DMXChannelModalProps {
  fixtures: DMXFixture[]
  onClose: () => void
  onDMXChannelChange?: () => void
}

export function DMXChannelModal({ fixtures, onClose, onDMXChannelChange }: DMXChannelModalProps) {
  const primary = fixtures[0]
  const channelMap = primary?.channel_map ?? {}
  const channels = Object.entries(channelMap).sort(([, a], [, b]) => a.offset - b.offset)

  const [values, setValues] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Snapshot of state at the time the panel opened — used by Cancel & Reset
  const initialSnapshot = useRef<Record<string, number> | null>(null)

  // Build set of all fixture entity IDs for fast lookup
  const fixtureEntityIds = new Set(fixtures.map((f) => f.entity_id).filter(Boolean))

  // Load current state from the primary fixture's entity
  useEffect(() => {
    if (!primary?.entity_id) {
      setLoading(false)
      return
    }
    entitiesApi.getState(primary.entity_id)
      .then((resp) => {
        const initial: Record<string, number> = {}
        for (const [key, ch] of channels) {
          initial[key] = toDisplayValue(resp.state[key], (ch as ChannelMapping).type)
        }
        setValues(initial)
        // Lock in the snapshot — only set once, never overwritten
        initialSnapshot.current = initial
        // Resync: push DB state to all fixtures so the floor matches what the panel shows
        for (const fixture of fixtures) {
          if (!fixture.entity_id) continue
          const nativeState: Record<string, number | boolean> = {}
          for (const [key] of channels) {
            const chType = fixture.channel_map[key]?.type ?? 'range'
            nativeState[key] = toNativeValue(initial[key] ?? 0, chType)
          }
          entitiesApi.updateState(fixture.entity_id, {
            state: nativeState,
            source: 'dashboard-dmx',
          }).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary?.entity_id])

  // Real-time updates: subscribe to entity state changes via WebSocket
  const { lastMessage, subscribe, isConnected } = useWebSocket()

  useEffect(() => {
    if (isConnected) subscribe('maestra.entity.state')
  }, [isConnected, subscribe])

  useEffect(() => {
    if (!lastMessage) return
    const event = (lastMessage.data ?? {}) as Record<string, unknown>
    if (event.type !== 'state_changed') return
    // Ignore updates we generated ourselves (slider moves)
    if (event.source === 'dashboard-dmx' || event.source === 'dmx_panel') return
    if (!event.entity_id || !fixtureEntityIds.has(event.entity_id as string)) return
    const incoming = (event.current_state ?? {}) as Record<string, unknown>
    setValues((prev) => {
      const next = { ...prev }
      for (const [key, ch] of channels) {
        const v = incoming[key]
        if (v !== undefined) next[key] = toDisplayValue(v, (ch as ChannelMapping).type)
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage])

  const handleZeroAll = useCallback(() => {
    const zeroed: Record<string, number> = {}
    for (const [key] of channels) zeroed[key] = 0
    setValues(zeroed)
    onDMXChannelChange?.()
    for (const fixture of fixtures) {
      if (!fixture.entity_id) continue
      const nativeZeros: Record<string, number | boolean> = {}
      for (const [key] of channels) {
        const chType = fixture.channel_map[key]?.type ?? 'range'
        nativeZeros[key] = toNativeValue(0, chType)
      }
      entitiesApi.updateState(fixture.entity_id, {
        state: nativeZeros,
        source: 'dashboard-dmx',
      }).catch(() => {})
    }
  }, [fixtures, channels, onDMXChannelChange])

  const handleChange = useCallback((key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }))
    onDMXChannelChange?.()
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => {
      for (const fixture of fixtures) {
        if (!fixture.entity_id) continue
        const chType = fixture.channel_map[key]?.type ?? 'range'
        entitiesApi.updateState(fixture.entity_id, {
          state: { [key]: toNativeValue(value, chType) },
          source: 'dashboard-dmx',
        }).catch(() => {})
      }
    }, 50)
  }, [fixtures, onDMXChannelChange])

  const handleCancelAndReset = useCallback(() => {
    const snapshot = initialSnapshot.current
    if (!snapshot) { onClose(); return }
    // Restore UI
    setValues(snapshot)
    // Push snapshot back to all fixtures
    for (const fixture of fixtures) {
      if (!fixture.entity_id) continue
      const nativeState: Record<string, number | boolean> = {}
      for (const [key] of channels) {
        const chType = fixture.channel_map[key]?.type ?? 'range'
        nativeState[key] = toNativeValue(snapshot[key] ?? 0, chType)
      }
      entitiesApi.updateState(fixture.entity_id, {
        state: nativeState,
        source: 'dashboard-dmx',
      }).catch(() => {})
    }
    onClose()
  }, [fixtures, channels, onClose])

  useEffect(() => {
    const timers = debounceRefs.current
    return () => { for (const t of Object.values(timers)) clearTimeout(t) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancelAndReset() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleCancelAndReset])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center pointer-events-none"
      style={isMobile ? { alignItems: 'flex-end' } : { alignItems: 'flex-start', paddingTop: '3rem' }}
    >
      {/* Backdrop — full screen on mobile, canvas-area only on desktop */}
      <div
        className="absolute inset-0 pointer-events-auto bg-black/60 backdrop-blur-sm"
        style={isMobile ? {} : { left: 'var(--sidebar-nav-width)', right: 'var(--sidebar-dmx-width)' }}
        onClick={onClose}
      />

      {/* Modal — bottom sheet on mobile, canvas-inset on desktop */}
      <div
        className="relative pointer-events-auto flex flex-col bg-slate-900 border border-slate-700 shadow-2xl"
        style={isMobile
          ? { width: '100%', maxHeight: '85vh', borderRadius: '1rem 1rem 0 0', borderBottom: 'none' }
          : {
              marginLeft: 'calc(var(--sidebar-nav-width) + 16px)',
              marginRight: 'calc(var(--sidebar-dmx-width) + 16px)',
              maxHeight: '70vh',
              flex: 1,
              borderRadius: '0.75rem',
            }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                DMX Channels
                {fixtures.length > 1 && (
                  <span className="text-xs font-normal text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">
                    {fixtures.length} fixtures
                  </span>
                )}
              </div>
              {primary?.fixture_mode && (
                <div className="text-[10px] text-slate-500 mt-px">{primary.fixture_mode}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleZeroAll}
              title="Zero all channels"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Zero All
            </button>
            <button
              onClick={handleCancelAndReset}
              title="Cancel and restore original values (Esc)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-400 bg-slate-800 hover:bg-red-900/60 hover:text-red-300 hover:border-red-700/50 border border-transparent transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              Cancel & Reset
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sliders */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-sm text-slate-600">Loading…</span>
            </div>
          ) : channels.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-sm text-slate-600">
                No channel map — select a fixture mode when adding the fixture
              </span>
            </div>
          ) : (
            <div className="flex gap-5 h-full items-start min-w-max">
              {channels.map(([key, ch]) => {
                const val = values[key] ?? 0
                const label = (ch as ChannelMapping).label ?? key
                const arrowBtn = 'flex items-center justify-center w-6 h-5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors shrink-0'
                return (
                  <div key={key} className="flex flex-col items-center gap-1" style={{ width: 44 }}>
                    {/* Value readout */}
                    <div className="text-xs font-mono font-medium text-blue-400 tabular-nums text-center w-full">
                      {val}
                    </div>

                    {/* Up arrow */}
                    <button
                      className={arrowBtn}
                      onClick={() => handleChange(key, Math.min(255, val + 1))}
                      title="Increment"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Vertical slider */}
                    <div style={{ height: 160, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        value={val}
                        onChange={(e) => handleChange(key, Number(e.target.value))}
                        style={{
                          writingMode: 'vertical-lr' as const,
                          direction: 'rtl' as const,
                          width: 28,
                          height: 160,
                          cursor: 'pointer',
                          accentColor: '#3b82f6',
                        }}
                      />
                    </div>

                    {/* Down arrow */}
                    <button
                      className={arrowBtn}
                      onClick={() => handleChange(key, Math.max(0, val - 1))}
                      title="Decrement"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Channel offset */}
                    <div className="text-[9px] font-mono text-slate-600 text-center">
                      Ch {ch.offset}
                    </div>

                    {/* Channel label */}
                    <div
                      className="text-[9px] text-slate-400 text-center leading-tight"
                      style={{ maxWidth: 44, overflowWrap: 'break-word' }}
                    >
                      {label}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — fixture list when multi-selected */}
        {fixtures.length > 1 && (
          <div className="px-5 py-2 border-t border-slate-800 shrink-0 flex flex-wrap gap-1.5">
            {fixtures.map((f) => (
              <span key={f.id} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
