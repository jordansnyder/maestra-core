'use client'

import { useState } from 'react'
import type { VariableDefinition } from '@/lib/types'

interface ColorControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: string) => void
  disabled?: boolean
}

export function ColorControl({ variable, value, onChange, disabled }: ColorControlProps) {
  const strValue = typeof value === 'string' ? value : (variable.defaultValue as string) ?? '#000000'
  const [localValue, setLocalValue] = useState(strValue)

  // Normalize color to hex for the color picker
  const toHex = (color: string): string => {
    if (color.startsWith('#')) return color.slice(0, 7)
    return '#000000'
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setLocalValue(newColor)
    onChange(newColor)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value)
  }

  const handleTextBlur = () => {
    if (localValue !== strValue) {
      onChange(localValue)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={toHex(localValue)}
          onChange={handleColorChange}
          disabled={disabled}
          className="w-12 h-12 rounded-lg cursor-pointer border-2 border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      <input
        type="text"
        value={localValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        disabled={disabled}
        placeholder="#000000"
        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <div
        className="w-12 h-12 rounded-lg border border-slate-600"
        style={{ backgroundColor: localValue }}
      />
    </div>
  )
}
