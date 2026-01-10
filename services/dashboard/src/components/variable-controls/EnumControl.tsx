'use client'

import type { VariableDefinition } from '@/lib/types'

interface EnumOption {
  value: string
  label: string
}

interface EnumControlProps {
  variable: VariableDefinition
  value: unknown
  onChange: (value: string) => void
  disabled?: boolean
}

export function EnumControl({ variable, value, onChange, disabled }: EnumControlProps) {
  const config = variable.config || {}
  const options = (config.options as EnumOption[]) || []

  const strValue = typeof value === 'string' ? value : (variable.defaultValue as string) ?? ''

  return (
    <select
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
        backgroundSize: '1.5rem',
      }}
    >
      <option value="" disabled>
        Select an option...
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
