'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DMXFixture, ChannelMapping } from '@/lib/types'
import { X, SlidersHorizontal } from '@/components/icons'
import { entitiesApi } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

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
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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
        for (const [key] of channels) {
          const v = resp.state[key]
          initial[key] = typeof v === 'number' ? Math.round(Math.max(0, Math.min(255, v))) : 0
        }
        setValues(initial)
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
      for (const [key] of channels) {
        const v = incoming[key]
        if (typeof v === 'number') next[key] = Math.round(Math.max(0, Math.min(255, v)))
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage])

  const handleChange = useCallback((key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }))
    onDMXChannelChange?.()
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => {
      for (const fixture of fixtures) {
        if (!fixture.entity_id) continue
        entitiesApi.updateState(fixture.entity_id, {
          state: { [key]: value },
          source: 'dashboard-dmx',
        }).catch(() => {})
      }
    }, 50)
  }, [fixtures, onDMXChannelChange])

  useEffect(() => {
    const timers = debounceRefs.current
    return () => { for (const t of Object.values(timers)) clearTimeout(t) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start pointer-events-none" style={{ paddingTop: '3rem' }}>
      {/* Darkened/blurred backdrop covering canvas area only */}
      <div
        className="absolute inset-0 pointer-events-auto bg-black/60 backdrop-blur-sm"
        style={{ left: '14rem', right: '16rem' }}
        onClick={onClose}
      />

      {/* Modal — inset within left nav (w-56=14rem) and right DMX sidebar (w-64=16rem) */}
      <div
        className="relative pointer-events-auto flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl"
        style={{
          marginLeft: 'calc(14rem + 16px)',
          marginRight: 'calc(16rem + 16px)',
          maxHeight: '70vh',
          flex: 1,
        }}
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
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
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
                return (
                  <div key={key} className="flex flex-col items-center gap-1.5" style={{ width: 44 }}>
                    {/* Value readout */}
                    <div className="text-xs font-mono font-medium text-blue-400 tabular-nums text-center w-full">
                      {val}
                    </div>

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
