'use client'

import { useState } from 'react'
import type { VariableDefinition, VariableType, VariableDirection } from '@/lib/types'

interface VariableEditorProps {
  variable?: VariableDefinition
  onSave: (variable: VariableDefinition) => void
  onCancel: () => void
  direction?: VariableDirection
}

const VARIABLE_TYPES: { value: VariableType; label: string; description: string }[] = [
  { value: 'string', label: 'String', description: 'Text value' },
  { value: 'number', label: 'Number', description: 'Numeric value' },
  { value: 'boolean', label: 'Boolean', description: 'True/false toggle' },
  { value: 'array', label: 'Array', description: 'List of values' },
  { value: 'color', label: 'Color', description: 'Color picker (hex/rgb)' },
  { value: 'vector2', label: 'Vector2', description: '2D coordinates (x, y)' },
  { value: 'vector3', label: 'Vector3', description: '3D coordinates (x, y, z)' },
  { value: 'range', label: 'Range', description: 'Number with min/max slider' },
  { value: 'enum', label: 'Enum', description: 'Select from options' },
  { value: 'object', label: 'Object', description: 'Nested JSON object' },
]

export function VariableEditor({ variable, onSave, onCancel, direction }: VariableEditorProps) {
  const [name, setName] = useState(variable?.name || '')
  const [type, setType] = useState<VariableType>(variable?.type || 'string')
  const [varDirection, setVarDirection] = useState<VariableDirection>(
    variable?.direction || direction || 'input'
  )
  const [description, setDescription] = useState(variable?.description || '')
  const [required, setRequired] = useState(variable?.required || false)
  const [config, setConfig] = useState<Record<string, unknown>>(variable?.config || {})
  const [defaultValue, setDefaultValue] = useState<string>(
    variable?.defaultValue !== undefined ? JSON.stringify(variable.defaultValue) : ''
  )

  const handleSave = () => {
    let parsedDefault: unknown = undefined
    if (defaultValue) {
      try {
        parsedDefault = JSON.parse(defaultValue)
      } catch {
        parsedDefault = defaultValue // Use as string if not valid JSON
      }
    }

    onSave({
      name,
      type,
      direction: varDirection,
      description: description || undefined,
      required,
      config: Object.keys(config).length > 0 ? config : undefined,
      defaultValue: parsedDefault,
    })
  }

  // Render type-specific config fields
  const renderConfigFields = () => {
    switch (type) {
      case 'number':
      case 'range':
        return (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1">Min</label>
              <input
                type="number"
                value={(config.min as number) ?? ''}
                onChange={(e) => setConfig({ ...config, min: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Max</label>
              <input
                type="number"
                value={(config.max as number) ?? ''}
                onChange={(e) => setConfig({ ...config, max: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Step</label>
              <input
                type="number"
                value={(config.step as number) ?? ''}
                onChange={(e) => setConfig({ ...config, step: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )
      case 'color':
        return (
          <div>
            <label className="block text-sm mb-1">Format</label>
            <select
              value={(config.format as string) || 'hex'}
              onChange={(e) => setConfig({ ...config, format: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
            >
              <option value="hex">Hex (#ffffff)</option>
              <option value="rgb">RGB (rgb(255,255,255))</option>
              <option value="rgba">RGBA (rgba(255,255,255,1))</option>
              <option value="hsl">HSL (hsl(0,100%,50%))</option>
            </select>
          </div>
        )
      case 'enum':
        return (
          <div>
            <label className="block text-sm mb-1">Options (JSON array)</label>
            <textarea
              value={JSON.stringify(config.options || [], null, 2)}
              onChange={(e) => {
                try {
                  const options = JSON.parse(e.target.value)
                  setConfig({ ...config, options })
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={4}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded font-mono text-sm focus:outline-none focus:border-blue-500"
              placeholder='[{"value": "option1", "label": "Option 1"}]'
            />
          </div>
        )
      case 'string':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Min Length</label>
              <input
                type="number"
                value={(config.min_length as number) ?? ''}
                onChange={(e) => setConfig({ ...config, min_length: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Max Length</label>
              <input
                type="number"
                value={(config.max_length as number) ?? ''}
                onChange={(e) => setConfig({ ...config, max_length: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
          placeholder="variableName"
        />
        <p className="text-xs text-slate-500 mt-1">Maps to state key (letters, numbers, underscore only)</p>
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium mb-1">Type *</label>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as VariableType)
            setConfig({}) // Reset config when type changes
          }}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
        >
          {VARIABLE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label} - {t.description}
            </option>
          ))}
        </select>
      </div>

      {/* Direction */}
      {!direction && (
        <div>
          <label className="block text-sm font-medium mb-1">Direction *</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="input"
                checked={varDirection === 'input'}
                onChange={() => setVarDirection('input')}
                className="accent-blue-500"
              />
              <span>Input</span>
              <span className="text-xs text-slate-500">(values received)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="output"
                checked={varDirection === 'output'}
                onChange={() => setVarDirection('output')}
                className="accent-blue-500"
              />
              <span>Output</span>
              <span className="text-xs text-slate-500">(values produced)</span>
            </label>
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
          placeholder="Describe what this variable does..."
        />
      </div>

      {/* Required (inputs only) */}
      {varDirection === 'input' && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="accent-blue-500"
            />
            <span>Required</span>
            <span className="text-xs text-slate-500">(warn if missing from state)</span>
          </label>
        </div>
      )}

      {/* Type-specific config */}
      {renderConfigFields()}

      {/* Default Value */}
      <div>
        <label className="block text-sm font-medium mb-1">Default Value</label>
        <input
          type="text"
          value={defaultValue}
          onChange={(e) => setDefaultValue(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded font-mono focus:outline-none focus:border-blue-500"
          placeholder="JSON value or plain text"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Variable
        </button>
      </div>
    </div>
  )
}
