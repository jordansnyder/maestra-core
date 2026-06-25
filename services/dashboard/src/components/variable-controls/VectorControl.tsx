'use client'

import { useState } from 'react'
import type { VariableDefinition } from '@/lib/types'

interface VectorValue {
  x: number
  y: number
  z?: number
}

interface VectorControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: VectorValue) => void
  disabled?: boolean
  compact?: boolean
}

export function VectorControl({ variable, value, onChange, disabled, compact }: VectorControlProps) {
  const config = variable.config || {}
  const is3D = variable.type === 'vector3'
  const xLabel = (config.x_label as string) || 'X'
  const yLabel = (config.y_label as string) || 'Y'
  const zLabel = (config.z_label as string) || 'Z'
  const min = config.min as number | undefined
  const max = config.max as number | undefined

  const defaultVector: VectorValue = is3D
    ? { x: 0, y: 0, z: 0 }
    : { x: 0, y: 0 }

  const vectorValue = (
    typeof value === 'object' && value !== null && 'x' in value && 'y' in value
      ? value as VectorValue
      : (variable.defaultValue as VectorValue) ?? defaultVector
  )

  const [localValue, setLocalValue] = useState(vectorValue)

  const handleChange = (axis: 'x' | 'y' | 'z', val: number) => {
    const newValue = { ...localValue, [axis]: val }
    setLocalValue(newValue)
  }

  const handleBlur = () => {
    onChange(localValue)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs font-mono">
        <span className="text-fg-subtle">{xLabel}:</span>
        <input type="number" value={localValue.x} min={min} max={max}
          onChange={(e) => handleChange('x', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
          disabled={disabled} className="w-14 px-1 py-0.5 bg-surface-0 border border-edge rounded text-center focus:outline-none focus:border-accent disabled:opacity-50" />
        <span className="text-fg-subtle">{yLabel}:</span>
        <input type="number" value={localValue.y} min={min} max={max}
          onChange={(e) => handleChange('y', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
          disabled={disabled} className="w-14 px-1 py-0.5 bg-surface-0 border border-edge rounded text-center focus:outline-none focus:border-accent disabled:opacity-50" />
        {is3D && (
          <>
            <span className="text-fg-subtle">{zLabel}:</span>
            <input type="number" value={localValue.z ?? 0} min={min} max={max}
              onChange={(e) => handleChange('z', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
              disabled={disabled} className="w-14 px-1 py-0.5 bg-surface-0 border border-edge rounded text-center focus:outline-none focus:border-accent disabled:opacity-50" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`grid gap-3 ${is3D ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <div>
        <label className="block text-xs text-fg-subtle mb-1">{xLabel}</label>
        <input type="number" value={localValue.x} min={min} max={max}
          onChange={(e) => handleChange('x', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
          disabled={disabled} className="w-full px-3 py-2 bg-surface-0 border border-edge rounded-lg text-center font-mono focus:outline-none focus:border-accent disabled:opacity-50" />
      </div>
      <div>
        <label className="block text-xs text-fg-subtle mb-1">{yLabel}</label>
        <input type="number" value={localValue.y} min={min} max={max}
          onChange={(e) => handleChange('y', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
          disabled={disabled} className="w-full px-3 py-2 bg-surface-0 border border-edge rounded-lg text-center font-mono focus:outline-none focus:border-accent disabled:opacity-50" />
      </div>
      {is3D && (
        <div>
          <label className="block text-xs text-fg-subtle mb-1">{zLabel}</label>
          <input type="number" value={localValue.z ?? 0} min={min} max={max}
            onChange={(e) => handleChange('z', parseFloat(e.target.value) || 0)} onBlur={handleBlur}
            disabled={disabled} className="w-full px-3 py-2 bg-surface-0 border border-edge rounded-lg text-center font-mono focus:outline-none focus:border-accent disabled:opacity-50" />
        </div>
      )}
    </div>
  )
}
