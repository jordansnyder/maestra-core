'use client'

import { useState } from 'react'
import type { VariableDefinition, VariableType, VariableDirection } from '@/lib/types'

interface InlineVariableEditorProps {
  variable?: VariableDefinition
  defaultDirection?: VariableDirection
  onSave: (variable: VariableDefinition) => void
  onCancel: () => void
}

const VARIABLE_TYPES: { value: VariableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'range', label: 'Range' },
  { value: 'color', label: 'Color' },
  { value: 'enum', label: 'Enum' },
  { value: 'vector2', label: 'Vector2' },
  { value: 'vector3', label: 'Vector3' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
]

export function InlineVariableEditor({ variable, defaultDirection, onSave, onCancel }: InlineVariableEditorProps) {
  const [name, setName] = useState(variable?.name || '')
  const [type, setType] = useState<VariableType>(variable?.type || 'string')
  const [direction, setDirection] = useState<VariableDirection>(variable?.direction || defaultDirection || 'input')
  const [description, setDescription] = useState(variable?.description || '')
  const [required, setRequired] = useState(variable?.required || false)
  const [defaultValue, setDefaultValue] = useState(
    variable?.defaultValue !== undefined ? JSON.stringify(variable.defaultValue) : ''
  )
  const [config, setConfig] = useState<Record<string, unknown>>(variable?.config || {})

  const handleSave = () => {
    if (!name.trim()) return
    let parsedDefault: unknown = undefined
    if (defaultValue.trim()) {
      try { parsedDefault = JSON.parse(defaultValue) } catch { parsedDefault = defaultValue }
    }
    onSave({
      name: name.trim(),
      type,
      direction,
      description: description || undefined,
      required,
      defaultValue: parsedDefault,
      config: Object.keys(config).length > 0 ? config : undefined,
    })
  }

  const updateConfig = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const inputClass = 'px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm focus:outline-none focus:border-blue-500'

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="variable_name"
            className={`w-full ${inputClass} font-mono`}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Type</label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as VariableType); setConfig({}) }}
            className={`w-full ${inputClass}`}
          >
            {VARIABLE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Direction</label>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setDirection('input')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                direction === 'input' ? 'bg-green-600/30 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              Input
            </button>
            <button
              onClick={() => setDirection('output')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                direction === 'output' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              Output
            </button>
          </div>
        </div>
      </div>

      {/* Type-specific config */}
      {(type === 'range' || type === 'number') && (
        <div className="flex gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min</label>
            <input type="number" value={(config.min as number) ?? ''} onChange={e => updateConfig('min', parseFloat(e.target.value) || 0)}
              className={`w-20 ${inputClass}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max</label>
            <input type="number" value={(config.max as number) ?? ''} onChange={e => updateConfig('max', parseFloat(e.target.value) || 100)}
              className={`w-20 ${inputClass}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Step</label>
            <input type="number" value={(config.step as number) ?? ''} onChange={e => updateConfig('step', parseFloat(e.target.value) || 1)}
              className={`w-20 ${inputClass}`} />
          </div>
        </div>
      )}

      {type === 'enum' && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">Options (JSON array)</label>
          <input
            type="text"
            value={JSON.stringify(config.options || [])}
            onChange={e => {
              try { updateConfig('options', JSON.parse(e.target.value)) } catch { /* ignore */ }
            }}
            placeholder='[{"value":"a","label":"Option A"}]'
            className={`w-full ${inputClass} font-mono text-xs`}
          />
        </div>
      )}

      {type === 'color' && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">Format</label>
          <select value={(config.format as string) || 'hex'} onChange={e => updateConfig('format', e.target.value)}
            className={`${inputClass}`}>
            <option value="hex">Hex</option>
            <option value="rgb">RGB</option>
            <option value="rgba">RGBA</option>
            <option value="hsl">HSL</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What this variable does" className={`w-full ${inputClass}`} />
        </div>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Default</label>
            <input type="text" value={defaultValue} onChange={e => setDefaultValue(e.target.value)}
              placeholder="value" className={`w-24 ${inputClass} font-mono`} />
          </div>
          {direction === 'input' && (
            <label className="flex items-center gap-2 pb-1.5 cursor-pointer">
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-blue-500" />
              <span className="text-xs text-slate-400">Required</span>
            </label>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={!name.trim()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors disabled:opacity-50">
          {variable ? 'Save' : 'Add Variable'}
        </button>
      </div>
    </div>
  )
}
