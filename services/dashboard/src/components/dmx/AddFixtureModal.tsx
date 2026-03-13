'use client'

import { useState, useEffect, useRef } from 'react'
import { DMXNode, DMXFixture, DMXFixtureCreate, Entity, EntityType } from '@/lib/types'
import { X, Search, ChevronDown } from '@/components/icons'
import { entitiesApi, entityTypesApi } from '@/lib/api'

interface AddFixtureModalProps {
  nodes: DMXNode[]
  fixture?: DMXFixture        // when provided: edit mode, pre-filled
  defaultPosition?: { x: number; y: number }
  onSubmit: (data: DMXFixtureCreate) => Promise<void>
  onClose: () => void
}

// Entity type preference order for auto-created fixture entities
const PREFERRED_ENTITY_TYPES = ['actuator', 'device', 'sensor', 'installation']

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

  // Edit mode only: entity picker
  const [entityId, setEntityId] = useState(fixture?.entity_id ?? '')
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([])
  const [entitySearch, setEntitySearch] = useState('')
  const [entityOpen, setEntityOpen] = useState(false)
  const entityDropdownRef = useRef<HTMLDivElement>(null)

  const selectedNode = nodes.find((n) => n.id === nodeId)
  const selectedEntity = entities.find((e) => e.id === entityId) ?? null

  useEffect(() => {
    Promise.all([
      entitiesApi.list({ limit: 500 }),
      entityTypesApi.list(),
    ]).then(([ents, types]) => {
      setEntities(ents)
      setEntityTypes(types)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!entityOpen) return
    const handler = (e: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(e.target as Node)) {
        setEntityOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [entityOpen])

  const filteredEntities = entities.filter((e) => {
    const q = entitySearch.toLowerCase()
    return !q || e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q) || (e.path ?? '').toLowerCase().includes(q)
  })

  const pickEntityTypeId = (): string | null => {
    for (const preferred of PREFERRED_ENTITY_TYPES) {
      const found = entityTypes.find((t) => t.name === preferred)
      if (found) return found.id
    }
    return entityTypes[0]?.id ?? null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!nodeId) { setError('Select an Art-Net node'); return }
    if (startChannel < 1 || startChannel > 512) { setError('Start channel must be 1–512'); return }

    setSubmitting(true)
    setError(null)
    try {
      let resolvedEntityId = isEditing ? (entityId.trim() || undefined) : undefined

      // On create: auto-create a linked entity with the same name
      if (!isEditing) {
        const typeId = pickEntityTypeId()
        if (typeId) {
          const created = await entitiesApi.create({
            name: name.trim(),
            entity_type_id: typeId,
            description: `DMX fixture — ${[manufacturer, model].filter(Boolean).join(' ') || 'linked fixture'}`,
            metadata: { dmx_fixture: true },
          })
          resolvedEntityId = created.id
        }
      }

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
        entity_id: resolvedEntityId,
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
          <div>
            <h2 className="text-sm font-semibold text-white">
              {isEditing ? 'Edit Fixture' : 'Add DMX Fixture'}
            </h2>
            {!isEditing && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                A linked entity will be created automatically
              </p>
            )}
          </div>
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

          {/* Entity link — edit mode only (create mode auto-links) */}
          {isEditing && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Linked Entity
                <span className="ml-1.5 text-slate-600 font-normal normal-case tracking-normal">
                  — drives DMX channels from entity state changes
                </span>
              </label>
              <div ref={entityDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setEntityOpen((v) => !v); setEntitySearch('') }}
                  className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-blue-500 transition-colors hover:border-slate-600"
                >
                  {selectedEntity ? (
                    <span className="flex flex-col min-w-0">
                      <span className="text-white truncate">{selectedEntity.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono truncate">{selectedEntity.slug}</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">None — no entity linked</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 ml-2 transition-transform duration-150 ${entityOpen ? 'rotate-180' : ''}`} />
                </button>

                {entityOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                      <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <input
                        autoFocus
                        value={entitySearch}
                        onChange={(e) => setEntitySearch(e.target.value)}
                        placeholder="Search by name, slug, or path…"
                        className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setEntityId(''); setEntityOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          !entityId ? 'bg-slate-700 text-slate-300' : 'text-slate-500 hover:bg-slate-700/50'
                        }`}
                      >
                        None — no entity linked
                      </button>
                      {filteredEntities.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-600 text-center">
                          {entities.length === 0 ? 'Loading entities…' : 'No entities match'}
                        </div>
                      ) : (
                        filteredEntities.map((entity) => {
                          const isSelected = entity.id === entityId
                          return (
                            <button
                              key={entity.id}
                              type="button"
                              onClick={() => { setEntityId(entity.id); setEntityOpen(false) }}
                              className={`w-full text-left px-3 py-2 transition-colors ${
                                isSelected ? 'bg-blue-600/30 text-white' : 'hover:bg-slate-700/50 text-slate-300'
                              }`}
                            >
                              <div className="text-xs font-medium truncate">{entity.name}</div>
                              <div className="text-[10px] font-mono text-slate-500 truncate">
                                {entity.path ?? entity.slug}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
                ? (isEditing ? 'Saving…' : 'Creating…')
                : (isEditing ? 'Save Changes' : 'Add Fixture')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
