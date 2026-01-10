'use client'

import { useState, useEffect } from 'react'
import type { VariableDefinition } from '@/lib/types'

interface JsonControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

export function JsonControl({ variable, value, onChange, disabled }: JsonControlProps) {
  const isArray = variable.type === 'array'
  const placeholder = isArray ? '[]' : '{}'

  const currentValue = value ?? variable.defaultValue ?? (isArray ? [] : {})
  const [text, setText] = useState(() => JSON.stringify(currentValue, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(value ?? (isArray ? [] : {}), null, 2))
  }, [value, isArray])

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text)
      if (isArray && !Array.isArray(parsed)) {
        setError('Value must be an array')
        return
      }
      if (!isArray && (Array.isArray(parsed) || typeof parsed !== 'object')) {
        setError('Value must be an object')
        return
      }
      setError(null)
      onChange(parsed)
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={4}
        className={`w-full px-3 py-2 bg-slate-900 border rounded-lg font-mono text-sm focus:outline-none disabled:opacity-50 ${
          error ? 'border-red-500' : 'border-slate-700 focus:border-blue-500'
        }`}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
