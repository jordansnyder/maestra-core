'use client'

import type { VariableDefinition, VariableDirection, ValidationWarning } from '@/lib/types'

interface VariableListProps {
  variables: VariableDefinition[]
  direction: VariableDirection
  currentState: Record<string, unknown>
  onEdit: (variable: VariableDefinition) => void
  onDelete: (variableName: string) => void
  validationWarnings?: ValidationWarning[]
}

const TYPE_ICONS: Record<string, string> = {
  string: 'Aa',
  number: '#',
  boolean: '?',
  array: '[]',
  color: '',
  vector2: 'xy',
  vector3: 'xyz',
  range: '<>',
  enum: '',
  object: '{}',
}

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-900/50 text-blue-400',
  number: 'bg-purple-900/50 text-purple-400',
  boolean: 'bg-orange-900/50 text-orange-400',
  array: 'bg-cyan-900/50 text-cyan-400',
  color: 'bg-pink-900/50 text-pink-400',
  vector2: 'bg-green-900/50 text-green-400',
  vector3: 'bg-green-900/50 text-green-400',
  range: 'bg-yellow-900/50 text-yellow-400',
  enum: 'bg-indigo-900/50 text-indigo-400',
  object: 'bg-slate-700 text-slate-300',
}

export function VariableList({
  variables,
  direction,
  currentState,
  onEdit,
  onDelete,
  validationWarnings = [],
}: VariableListProps) {
  const warningMap = new Map(validationWarnings.map((w) => [w.variable_name, w.message]))

  if (variables.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No {direction}s defined
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {variables.map((variable) => {
        const currentValue = currentState[variable.name]
        const warning = warningMap.get(variable.name)
        const hasValue = variable.name in currentState

        return (
          <div
            key={variable.name}
            className={`p-3 bg-slate-800/50 rounded-lg border ${
              warning ? 'border-yellow-600' : 'border-slate-700'
            } hover:border-slate-600 transition-colors`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {/* Type Icon */}
                <div className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs ${TYPE_COLORS[variable.type] || 'bg-slate-700'}`}>
                  {TYPE_ICONS[variable.type] || '?'}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium font-mono">{variable.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLORS[variable.type] || 'bg-slate-700'}`}>
                      {variable.type}
                    </span>
                    {variable.required && (
                      <span className="text-xs px-2 py-0.5 bg-red-900/50 text-red-400 rounded">
                        required
                      </span>
                    )}
                  </div>
                  {variable.description && (
                    <p className="text-sm text-slate-400 mt-1">{variable.description}</p>
                  )}

                  {/* Current Value */}
                  <div className="mt-2 text-sm">
                    <span className="text-slate-500">Current: </span>
                    {hasValue ? (
                      <span className="font-mono text-green-400">
                        {typeof currentValue === 'object'
                          ? JSON.stringify(currentValue)
                          : String(currentValue)}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">not set</span>
                    )}
                  </div>

                  {/* Default Value */}
                  {variable.defaultValue !== undefined && (
                    <div className="mt-1 text-sm">
                      <span className="text-slate-500">Default: </span>
                      <span className="font-mono text-slate-400">
                        {typeof variable.defaultValue === 'object'
                          ? JSON.stringify(variable.defaultValue)
                          : String(variable.defaultValue)}
                      </span>
                    </div>
                  )}

                  {/* Warning */}
                  {warning && (
                    <div className="mt-2 text-sm text-yellow-400 flex items-center gap-1">
                      <span>Warning:</span> {warning}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => onEdit(variable)}
                  className="px-2 py-1 text-sm hover:bg-slate-700 rounded transition-colors"
                  title="Edit"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(variable.name)}
                  className="px-2 py-1 text-sm hover:bg-red-900/50 text-red-400 rounded transition-colors"
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
