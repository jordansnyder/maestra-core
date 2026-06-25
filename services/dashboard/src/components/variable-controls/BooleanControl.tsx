'use client'

import type { VariableDefinition } from '@/lib/types'

interface BooleanControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: boolean) => void
  disabled?: boolean
  compact?: boolean
}

export function BooleanControl({ variable, value, onChange, disabled, compact }: BooleanControlProps) {
  const config = variable.config || {}
  const trueLabel = (config.true_label as string) || 'On'
  const falseLabel = (config.false_label as string) || 'Off'

  const boolValue = typeof value === 'boolean' ? value : (variable.defaultValue as boolean) ?? false

  if (compact) {
    return (
      <button
        onClick={() => onChange(!boolValue)}
        disabled={disabled}
        className={`
          px-3 py-1 rounded-md text-xs font-medium transition-all
          ${boolValue
            ? 'bg-green-600/80 text-fg'
            : 'bg-surface-2 text-fg-muted'}
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {boolValue ? trueLabel : falseLabel}
      </button>
    )
  }

  return (
    <button
      onClick={() => onChange(!boolValue)}
      disabled={disabled}
      className={`
        relative w-full h-12 rounded-lg font-medium transition-all
        ${boolValue
          ? 'bg-green-600 hover:bg-green-500 text-fg'
          : 'bg-surface-2 hover:bg-surface-2 text-fg'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <span className="flex items-center justify-center gap-2">
        <span className={`w-3 h-3 rounded-full ${boolValue ? 'bg-green-300' : 'bg-fg-subtle'}`} />
        {boolValue ? trueLabel : falseLabel}
      </span>
    </button>
  )
}
