'use client'

import { useState, useEffect } from 'react'
import type { Device, Entity, DeviceApproval } from '@/lib/types'
import { entitiesApi } from '@/lib/api'
import { X, Plus, Trash2 } from 'lucide-react'

interface ApproveDeviceModalProps {
  device: Device
  onConfirm: (device: Device, approval: DeviceApproval) => void
  onCancel: () => void
}

export function ApproveDeviceModal({ device, onConfirm, onCancel }: ApproveDeviceModalProps) {
  const [name, setName] = useState(device.name)
  const [entityId, setEntityId] = useState('')
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([])
  const [entities, setEntities] = useState<Entity[]>([])

  useEffect(() => {
    entitiesApi.list().then(setEntities).catch(() => {})
  }, [])

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...envVars]
    updated[index][field] = val
    setEnvVars(updated)
  }

  const handleSubmit = () => {
    const approval: DeviceApproval = {}
    if (name !== device.name) approval.name = name
    if (entityId) approval.entity_id = entityId
    const validEnvVars = envVars.filter(e => e.key.trim())
    if (validEnvVars.length > 0) {
      approval.env_vars = Object.fromEntries(validEnvVars.map(e => [e.key, e.value]))
    }
    onConfirm(device, approval)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Approve Device</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Device Info */}
          <div className="bg-slate-900/50 rounded-lg p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500">Hardware ID:</span>
                <p className="text-slate-300 font-mono text-xs mt-0.5">{device.hardware_id}</p>
              </div>
              <div>
                <span className="text-slate-500">Type:</span>
                <p className="text-slate-300 mt-0.5">{device.device_type.replace('_', ' ')}</p>
              </div>
              {device.ip_address && (
                <div>
                  <span className="text-slate-500">IP Address:</span>
                  <p className="text-slate-300 font-mono text-xs mt-0.5">{device.ip_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Device Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Device Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="Device name"
            />
          </div>

          {/* Entity Binding */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Bind to Entity <span className="text-slate-500">(optional)</span>
            </label>
            <select
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">None</option>
              {entities.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.path ? `${entity.path} (${entity.name})` : entity.name}
                </option>
              ))}
            </select>
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-300">
                Environment Variables <span className="text-slate-500">(optional)</span>
              </label>
              <button
                onClick={addEnvVar}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            {envVars.length > 0 ? (
              <div className="space-y-2">
                {envVars.map((env, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={env.key}
                      onChange={e => updateEnvVar(i, 'key', e.target.value)}
                      placeholder="KEY"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-slate-500">=</span>
                    <input
                      type="text"
                      value={env.value}
                      onChange={e => updateEnvVar(i, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => removeEnvVar(i)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No environment variables configured.</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
          >
            Approve & Configure
          </button>
        </div>
      </div>
    </div>
  )
}
