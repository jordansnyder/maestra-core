'use client'

import type { VariableDefinition } from '@/lib/types'

interface NumberControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: number) => void
  disabled?: boolean
}

export function NumberControl({ variable, value, onChange, disabled }: NumberControlProps) {
  const config = variable.config || {}
  const min = config.min as number | undefined
  const max = config.max as number | undefined
  const step = (config.step as number) ?? 1
  const unit = config.unit as string | undefined

  const numValue = typeof value === 'number' ? value : (variable.defaultValue as number) ?? 0

  const increment = () => {
    const newValue = numValue + step
    if (max === undefined || newValue <= max) {
      onChange(newValue)
    }
  }

  const decrement = () => {
    const newValue = numValue - step
    if (min === undefined || newValue >= min) {
      onChange(newValue)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={decrement}
        disabled={disabled || (min !== undefined && numValue <= min)}
        className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-lg text-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        -
      </button>
      <input
        type="number"
        value={numValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        disabled={disabled}
        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <button
        onClick={increment}
        disabled={disabled || (max !== undefined && numValue >= max)}
        className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-lg text-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        +
      </button>
      {unit && <span className="text-slate-400 ml-1">{unit}</span>}
    </div>
  )
}
