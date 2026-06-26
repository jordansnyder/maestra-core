'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { VariableDefinition, VariableDirection, EntityVariables } from '@/lib/types'
import { InlineVariableEditor } from './InlineVariableEditor'
import {
  RangeControl, NumberControl, BooleanControl, StringControl,
  ColorControl, EnumControl, VectorControl, JsonControl,
} from './variable-controls'
import { Search, Plus, Settings, Trash2 } from 'lucide-react'

interface UnifiedVariablesPanelProps {
  entityId: string
  entitySlug: string
  variables: EntityVariables
  state: Record<string, unknown>
  onStateChange: (key: string, value: unknown) => void
  onVariablesChange: (variables: EntityVariables) => void
}

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-surface-2',
  number: 'bg-accent/60',
  boolean: 'bg-green-600/60',
  range: 'bg-purple-600/60',
  color: 'bg-pink-600/60',
  enum: 'bg-amber-600/60',
  vector2: 'bg-cyan-600/60',
  vector3: 'bg-cyan-600/60',
  array: 'bg-orange-600/60',
  object: 'bg-orange-600/60',
}

function getValueFillPercent(variable: VariableDefinition, value: unknown): number | null {
  if (variable.type !== 'range' && variable.type !== 'number') return null
  const config = variable.config || {}
  const min = (config.min as number) ?? 0
  const max = (config.max as number) ?? 100
  if (max <= min) return null
  const numValue = typeof value === 'number' ? value : 0
  return Math.max(0, Math.min(100, ((numValue - min) / (max - min)) * 100))
}

function renderCompactControl(
  variable: VariableDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  readOnly: boolean
) {
  if (readOnly) {
    const display = value === undefined || value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return <span className="font-mono text-xs text-fg-muted truncate max-w-[150px]">{display}</span>
  }

  const props = { variable, value, onChange: onChange as never, disabled: false, compact: true }

  switch (variable.type) {
    case 'range': return <RangeControl {...props} onChange={v => onChange(v)} />
    case 'number': return <NumberControl {...props} onChange={v => onChange(v)} />
    case 'boolean': return <BooleanControl {...props} onChange={v => onChange(v)} />
    case 'string': return <StringControl {...props} onChange={v => onChange(v)} />
    case 'color': return <ColorControl {...props} onChange={v => onChange(v)} />
    case 'enum': return <EnumControl {...props} onChange={v => onChange(v)} />
    case 'vector2':
    case 'vector3': return <VectorControl {...props} onChange={v => onChange(v)} />
    case 'array':
    case 'object': return <JsonControl {...props} onChange={v => onChange(v)} />
    default: return <span className="text-xs text-fg-subtle">—</span>
  }
}

export function UnifiedVariablesPanel({
  entityId, entitySlug, variables, state, onStateChange, onVariablesChange,
}: UnifiedVariablesPanelProps) {
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'input' | 'output'>('all')
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set())
  const [addingNew, setAddingNew] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Combine inputs and outputs into one list
  const allVariables: (VariableDefinition & { _direction: VariableDirection })[] = [
    ...variables.inputs.map(v => ({ ...v, _direction: 'input' as const })),
    ...variables.outputs.map(v => ({ ...v, _direction: 'output' as const })),
  ]

  // Filter
  const filtered = allVariables.filter(v => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false
    if (directionFilter !== 'all' && v._direction !== directionFilter) return false
    return true
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (search) { setSearch(''); searchRef.current?.blur() }
        else if (expandedVars.size > 0) setExpandedVars(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [search, expandedVars])

  const toggleExpanded = (name: string) => {
    setExpandedVars(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleDeleteVariable = useCallback((varName: string, direction: VariableDirection) => {
    const key = direction === 'input' ? 'inputs' : 'outputs'
    const updated = {
      ...variables,
      [key]: variables[key].filter(v => v.name !== varName),
    }
    onVariablesChange(updated)
    setExpandedVars(prev => { const next = new Set(prev); next.delete(varName); return next })
  }, [variables, onVariablesChange])

  const handleSaveVariable = useCallback((original: VariableDefinition | undefined, updated: VariableDefinition) => {
    const newVars = { ...variables }

    if (original) {
      // Editing existing
      const oldKey = original.direction === 'input' ? 'inputs' : 'outputs'
      const newKey = updated.direction === 'input' ? 'inputs' : 'outputs'

      if (oldKey === newKey) {
        newVars[oldKey] = newVars[oldKey].map(v => v.name === original.name ? updated : v)
      } else {
        newVars[oldKey] = newVars[oldKey].filter(v => v.name !== original.name)
        newVars[newKey] = [...newVars[newKey], updated]
      }
    } else {
      // Adding new
      const key = updated.direction === 'input' ? 'inputs' : 'outputs'
      newVars[key] = [...newVars[key], updated]
    }

    onVariablesChange(newVars)
    setExpandedVars(prev => { const next = new Set(prev); next.delete(original?.name || ''); return next })
    setAddingNew(false)
  }, [variables, onVariablesChange])

  const inputCount = variables.inputs.length
  const outputCount = variables.outputs.length

  return (
    <div className="bg-surface-1 border border-edge rounded-lg" role="table" aria-label="Entity variables">
      {/* Header */}
      <div className="px-4 py-3 border-b border-edge">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search variables... ( / )"
              aria-label="Search variables"
              className="w-full pl-8 pr-3 py-1.5 bg-surface-0 border border-edge rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-1 bg-surface-0 rounded p-0.5" role="tablist">
            {(['all', 'input', 'output'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDirectionFilter(f)}
                role="tab"
                aria-selected={directionFilter === f}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  directionFilter === f ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {f === 'all' ? `All (${inputCount + outputCount})` : f === 'input' ? `In (${inputCount})` : `Out (${outputCount})`}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setSearch(''); setAddingNew(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </div>

      {/* Variable Rows */}
      <div className="divide-y divide-edge/50">
        {filtered.length === 0 && !addingNew && (
          <div className="px-4 py-12 text-center">
            {allVariables.length === 0 ? (
              <div>
                <p className="text-fg-muted mb-1">No variables defined</p>
                <p className="text-xs text-fg-subtle mb-4">Variables let you control this entity's state from the dashboard, SDKs, and connected devices.</p>
                <button
                  onClick={() => setAddingNew(true)}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium transition-colors"
                >
                  Add your first variable
                </button>
              </div>
            ) : (
              <p className="text-fg-subtle text-sm">
                No variables match &quot;{search}&quot;.{' '}
                <button onClick={() => setSearch('')} className="text-accent hover:text-accent">
                  Clear search
                </button>
              </p>
            )}
          </div>
        )}

        {filtered.map(variable => {
          const isInput = variable._direction === 'input'
          const isExpanded = expandedVars.has(variable.name)
          const fillPercent = getValueFillPercent(variable, state[variable.name])
          const boolValue = variable.type === 'boolean' ? state[variable.name] : null

          return (
            <div key={`${variable._direction}-${variable.name}`}>
              {/* Row */}
              <div
                className={`relative flex items-center gap-3 px-4 h-[44px] group ${
                  !isInput ? 'bg-surface-1/50' : ''
                }`}
                style={fillPercent !== null ? {
                  background: `linear-gradient(to right, rgb(59 130 246 / 0.08) ${fillPercent}%, transparent ${fillPercent}%)`
                } : undefined}
                role="row"
              >
                {/* Direction dot */}
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
                    variable.type === 'color' && typeof state[variable.name] === 'string'
                      ? '' // colored by style below
                      : variable.type === 'boolean' && boolValue === true
                        ? 'bg-green-400'
                        : variable.type === 'boolean' && boolValue === false
                          ? 'bg-surface-2'
                          : isInput ? 'bg-green-400/70' : 'bg-accent/70'
                  }`}
                  style={
                    variable.type === 'color' && typeof state[variable.name] === 'string'
                      ? { backgroundColor: state[variable.name] as string }
                      : undefined
                  }
                  aria-label={`${variable.name}: ${variable._direction}, value ${state[variable.name] ?? 'undefined'}`}
                />

                {/* Name */}
                <span className="font-medium text-sm text-fg truncate w-28 shrink-0">{variable.name}</span>

                {/* Type badge */}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-fg/80 shrink-0 ${TYPE_COLORS[variable.type] || 'bg-surface-2'}`}>
                  {variable.type}
                </span>

                {/* Control */}
                <div className="flex-1 flex items-center min-w-0">
                  {renderCompactControl(variable, state[variable.name], (v) => onStateChange(variable.name, v), !isInput)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => toggleExpanded(variable.name)}
                    aria-expanded={isExpanded}
                    className="p-1 text-fg-subtle hover:text-fg rounded transition-colors"
                    title="Edit definition"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteVariable(variable.name, variable._direction)}
                    className="p-1 text-fg-subtle hover:text-red-400 rounded transition-colors"
                    title="Delete variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline Editor (expanded) */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-1">
                  <InlineVariableEditor
                    variable={variable}
                    onSave={(updated) => handleSaveVariable(variable, updated)}
                    onCancel={() => toggleExpanded(variable.name)}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Add new variable form */}
        {addingNew && (
          <div className="px-4 py-3">
            <InlineVariableEditor
              defaultDirection="input"
              onSave={(v) => handleSaveVariable(undefined, v)}
              onCancel={() => setAddingNew(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
