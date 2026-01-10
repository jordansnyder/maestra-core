'use client'

import { useState, useEffect } from 'react'
import type { Entity, EntityVariables, VariableDefinition, ValidationWarning } from '@/lib/types'
import { entitiesApi } from '@/lib/api'
import { VariableEditor } from './VariableEditor'
import { VariableList } from './VariableList'

interface EntityVariablesPanelProps {
  entity: Entity
  onVariablesChange?: () => void
}

export function EntityVariablesPanel({ entity, onVariablesChange }: EntityVariablesPanelProps) {
  const [variables, setVariables] = useState<EntityVariables>(() => {
    const vars = entity.metadata?.variables as EntityVariables | undefined
    return vars || { inputs: [], outputs: [] }
  })
  const [editing, setEditing] = useState<VariableDefinition | null>(null)
  const [addingDirection, setAddingDirection] = useState<'input' | 'output' | null>(null)
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validate on mount and when state changes
  useEffect(() => {
    validateVariables()
  }, [entity.state])

  const validateVariables = async () => {
    try {
      const result = await entitiesApi.validateVariables(entity.id)
      setValidationWarnings(result.warnings)
    } catch {
      // Validation endpoint may not exist yet or entity has no variables
    }
  }

  const handleSaveVariable = async (variable: VariableDefinition) => {
    setLoading(true)
    setError(null)
    try {
      const newVariables = { ...variables }
      const targetList = variable.direction === 'input' ? 'inputs' : 'outputs'

      // Remove from both lists first (in case direction changed or updating existing)
      newVariables.inputs = newVariables.inputs.filter((v) => v.name !== variable.name)
      newVariables.outputs = newVariables.outputs.filter((v) => v.name !== variable.name)

      // Add to correct list
      newVariables[targetList] = [...newVariables[targetList], variable]

      await entitiesApi.setVariables(entity.id, newVariables)
      setVariables(newVariables)
      onVariablesChange?.()
      setEditing(null)
      setAddingDirection(null)
      validateVariables()
    } catch (err) {
      console.error('Failed to save variable:', err)
      setError(err instanceof Error ? err.message : 'Failed to save variable')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVariable = async (variableName: string) => {
    if (!confirm(`Delete variable "${variableName}"?`)) return

    setLoading(true)
    setError(null)
    try {
      await entitiesApi.deleteVariable(entity.id, variableName)
      const newVariables = {
        inputs: variables.inputs.filter((v) => v.name !== variableName),
        outputs: variables.outputs.filter((v) => v.name !== variableName),
      }
      setVariables(newVariables)
      onVariablesChange?.()
    } catch (err) {
      console.error('Failed to delete variable:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete variable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Inputs Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="text-green-400">Input</span> Variables
            <span className="text-sm text-slate-500 font-normal">({variables.inputs.length})</span>
          </h3>
          <button
            onClick={() => setAddingDirection('input')}
            disabled={loading}
            className="px-3 py-1 bg-green-900/50 hover:bg-green-800 text-green-400 rounded text-sm transition-colors disabled:opacity-50"
          >
            + Add Input
          </button>
        </div>

        <VariableList
          variables={variables.inputs}
          direction="input"
          currentState={entity.state}
          onEdit={setEditing}
          onDelete={handleDeleteVariable}
          validationWarnings={validationWarnings}
        />
      </div>

      {/* Outputs Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="text-blue-400">Output</span> Variables
            <span className="text-sm text-slate-500 font-normal">({variables.outputs.length})</span>
          </h3>
          <button
            onClick={() => setAddingDirection('output')}
            disabled={loading}
            className="px-3 py-1 bg-blue-900/50 hover:bg-blue-800 text-blue-400 rounded text-sm transition-colors disabled:opacity-50"
          >
            + Add Output
          </button>
        </div>

        <VariableList
          variables={variables.outputs}
          direction="output"
          currentState={entity.state}
          onEdit={setEditing}
          onDelete={handleDeleteVariable}
          validationWarnings={validationWarnings}
        />
      </div>

      {/* Editor Modal */}
      {(editing || addingDirection) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              {editing ? 'Edit Variable' : 'Add Variable'}
            </h3>
            <VariableEditor
              variable={editing || undefined}
              direction={addingDirection || undefined}
              onSave={handleSaveVariable}
              onCancel={() => {
                setEditing(null)
                setAddingDirection(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Validation Summary */}
      {validationWarnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-400 mb-2">
            Validation Warnings ({validationWarnings.length})
          </h4>
          <ul className="text-sm space-y-1">
            {validationWarnings.map((w, i) => (
              <li key={i} className="text-yellow-200">
                <span className="font-mono">{w.variable_name}</span>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Help text */}
      <div className="text-sm text-slate-500 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <p className="font-medium text-slate-400 mb-2">About Variables</p>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="text-green-400">Inputs</span>: Values this entity expects to receive (e.g., brightness, color, mode)</li>
          <li><span className="text-blue-400">Outputs</span>: Values this entity produces (e.g., temperature, status, sensor readings)</li>
          <li>Variable names map directly to state keys</li>
          <li>Validation warnings appear when state values don&apos;t match expected types</li>
        </ul>
      </div>
    </div>
  )
}
