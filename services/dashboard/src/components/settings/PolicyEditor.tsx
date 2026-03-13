'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CloudPolicy } from '@/lib/cloudTypes'

interface PolicyEditorProps {
  policies: CloudPolicy[]
  onChange: (policies: CloudPolicy[]) => void
  showPresets?: boolean
}

const PRESETS: { label: string; policy: CloudPolicy }[] = [
  {
    label: 'Entity State',
    policy: {
      subject_pattern: 'maestra.entity.state.>',
      direction: 'outbound',
      enabled: true,
      description: 'Entity state changes',
    },
  },
  {
    label: 'Device Events',
    policy: {
      subject_pattern: 'maestra.device.>',
      direction: 'outbound',
      enabled: true,
      description: 'Device events and metrics',
    },
  },
  {
    label: 'Stream Events',
    policy: {
      subject_pattern: 'maestra.stream.>',
      direction: 'outbound',
      enabled: true,
      description: 'Stream advertisement and session events',
    },
  },
  {
    label: 'All Messages',
    policy: {
      subject_pattern: 'maestra.>',
      direction: 'outbound',
      enabled: true,
      description: 'All Maestra messages',
    },
  },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-blue-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function PolicyEditor({ policies, onChange, showPresets = false }: PolicyEditorProps) {
  const addPolicy = useCallback(() => {
    onChange([
      ...policies,
      { subject_pattern: '', direction: 'outbound', enabled: true },
    ])
  }, [policies, onChange])

  const addPreset = useCallback(
    (preset: CloudPolicy) => {
      const alreadyExists = policies.some(
        (p) => p.subject_pattern === preset.subject_pattern && p.direction === preset.direction
      )
      if (!alreadyExists) {
        onChange([...policies, { ...preset }])
      }
    },
    [policies, onChange]
  )

  const updatePolicy = useCallback(
    (index: number, updates: Partial<CloudPolicy>) => {
      const next = policies.map((p, i) => (i === index ? { ...p, ...updates } : p))
      onChange(next)
    },
    [policies, onChange]
  )

  const removePolicy = useCallback(
    (index: number) => {
      onChange(policies.filter((_, i) => i !== index))
    },
    [policies, onChange]
  )

  return (
    <div className="space-y-3">
      {/* Presets */}
      {showPresets && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => addPreset(preset.policy)}
              className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 transition-colors"
            >
              + {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Policy list */}
      <div className="space-y-2">
        {policies.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
            No routing policies. Add one below or use a preset.
          </div>
        ) : (
          policies.map((policy, index) => (
            <div
              key={index}
              className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
            >
              {/* Direction badge */}
              <span
                className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                  policy.direction === 'outbound'
                    ? 'bg-blue-900/50 text-blue-300 border border-blue-700/40'
                    : 'bg-purple-900/50 text-purple-300 border border-purple-700/40'
                }`}
              >
                {policy.direction}
              </span>

              {/* Direction toggle */}
              <select
                value={policy.direction}
                onChange={(e) =>
                  updatePolicy(index, { direction: e.target.value as CloudPolicy['direction'] })
                }
                className="shrink-0 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="outbound">outbound</option>
                <option value="inbound">inbound</option>
              </select>

              {/* Subject pattern */}
              <input
                type="text"
                value={policy.subject_pattern}
                onChange={(e) => updatePolicy(index, { subject_pattern: e.target.value })}
                placeholder="maestra.entity.state.>"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Enable toggle */}
              <Toggle
                checked={policy.enabled}
                onChange={(v) => updatePolicy(index, { enabled: v })}
              />

              {/* Delete */}
              <button
                type="button"
                onClick={() => removePolicy(index)}
                className="shrink-0 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
                title="Remove policy"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add rule button */}
      <button
        type="button"
        onClick={addPolicy}
        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-dashed border-slate-700 hover:border-slate-600 rounded-lg w-full transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Rule
      </button>
    </div>
  )
}
