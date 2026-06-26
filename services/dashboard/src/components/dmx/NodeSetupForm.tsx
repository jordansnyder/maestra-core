'use client'

import { useState } from 'react'
import { DMXNode, DMXNodeCreate, UniverseConfig } from '@/lib/types'
import { UNIVERSE_PALETTE } from '@/lib/dmx-constants'
import { Plus, Trash2, Network, ChevronDown } from '@/components/icons'

interface NodeSetupFormProps {
  node?: DMXNode          // when provided: edit mode, pre-filled
  onSubmit: (data: DMXNodeCreate) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

function makeUniverse(id: number, artnet_universe: number): UniverseConfig {
  return {
    id,
    artnet_universe,
    port_label: `Port ${id}`,
    description: '',
    color: UNIVERSE_PALETTE[(id - 1) % UNIVERSE_PALETTE.length],
  }
}

export function NodeSetupForm({ node, onSubmit, onCancel, submitLabel = 'Add Art-Net Node' }: NodeSetupFormProps) {
  const isEditing = !!node
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)

  const [name, setName] = useState(node?.name ?? '')
  const [slug, setSlug] = useState(node?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!node?.slug)
  const [ipAddress, setIpAddress] = useState(node?.ip_address ?? '')

  const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const [universes, setUniverses] = useState<UniverseConfig[]>(
    node?.universes.length
      ? node.universes.map((u, i) => ({ ...u, color: u.color ?? UNIVERSE_PALETTE[i % UNIVERSE_PALETTE.length] }))
      : [makeUniverse(1, 0)]
  )

  const [artnetPort, setArtnetPort] = useState(node?.artnet_port ?? 6454)
  const [universeCount, setUniverseCount] = useState(node?.universe_count ?? 4)
  const [manufacturer, setManufacturer] = useState(node?.manufacturer ?? '')
  const [model, setModel] = useState(node?.model ?? '')
  const [macAddress, setMacAddress] = useState(node?.mac_address ?? '')
  const [poePowered, setPoePowered] = useState(node?.poe_powered ?? false)
  const [firmwareVersion, setFirmwareVersion] = useState(node?.firmware_version ?? '')
  const [notes, setNotes] = useState(node?.notes ?? '')

  const addUniverse = () => {
    const nextId = Math.max(...universes.map((u) => u.id), 0) + 1
    setUniverses([...universes, makeUniverse(nextId, universes.length)])
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
        slug: (slug.trim() || toSlug(name.trim())) || undefined,
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-fg-muted mb-1">
            Node Name <span className="text-red-400">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(toSlug(e.target.value))
            }}
            placeholder="e.g. Stage Left Node"
            autoFocus
            className="w-full bg-surface-1 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-accent"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1">
            Hardware ID / Slug <span className="text-red-400">*</span>
          </label>
          <input
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
            onBlur={(e) => setSlug(toSlug(e.target.value))}
            placeholder="stage-left-node"
            className="w-full bg-surface-1 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-accent font-mono"
          />
          <p className="text-[10px] text-fg-subtle mt-0.5">Unique identifier used in device registry</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-fg-muted mb-1">
            IP Address <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
            <input
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full bg-surface-1 border border-edge rounded-lg pl-8 pr-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-accent font-mono"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1">
            UDP Port <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={65535}
            value={artnetPort}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setArtnetPort(isNaN(v) ? 6454 : v)
            }}
            className="w-full bg-surface-1 border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent font-mono"
            required
          />
          <p className="text-[10px] text-fg-subtle mt-0.5">Default: 6454</p>
        </div>
      </div>

      {/* Universe Assignments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-fg-muted uppercase tracking-wider">Universe Assignments</label>
          <button
            type="button"
            onClick={addUniverse}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        {/* Column headers */}
        <div className="flex items-center gap-1.5 px-3 mb-1">
          <span className="w-4 shrink-0" />
          <span className="w-12 shrink-0 text-[10px] text-fg-subtle font-medium">Art-Net #</span>
          <span className="flex-1 min-w-0 text-[10px] text-fg-subtle font-medium">Label</span>
          <span className="flex-1 min-w-0 text-[10px] text-fg-subtle font-medium">Description</span>
          <span className="w-4 shrink-0" />
        </div>
        <div className="space-y-2">
          {universes.map((u) => (
            <div key={u.id} className="bg-surface-1/50 rounded-lg px-3 py-2 space-y-2">
              {/* Row 1: index, artnet universe number, label, description, delete */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-fg-subtle font-mono w-4 shrink-0">{u.id}</span>
                <input
                  type="number"
                  min={0}
                  max={32767}
                  title="Art-Net universe number sent in the ArtDMX packet (0–32767)"
                  value={u.artnet_universe}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    updateUniverse(u.id, 'artnet_universe', isNaN(v) ? 0 : v)
                  }}
                  className="w-12 shrink-0 bg-surface-0 border border-edge rounded px-2 py-1 text-xs text-fg font-mono focus:outline-none focus:border-accent"
                />
                <input
                  value={u.port_label}
                  onChange={(e) => updateUniverse(u.id, 'port_label', e.target.value)}
                  placeholder="e.g. Output 1"
                  className="flex-1 min-w-0 bg-surface-0 border border-edge rounded px-2 py-1 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:border-accent"
                />
                <input
                  value={u.description}
                  onChange={(e) => updateUniverse(u.id, 'description', e.target.value)}
                  placeholder="e.g. Stage Left"
                  className="flex-1 min-w-0 bg-surface-0 border border-edge rounded px-2 py-1 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:border-accent"
                />
                {universes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeUniverse(u.id)}
                    className="text-fg-subtle hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Row 2: color swatches */}
              <div className="flex items-center gap-1.5 flex-wrap pl-6">
                {UNIVERSE_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => updateUniverse(u.id, 'color', c)}
                    className="rounded-full transition-transform"
                    style={{
                      width: 14,
                      height: 14,
                      background: c,
                      outline: u.color === c ? `2px solid white` : '2px solid transparent',
                      outlineOffset: 1,
                      transform: u.color === c ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Options disclosure */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors w-full text-left"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${showOptions ? 'rotate-180' : ''}`}
          />
          Options
          {!showOptions && notes && (
            <span className="ml-1 text-accent">•</span>
          )}
        </button>

        {showOptions && (
          <div className="mt-3 space-y-3 pl-1">
            <div>
              <label className="block text-xs text-fg-muted mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this node..."
                className="w-full bg-surface-1 border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-accent resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm text-fg-muted bg-surface-1 hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-fg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : isEditing ? 'Save Changes' : submitLabel}
        </button>
      </div>
    </form>
  )
}
