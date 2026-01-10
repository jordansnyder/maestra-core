'use client'

import { useState } from 'react'
import type { VariableDefinition } from '@/lib/types'

interface StringControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: string) => void
  disabled?: boolean
}

export function StringControl({ variable, value, onChange, disabled }: StringControlProps) {
  const config = variable.config || {}
  const maxLength = config.max_length as number | undefined

  const strValue = typeof value === 'string' ? value : (variable.defaultValue as string) ?? ''
  const [localValue, setLocalValue] = useState(strValue)

  const handleBlur = () => {
    if (localValue !== strValue) {
      onChange(localValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onChange(localValue)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={variable.description || 'Enter text...'}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('')
            onChange('')
          }}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 disabled:opacity-50"
        >
          x
        </button>
      )}
    </div>
  )
}
