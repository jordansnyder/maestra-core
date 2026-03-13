'use client'

import { useState } from 'react'
import { DMXNodeCreate, UniverseConfig } from '@/lib/types'
import { Plus, Trash2, Network, ChevronDown } from '@/components/icons'

interface NodeSetupFormProps {
  onSubmit: (data: DMXNodeCreate) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

export function NodeSetupForm({ onSubmit, onCancel, submitLabel = 'Add Art-Net Node' }: NodeSetupFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)

  // Required fields
  const [name, setName] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [universes, setUniverses] = useState<UniverseConfig[]>([
    { id: 1, artnet_universe: 0, port_label: 'Port 1', description: '' },
  ])

  // Optional fields
  const [artnetPort, setArtnetPort] = useState(6454)
  const [universeCount, setUniverseCount] = useState(4)
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [poePowered, setPoePowered] = useState(false)
  const [firmwareVersion, setFirmwareVersion] = useState('')
  const [notes, setNotes] = useState('')

  const addUniverse = () => {
    const nextId = Math.max(...universes.map((u) => u.id), 0) + 1
    setUniverses([...universes, {
      id: nextId,
      artnet_universe: universes.length,
      port_label: `Port ${nextId}`,
      description: '',
    }])
  }

  const removeUniverse = (id: number) => {
    setUniverses(universes.filter((u) => u.id !== id))
  }

  const updateUniverse = (id: number, field: keyof UniverseConfig, value: string | number) => {
    setUniverses(universes.map((u) => u.id === id ? { ...u, [field]: value } : u))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !ipAddress.trim()) {
      setError('Name and IP address are required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        ip_address: ipAddress.trim(),
        artnet_port: artnetPort,
        universe_count: universeCount,
        universes,
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        mac_address: macAddress.trim() || undefined,
        poe_powered: poePowered,
        firmware_version: firmwareVersion.trim() || undefined,
        notes: notes.trim() || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save node')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Required: Name */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Node Name <span className="text-red-400">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Stage Left Node"
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
          required
        />
      </div>

      {/* Required: IP Address */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          IP Address <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="192.168.1.100"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
            required
          />
        </div>
      </div>

      {/* Universe Assignments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 uppercase tracking-wider">Universe Assignments</label>
          <button
            type="button"
            onClick={addUniverse}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {universes.map((u) => (
            <div key={u.id} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
              <span className="text-[10px] text-slate-600 font-mono w-4 shrink-0">{u.id}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-500">Art-Net U#</span>
                <input
                  type="number"
                  min={0}
                  max={32767}
                  value={u.artnet_universe}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    updateUniverse(u.id, 'artnet_universe', isNaN(v) ? 0 : v)
                  }}
                  className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <input
                value={u.port_label}
                onChange={(e) => updateUniverse(u.id, 'port_label', e.target.value)}
                placeholder="Port label"
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              <input
                value={u.description}
                onChange={(e) => updateUniverse(u.id, 'description', e.target.value)}
                placeholder="Description"
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              {universes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeUniverse(u.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Options disclosure */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full text-left"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${showOptions ? 'rotate-180' : ''}`}
          />
          Options
          {!showOptions && (manufacturer || model || macAddress || firmwareVersion || poePowered || notes) && (
            <span className="ml-1 text-blue-500">•</span>
          )}
        </button>

        {showOptions && (
          <div className="mt-3 space-y-3 pl-1">
            {/* Port */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 w-28 shrink-0">Art-Net UDP Port</label>
              <input
                type="number"
                value={artnetPort}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setArtnetPort(isNaN(v) ? 6454 : v)
                }}
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Universe Count */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 w-28 shrink-0">Total Universes</label>
              <input
                type="number"
                min={1}
                max={16}
                value={universeCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setUniverseCount(isNaN(v) ? 4 : Math.max(1, v))
                }}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Manufacturer / Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Manufacturer</label>
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g. ENTTEC"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. ODE Mk3"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* MAC / Firmware */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">MAC Address</label>
                <input
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Firmware Version</label>
                <input
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                  placeholder="e.g. 2.1.0"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* PoE */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={poePowered}
                onChange={(e) => setPoePowered(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm text-slate-300">PoE Powered</span>
            </label>

            {/* Notes */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this node..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
