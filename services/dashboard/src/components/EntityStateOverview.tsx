'use client'

import { useState } from 'react'
import type { Entity, VariableDefinition, VariableType, EntityVariables } from '@/lib/types'
import { entitiesApi } from '@/lib/api'
import {
  RangeControl,
  NumberControl,
  BooleanControl,
  StringControl,
  ColorControl,
  EnumControl,
  VectorControl,
  JsonControl,
} from './variable-controls'

interface EntityStateOverviewProps {
  entity: Entity
  onStateChange?: () => void
}

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-500/20 text-blue-400',
  number: 'bg-purple-500/20 text-purple-400',
  boolean: 'bg-orange-500/20 text-orange-400',
  array: 'bg-cyan-500/20 text-cyan-400',
  color: 'bg-pink-500/20 text-pink-400',
  vector2: 'bg-green-500/20 text-green-400',
  vector3: 'bg-green-500/20 text-green-400',
  range: 'bg-yellow-500/20 text-yellow-400',
  enum: 'bg-indigo-500/20 text-indigo-400',
  object: 'bg-slate-500/20 text-slate-300',
}

function inferType(value: unknown): VariableType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return 'color'
    return 'string'
  }
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object' && value !== null) {
    if ('x' in value && 'y' in value) {
      return 'z' in value ? 'vector3' : 'vector2'
    }
    return 'object'
  }
  return 'string'
}

function buildSyntheticVariable(key: string, value: unknown): VariableDefinition {
  return {
    name: key,
    type: inferType(value),
    direction: 'input',
    config: {},
  }
}

function needsWideLayout(type: VariableType): boolean {
  return type === 'object' || type === 'array' || type === 'vector2' || type === 'vector3'
}

export function EntityStateOverview({ entity, onStateChange }: EntityStateOverviewProps) {
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const variables = (entity.metadata?.variables as EntityVariables) || { inputs: [], outputs: [] }
  const varMap = new Map<string, VariableDefinition>()
  for (const v of [...variables.inputs, ...variables.outputs]) {
    varMap.set(v.name, v)
  }

  const stateEntries = Object.entries(entity.state)

  const handleValueChange = async (key: string, newValue: unknown) => {
    setUpdating(key)
    setError(null)
    try {
      await entitiesApi.updateState(entity.id, {
        state: { [key]: newValue },
        source: 'dashboard',
      })
      onStateChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update state')
    } finally {
      setUpdating(null)
    }
  }

  const getVariableForKey = (key: string, value: unknown): VariableDefinition => {
    return varMap.get(key) || buildSyntheticVariable(key, value)
  }

  const renderControl = (variable: VariableDefinition, value: unknown, key: string) => {
    const isUpdating = updating === key
    const commonProps = {
      variable,
      value,
      disabled: isUpdating,
      compact: true,
    }

    switch (variable.type) {
      case 'range':
        return <RangeControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'number':
        return <NumberControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'boolean':
        return <BooleanControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'color':
        return <ColorControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'enum':
        return <EnumControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'vector2':
      case 'vector3':
        return <VectorControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'array':
      case 'object':
        return <JsonControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
      case 'string':
      default:
        return <StringControl {...commonProps} onChange={(v) => handleValueChange(key, v)} />
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">State</h2>
          <span className="text-xs text-slate-500">
            {stateEntries.length} field{stateEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          Updated {new Date(entity.state_updated_at).toLocaleString()}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="divide-y divide-slate-700/50">
        {stateEntries.map(([key, value]) => {
          const variable = getVariableForKey(key, value)
          const isUpdating = updating === key
          const wide = needsWideLayout(variable.type)

          return (
            <div
              key={key}
              className={`${isUpdating ? 'bg-blue-500/5' : ''}`}
            >
              {wide ? (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm text-slate-200">{key}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${TYPE_COLORS[variable.type] || 'bg-slate-700 text-slate-400'}`}>
                      {variable.type}
                    </span>
                    {isUpdating && (
                      <span className="text-xs text-blue-400 animate-pulse">saving...</span>
                    )}
                  </div>
                  {variable.description && (
                    <p className="text-xs text-slate-500 mb-2">{variable.description}</p>
                  )}
                  {renderControl(variable, value, key)}
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-[44px]">
                  <span className="font-mono text-sm text-slate-200 truncate w-28 sm:w-44 shrink-0" title={key}>{key}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${TYPE_COLORS[variable.type] || 'bg-slate-700 text-slate-400'}`}>
                    {variable.type}
                  </span>
                  <div className="flex-1 flex items-center min-w-0">
                    {renderControl(variable, value, key)}
                  </div>
                  {isUpdating && (
                    <span className="text-xs text-blue-400 animate-pulse shrink-0">saving...</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
