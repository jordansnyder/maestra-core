'use client'

import { useState } from 'react'
import type { Entity, VariableDefinition, EntityVariables } from '@/lib/types'
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

interface StateTestPanelProps {
  entity: Entity
  onStateChange?: () => void
}

const TYPE_COLORS: Record<string, string> = {
  string: 'text-blue-400',
  number: 'text-purple-400',
  boolean: 'text-orange-400',
  array: 'text-cyan-400',
  color: 'text-pink-400',
  vector2: 'text-green-400',
  vector3: 'text-green-400',
  range: 'text-yellow-400',
  enum: 'text-indigo-400',
  object: 'text-slate-300',
}

export function StateTestPanel({ entity, onStateChange }: StateTestPanelProps) {
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const variables = (entity.metadata?.variables as EntityVariables) || { inputs: [], outputs: [] }

  const handleValueChange = async (variable: VariableDefinition, newValue: unknown) => {
    setUpdating(variable.name)
    setError(null)
    try {
      await entitiesApi.updateState(entity.id, {
        state: { [variable.name]: newValue },
        source: 'dashboard-test',
      })
      onStateChange?.()
    } catch (err) {
      console.error('Failed to update state:', err)
      setError(err instanceof Error ? err.message : 'Failed to update state')
    } finally {
      setUpdating(null)
    }
  }

  const handleResetDefaults = async () => {
    setUpdating('__reset__')
    setError(null)
    try {
      const defaults: Record<string, unknown> = {}
      for (const v of variables.inputs) {
        if (v.defaultValue !== undefined) {
          defaults[v.name] = v.defaultValue
        }
      }
      if (Object.keys(defaults).length > 0) {
        await entitiesApi.updateState(entity.id, {
          state: defaults,
          source: 'dashboard-test',
        })
        onStateChange?.()
      }
    } catch (err) {
      console.error('Failed to reset defaults:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset defaults')
    } finally {
      setUpdating(null)
    }
  }

  const renderControl = (variable: VariableDefinition) => {
    const value = entity.state[variable.name]
    const isUpdating = updating === variable.name

    const commonProps = {
      variable,
      value,
      disabled: isUpdating || updating === '__reset__',
    }

    switch (variable.type) {
      case 'range':
        return <RangeControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'number':
        return <NumberControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'boolean':
        return <BooleanControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'string':
        return <StringControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'color':
        return <ColorControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'enum':
        return <EnumControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'vector2':
      case 'vector3':
        return <VectorControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      case 'array':
      case 'object':
        return <JsonControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
      default:
        return <StringControl {...commonProps} onChange={(v) => handleValueChange(variable, v)} />
    }
  }

  const renderVariableCard = (variable: VariableDefinition, isInput: boolean) => {
    const value = entity.state[variable.name]
    const isUpdating = updating === variable.name

    return (
      <div
        key={variable.name}
        className={`p-4 bg-slate-800/50 rounded-lg border border-slate-700 ${
          isUpdating ? 'ring-2 ring-blue-500' : ''
        }`}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium font-mono">{variable.name}</span>
              <span className={`text-xs ${TYPE_COLORS[variable.type] || 'text-slate-400'}`}>
                {variable.type}
              </span>
              {isUpdating && (
                <span className="text-xs text-blue-400 animate-pulse">updating...</span>
              )}
            </div>
            {variable.description && (
              <p className="text-sm text-slate-400 mt-1">{variable.description}</p>
            )}
          </div>
          {!isInput && (
            <span className="text-xs bg-slate-700 px-2 py-1 rounded">read-only</span>
          )}
        </div>

        {isInput ? (
          renderControl(variable)
        ) : (
          <div className="font-mono text-lg text-slate-300 bg-slate-900 px-3 py-2 rounded">
            {value === undefined ? (
              <span className="text-slate-500 italic">not set</span>
            ) : typeof value === 'object' ? (
              JSON.stringify(value)
            ) : (
              String(value)
            )}
          </div>
        )}
      </div>
    )
  }

  const hasDefaults = variables.inputs.some((v) => v.defaultValue !== undefined)

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Test Controls</h3>
          <p className="text-sm text-slate-400">
            Interact with entity state using type-appropriate controls
          </p>
        </div>
        {hasDefaults && (
          <button
            onClick={handleResetDefaults}
            disabled={updating !== null}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Reset to Defaults
          </button>
        )}
      </div>

      {/* Input Variables */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
          <span className="text-green-400">Input</span> Variables
          <span className="text-sm text-slate-500 font-normal">({variables.inputs.length})</span>
        </h4>

        {variables.inputs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No input variables defined. Add variables in Define mode to test them here.
          </div>
        ) : (
          <div className="space-y-4">
            {variables.inputs.map((v) => renderVariableCard(v, true))}
          </div>
        )}
      </div>

      {/* Output Variables */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
          <span className="text-blue-400">Output</span> Variables
          <span className="text-sm text-slate-500 font-normal">({variables.outputs.length})</span>
        </h4>

        {variables.outputs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No output variables defined.
          </div>
        ) : (
          <div className="space-y-4">
            {variables.outputs.map((v) => renderVariableCard(v, false))}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="text-sm text-slate-500 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <p className="font-medium text-slate-400 mb-2">About Test Controls</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Changes are sent immediately to the entity via the API</li>
          <li>Input variables have interactive controls based on their type</li>
          <li>Output variables are displayed read-only</li>
          <li>State changes are broadcast to connected devices via MQTT/NATS</li>
        </ul>
      </div>
    </div>
  )
}
