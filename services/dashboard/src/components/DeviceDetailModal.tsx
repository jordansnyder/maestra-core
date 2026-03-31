'use client'

import { useState } from 'react'
import type { Device, DeviceUpdate } from '@/lib/types'
import { X, Copy, Check } from 'lucide-react'

interface DeviceDetailModalProps {
  device: Device
  onSave: (device: Device, update: DeviceUpdate) => Promise<void>
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-slate-500',
  error: 'bg-red-400',
  maintenance: 'bg-amber-400',
  pending: 'bg-blue-400',
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'string'
  if (Array.isArray(value)) return 'array'
  return 'object'
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DeviceDetailModal({ device, onSave, onClose }: DeviceDetailModalProps) {
  const [name, setName] = useState(device.name)
  const [deviceType, setDeviceType] = useState(device.device_type)
  const [ipAddress, setIpAddress] = useState(device.ip_address || '')
  const [firmwareVersion, setFirmwareVersion] = useState(device.firmware_version || '')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  // Config state: single source of truth is the parsed object
  const [configObj, setConfigObj] = useState<Record<string, unknown>>(device.configuration || {})
  const [configView, setConfigView] = useState<'table' | 'json'>('table')
  const [configJsonText, setConfigJsonText] = useState(JSON.stringify(device.configuration || {}, null, 2))
  const [configJsonError, setConfigJsonError] = useState<string | null>(null)

  // New key form
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const handleCopyMac = async () => {
    try {
      await navigator.clipboard.writeText(device.hardware_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  // Config table -> object sync
  const updateConfigKey = (key: string, rawValue: string) => {
    const updated = { ...configObj }
    // Try to parse as JSON (for numbers, booleans, objects, arrays)
    try {
      updated[key] = JSON.parse(rawValue)
    } catch {
      updated[key] = rawValue
    }
    setConfigObj(updated)
    setConfigJsonText(JSON.stringify(updated, null, 2))
    setConfigJsonError(null)
  }

  const deleteConfigKey = (key: string) => {
    const updated = { ...configObj }
    delete updated[key]
    setConfigObj(updated)
    setConfigJsonText(JSON.stringify(updated, null, 2))
    setConfigJsonError(null)
  }

  const addConfigKey = () => {
    if (!newKey.trim()) return
    const updated = { ...configObj }
    try {
      updated[newKey.trim()] = JSON.parse(newValue)
    } catch {
      updated[newKey.trim()] = newValue
    }
    setConfigObj(updated)
    setConfigJsonText(JSON.stringify(updated, null, 2))
    setConfigJsonError(null)
    setNewKey('')
    setNewValue('')
  }

  // JSON text -> object sync (on switching to table view or on save)
  const syncJsonToObj = (text: string) => {
    try {
      const parsed = JSON.parse(text)
      setConfigObj(parsed)
      setConfigJsonError(null)
      return true
    } catch {
      setConfigJsonError('Invalid JSON')
      return false
    }
  }

  const handleJsonChange = (text: string) => {
    setConfigJsonText(text)
    try {
      const parsed = JSON.parse(text)
      setConfigObj(parsed)
      setConfigJsonError(null)
    } catch {
      setConfigJsonError('Invalid JSON')
    }
  }

  const handleViewSwitch = (view: 'table' | 'json') => {
    if (view === 'json' && configView === 'table') {
      // Table -> JSON: serialize current object
      setConfigJsonText(JSON.stringify(configObj, null, 2))
      setConfigJsonError(null)
    } else if (view === 'table' && configView === 'json') {
      // JSON -> Table: parse current text
      syncJsonToObj(configJsonText)
    }
    setConfigView(view)
  }

  const handleSave = async () => {
    // If in JSON view, sync to object first
    if (configView === 'json') {
      if (!syncJsonToObj(configJsonText)) return
    }

    const update: DeviceUpdate = {}
    if (name !== device.name) update.name = name
    if (deviceType !== device.device_type) update.device_type = deviceType
    if (ipAddress !== (device.ip_address || '')) update.ip_address = ipAddress || undefined
    if (firmwareVersion !== (device.firmware_version || '')) update.firmware_version = firmwareVersion || undefined

    // Always include config if it changed
    const configChanged = JSON.stringify(configObj) !== JSON.stringify(device.configuration || {})
    if (configChanged) update.configuration = configObj

    // Only call API if something changed
    if (Object.keys(update).length === 0) {
      onClose()
      return
    }

    setSaving(true)
    try {
      await onSave(device, update)
    } finally {
      setSaving(false)
    }
  }

  const configKeys = Object.keys(configObj)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[device.status] || 'bg-slate-500'}`} />
            <h2 className="text-xl font-semibold">{device.name}</h2>
            <span className="text-sm text-slate-400 capitalize">{device.status}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Device Fields */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Device Type</label>
                <select
                  value={deviceType}
                  onChange={e => setDeviceType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="arduino">Arduino</option>
                  <option value="raspberry_pi">Raspberry Pi</option>
                  <option value="esp32">ESP32</option>
                  <option value="touchdesigner">TouchDesigner</option>
                  <option value="max_msp">Max/MSP</option>
                  <option value="unreal_engine">Unreal Engine</option>
                  <option value="web_client">Web Client</option>
                  <option value="mobile_client">Mobile Client</option>
                  <option value="artnet_node">Art-Net Node</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">MAC Address</label>
                <div className="flex items-center gap-2">
                  <span className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 uppercase">
                    {device.hardware_id}
                  </span>
                  <button
                    onClick={handleCopyMac}
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                    title="Copy MAC address"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">IP Address</label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={e => setIpAddress(e.target.value)}
                  placeholder="192.168.1.100"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Firmware Version</label>
                <input
                  type="text"
                  value={firmwareVersion}
                  onChange={e => setFirmwareVersion(e.target.value)}
                  placeholder="v1.0.0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Configuration</h3>
              <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
                <button
                  onClick={() => handleViewSwitch('table')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    configView === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => handleViewSwitch('json')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    configView === 'json' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>

            {configView === 'table' ? (
              <div>
                {configKeys.length > 0 ? (
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-900/50">
                          <th className="text-left px-3 py-2 text-slate-500 font-medium text-xs">Key</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium text-xs w-20">Type</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium text-xs">Value</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {configKeys.map(key => (
                          <tr key={key} className="border-t border-slate-700/50">
                            <td className="px-3 py-2 font-mono text-xs text-slate-300">{key}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{inferType(configObj[key])}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={formatValue(configObj[key])}
                                onChange={e => updateConfigKey(key, e.target.value)}
                                className="w-full bg-transparent border-0 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => deleteConfigKey(key)}
                                className="text-red-400/50 hover:text-red-400 text-xs"
                              >
                                x
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm border border-slate-700 rounded-lg">
                    No configuration keys. Add one below.
                  </div>
                )}
                {/* Add key row */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    placeholder="key"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder="value"
                    onKeyDown={e => e.key === 'Enter' && addConfigKey()}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={addConfigKey}
                    disabled={!newKey.trim()}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    + Add
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  value={configJsonText}
                  onChange={e => handleJsonChange(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500 resize-y"
                  spellCheck={false}
                />
                {configJsonError && (
                  <p className="text-red-400 text-xs mt-1">{configJsonError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!configJsonError}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
