'use client'

import type { VariableDefinition } from '@/lib/types'

interface BooleanControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function BooleanControl({ variable, value, onChange, disabled }: BooleanControlProps) {
  const config = variable.config || {}
  const trueLabel = (config.true_label as string) || 'On'
  const falseLabel = (config.false_label as string) || 'Off'

  const boolValue = typeof value === 'boolean' ? value : (variable.defaultValue as boolean) ?? false

  return (
    <button
      onClick={() => onChange(!boolValue)}
      disabled={disabled}
      className={`
        relative w-full h-12 rounded-lg font-medium transition-all
        ${boolValue
          ? 'bg-green-600 hover:bg-green-500 text-white'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <span className="flex items-center justify-center gap-2">
        <span className={`w-3 h-3 rounded-full ${boolValue ? 'bg-green-300' : 'bg-slate-500'}`} />
        {boolValue ? trueLabel : falseLabel}
      </span>
    </button>
  )
}
