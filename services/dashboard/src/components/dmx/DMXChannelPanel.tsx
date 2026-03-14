'use client'

import { useCallback, useRef } from 'react'
import { DMXFixture } from '@/lib/types'
import { Zap } from '@/components/icons'

interface ChannelEntry {
  varName: string
  offset: number
  label: string
  type: string
}

interface DMXChannelPanelProps {
  fixture: DMXFixture
  entityId: string
  currentState: Record<string, unknown>
  onStateChange: (updates: Record<string, unknown>) => Promise<void>
}

export function DMXChannelPanel({ fixture, currentState, onStateChange }: DMXChannelPanelProps) {
  // Build sorted channel list from channel_map
  const channels: ChannelEntry[] = Object.entries(fixture.channel_map)
    .map(([varName, mapping]) => ({
      varName,
      offset: mapping.offset,
      label: (mapping as Record<string, unknown>)['label'] as string ?? varName,
      type: mapping.type,
    }))
    .sort((a, b) => a.offset - b.offset)

  // Debounce timers per channel
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const handleSliderChange = useCallback(
    (varName: string, value: number) => {
      // Clear existing debounce for this variable
      if (debounceTimers.current[varName]) {
        clearTimeout(debounceTimers.current[varName])
      }
      debounceTimers.current[varName] = setTimeout(() => {
        onStateChange({ [varName]: value }).catch(() => {})
        delete debounceTimers.current[varName]
      }, 50)
    },
    [onStateChange]
  )

  if (channels.length === 0) return null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">DMX Channels</h3>
        <span className="text-xs text-slate-500 font-mono ml-auto">
          U{fixture.universe} · Ch {fixture.start_channel}–{fixture.start_channel + fixture.channel_count - 1}
        </span>
      </div>

      {/* Channel sliders */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {channels.map((ch) => {
          const absChannel = fixture.start_channel + ch.offset - 1
          const rawValue = currentState[ch.varName]
          const value = typeof rawValue === 'number'
            ? Math.round(Math.max(0, Math.min(255, rawValue)))
            : 0

          return (
            <div
              key={ch.varName}
              className="flex flex-col items-center gap-1 shrink-0"
              style={{ minWidth: 44 }}
            >
              {/* Current value */}
              <span className="text-xs font-mono text-slate-300 tabular-nums w-8 text-center">
                {value}
              </span>

              {/* Vertical slider */}
              <div className="relative flex items-center justify-center" style={{ height: 110 }}>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={value}
                  onChange={(e) => handleSliderChange(ch.varName, Number(e.target.value))}
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    height: 100,
                    width: 28,
                    cursor: 'pointer',
                  }}
                  className="appearance-none accent-blue-500"
                  title={`${ch.label}: ${value}`}
                />
              </div>

              {/* Absolute channel number */}
              <span className="text-[10px] text-slate-600 font-mono">
                {absChannel}
              </span>

              {/* Variable / channel name */}
              <span
                className="text-[10px] text-slate-400 text-center leading-tight max-w-[44px] break-words"
                title={ch.label !== ch.varName ? `${ch.label} (${ch.varName})` : ch.varName}
              >
                {ch.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Percentage bar overlay — visual DMX level indicator */}
      <div className="mt-3 pt-3 border-t border-slate-700">
        <div className="flex gap-1.5 items-end h-4">
          {channels.map((ch) => {
            const rawValue = currentState[ch.varName]
            const value = typeof rawValue === 'number' ? Math.max(0, Math.min(255, rawValue)) : 0
            const pct = Math.round((value / 255) * 100)
            return (
              <div
                key={ch.varName}
                className="flex-1 bg-slate-700 rounded-sm overflow-hidden h-4"
                title={`${ch.label}: ${value} (${pct}%)`}
              >
                <div
                  className="bg-blue-500/70 rounded-sm transition-all duration-100"
                  style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
