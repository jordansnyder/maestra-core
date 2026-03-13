'use client'

import { useState } from 'react'
import { DMXNode, DMXFixture, DMXFixtureCreate } from '@/lib/types'
import { X } from '@/components/icons'

interface AddFixtureModalProps {
  nodes: DMXNode[]
  fixture?: DMXFixture        // when provided: edit mode, pre-filled
  defaultPosition?: { x: number; y: number }
  onSubmit: (data: DMXFixtureCreate) => Promise<void>
  onClose: () => void
}

export function AddFixtureModal({ nodes, fixture, defaultPosition, onSubmit, onClose }: AddFixtureModalProps) {
  const isEditing = !!fixture
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(fixture?.name ?? '')
  const [label, setLabel] = useState(fixture?.label ?? '')
  const [manufacturer, setManufacturer] = useState(fixture?.manufacturer ?? '')
  const [model, setModel] = useState(fixture?.model ?? '')
  const [fixtureMode, setFixtureMode] = useState(fixture?.fixture_mode ?? '')
  const [nodeId, setNodeId] = useState(fixture?.node_id ?? nodes[0]?.id ?? '')
  const [universe, setUniverse] = useState(fixture?.universe ?? 1)
  const [startChannel, setStartChannel] = useState(fixture?.start_channel ?? 1)
  const [channelCount, setChannelCount] = useState(fixture?.channel_count ?? 1)
  const [entityId, setEntityId] = useState(fixture?.entity_id ?? '')

  const selectedNode = nodes.find((n) => n.id === nodeId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!nodeId) { setError('Select an Art-Net node'); return }
    if (startChannel < 1 || startChannel > 512) { setError('Start channel must be 1–512'); return }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        label: label.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        fixture_mode: fixtureMode.trim() || undefined,
        node_id: nodeId,
        universe,
        start_channel: startChannel,
        channel_count: channelCount,
        entity_id: entityId.trim() || undefined,
        position_x: fixture?.position_x ?? defaultPosition?.x ?? 200,
        position_y: fixture?.position_y ?? defaultPosition?.y ?? 200,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : isEditing ? 'Failed to update fixture' : 'Failed to create fixture')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">
            {isEditing ? 'Edit Fixture' : 'Add DMX Fixture'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Name / label / mode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">
                Fixture Name <span className="text-red-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Front Wash Left"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Short Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. FWL"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fixture Mode</label>
              <input
                value={fixtureMode}
                onChange={(e) => setFixtureMode(e.target.value)}
                placeholder="e.g. 15ch, 8ch"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Manufacturer / model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Manufacturer</label>
              <input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Chauvet"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. SlimPAR T12"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Art-Net node / universe / channel */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="block text-xs text-slate-400 mb-1">
                Art-Net Node <span className="text-red-400">*</span>
              </label>
              <select
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.ip_address})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Universe</label>
              <select
                value={universe}
                onChange={(e) => setUniverse(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {selectedNode?.universes.length ? (
                  selectedNode.universes.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id} — {u.port_label}{u.description ? ` (${u.description})` : ''}
                    </option>
                  ))
                ) : (
                  Array.from({ length: 4 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Start Channel</label>
              <input
                type="number"
                min={1}
                max={512}
                value={startChannel}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setStartChannel(isNaN(v) ? 1 : Math.max(1, Math.min(512, v)))
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Channel Count</label>
              <input
                type="number"
                min={1}
                max={512}
                value={channelCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setChannelCount(isNaN(v) ? 1 : Math.max(1, Math.min(512, v)))
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Entity link */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Linked Entity ID
              <span className="ml-1.5 text-slate-600 font-normal normal-case tracking-normal">
                — optional, links this fixture to a Maestra entity for state-driven control
              </span>
            </label>
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g. a1b2c3d4-…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              {submitting
                ? (isEditing ? 'Saving…' : 'Adding…')
                : (isEditing ? 'Save Changes' : 'Add Fixture')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
