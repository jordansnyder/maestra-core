'use client'

import type { VariableDefinition } from '@/lib/types'

interface RangeControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: number) => void
  disabled?: boolean
}

export function RangeControl({ variable, value, onChange, disabled }: RangeControlProps) {
  const config = variable.config || {}
  const min = (config.min as number) ?? 0
  const max = (config.max as number) ?? 100
  const step = (config.step as number) ?? 1
  const unit = config.unit as string | undefined

  const numValue = typeof value === 'number' ? value : (variable.defaultValue as number) ?? min

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {min} - {max}{unit ? ` ${unit}` : ''}
        </span>
        <span className="font-mono text-lg text-white">
          {numValue}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}
