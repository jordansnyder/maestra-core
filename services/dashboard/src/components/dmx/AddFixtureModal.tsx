'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { DMXNode, DMXFixture, DMXFixtureCreate, Entity, EntityType, OFLManufacturer, OFLFixture, OFLFixtureMode } from '@/lib/types'
import { X, Search, ChevronDown } from '@/components/icons'
import { entitiesApi, entityTypesApi, oflApi } from '@/lib/api'

interface AddFixtureModalProps {
  nodes: DMXNode[]
  fixture?: DMXFixture        // edit mode: pre-filled, saves as update
  copyOf?: DMXFixture         // copy mode: pre-filled, saves as new create
  initialName?: string        // override the initial name field (used for copy)
  defaultPosition?: { x: number; y: number }
  onSubmit: (data: DMXFixtureCreate) => Promise<void>
  onClose: () => void
}

// Entity type preference order for auto-created fixture entities
const PREFERRED_ENTITY_TYPES = ['actuator', 'device', 'sensor', 'installation']

/** Sanitize a channel name into a valid variable name */
function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function AddFixtureModal({ nodes, fixture, copyOf, initialName, defaultPosition, onSubmit, onClose }: AddFixtureModalProps) {
  const isEditing = !!fixture
  const isCopying = !!copyOf
  // source to pre-fill from (edit uses fixture, copy uses copyOf)
  const source = fixture ?? copyOf
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initialName ?? source?.name ?? '')
  const [label, setLabel] = useState(source?.label ?? '')
  const [manufacturer, setManufacturer] = useState(source?.manufacturer ?? '')
  const [model, setModel] = useState(source?.model ?? '')
  const [fixtureMode, setFixtureMode] = useState(source?.fixture_mode ?? '')
  const [nodeId, setNodeId] = useState(source?.node_id ?? nodes[0]?.id ?? '')
  const [universe, setUniverse] = useState(source?.universe ?? 1)
  const [startChannel, setStartChannel] = useState(source?.start_channel ?? 1)
  const [channelCount, setChannelCount] = useState(source?.channel_count ?? 1)

  // OFL Library state (not shown in edit mode)
  const [mfrSearch, setMfrSearch] = useState('')
  const [mfrOpen, setMfrOpen] = useState(false)
  const [selectedMfr, setSelectedMfr] = useState<OFLManufacturer | null>(null)
  const [manufacturers, setManufacturers] = useState<OFLManufacturer[]>([])
  const [mfrLoading, setMfrLoading] = useState(false)

  const [fixtureSearch, setFixtureSearch] = useState('')
  const [fixtureOpen, setFixtureOpen] = useState(false)
  const [selectedOFLFixture, setSelectedOFLFixture] = useState<OFLFixture | null>(null)
  const [oflFixtures, setOflFixtures] = useState<OFLFixture[]>([])
  const [fixtureLoading, setFixtureLoading] = useState(false)

  const [selectedMode, setSelectedMode] = useState<OFLFixtureMode | null>(null)
  const [oflFixtureId, setOflFixtureId] = useState<string | undefined>(undefined)

  // Edit mode only: entity picker
  const [entityId, setEntityId] = useState(fixture?.entity_id ?? '')
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([])
  const [entitySearch, setEntitySearch] = useState('')
  const [entityOpen, setEntityOpen] = useState(false)
  const entityDropdownRef = useRef<HTMLDivElement>(null)
  const mfrDropdownRef = useRef<HTMLDivElement>(null)
  const fixtureDropdownRef = useRef<HTMLDivElement>(null)

  // Track all fixture names for auto-numbering
  const [allFixtureNames, setAllFixtureNames] = useState<string[]>([])

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

  // Close dropdowns on outside click
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

  useEffect(() => {
    if (!mfrOpen) return
    const handler = (e: MouseEvent) => {
      if (mfrDropdownRef.current && !mfrDropdownRef.current.contains(e.target as Node)) {
        setMfrOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mfrOpen])

  useEffect(() => {
    if (!fixtureOpen) return
    const handler = (e: MouseEvent) => {
      if (fixtureDropdownRef.current && !fixtureDropdownRef.current.contains(e.target as Node)) {
        setFixtureOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fixtureOpen])

  // Debounced manufacturer search
  useEffect(() => {
    if (isEditing || isCopying) return
    const timer = setTimeout(() => {
      setMfrLoading(true)
      oflApi.getManufacturers(mfrSearch || undefined)
        .then(setManufacturers)
        .catch(() => setManufacturers([]))
        .finally(() => setMfrLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [mfrSearch, isEditing, isCopying])

  // Fetch fixtures when manufacturer changes or fixture search changes
  useEffect(() => {
    if (!selectedMfr || isEditing || isCopying) return
    setFixtureLoading(true)
    oflApi.getFixtures({ manufacturer: selectedMfr.key, q: fixtureSearch || undefined, limit: 100 })
      .then((res) => setOflFixtures(res.items))
      .catch(() => setOflFixtures([]))
      .finally(() => setFixtureLoading(false))
  }, [selectedMfr, fixtureSearch, isEditing, isCopying])

  // Reset fixture search when manufacturer changes
  useEffect(() => {
    setFixtureSearch('')
    setOflFixtures([])
    setSelectedOFLFixture(null)
    setSelectedMode(null)
    setOflFixtureId(undefined)
  }, [selectedMfr])

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

  const handleSelectMfr = (mfr: OFLManufacturer) => {
    setSelectedMfr(mfr)
    setMfrOpen(false)
    setMfrSearch(mfr.name)
  }

  const handleSelectOFLFixture = useCallback((oflFixture: OFLFixture) => {
    setSelectedOFLFixture(oflFixture)
    setFixtureOpen(false)

    // Populate text fields
    if (selectedMfr) setManufacturer(selectedMfr.name)
    setModel(oflFixture.name)
    setOflFixtureId(oflFixture.id)

    // Auto-select first mode
    const firstMode = oflFixture.modes[0] ?? null
    if (firstMode) {
      setSelectedMode(firstMode)
      setFixtureMode(firstMode.shortName)
      setChannelCount(firstMode.channel_count)
    }

    // Auto-populate name: find duplicates of same model and increment
    const base = oflFixture.name
    const existingWithBase = allFixtureNames.filter(
      (n) => n === base || n.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`))
    )
    if (existingWithBase.length === 0) {
      setName(base)
    } else {
      let n = 2
      while (allFixtureNames.includes(`${base} ${n}`)) n++
      setName(`${base} ${n}`)
    }
  }, [selectedMfr, allFixtureNames])

  const handleSelectMode = (mode: OFLFixtureMode) => {
    setSelectedMode(mode)
    setFixtureMode(mode.shortName)
    setChannelCount(mode.channel_count)
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

      // On create/copy: auto-create a linked entity
      if (!isEditing) {
        const shouldAutoCreate = isCopying ? !!copyOf!.entity_id : true
        if (shouldAutoCreate) {
          const typeId = pickEntityTypeId()
          if (typeId) {
            const created = await entitiesApi.create({
              name: name.trim(),
              entity_type_id: typeId,
              description: `DMX fixture — ${[manufacturer, model].filter(Boolean).join(' ') || 'linked fixture'}`,
              metadata: { dmx_fixture: true },
            })
            resolvedEntityId = created.id

            // Auto-create entity variables from selected OFL mode channels
            if (selectedMode && selectedMode.channels.length > 0 && resolvedEntityId) {
              for (const ch of selectedMode.channels) {
                const varName = sanitizeName(ch.name)
                if (!varName) continue
                try {
                  await entitiesApi.addVariable(resolvedEntityId, {
                    name: varName,
                    type: 'number',
                    direction: 'output',
                    config: {
                      min: 0,
                      max: 255,
                      default_value: ch.defaultValue ?? 0,
                    },
                  })
                } catch {
                  // Non-fatal: variable may already exist or name may conflict
                }
              }
            }
          }
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
        ofl_fixture_id: oflFixtureId,
        position_x: (isCopying ? (copyOf!.position_x + 40) : fixture?.position_x) ?? defaultPosition?.x ?? 200,
        position_y: (isCopying ? (copyOf!.position_y + 40) : fixture?.position_y) ?? defaultPosition?.y ?? 200,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : isEditing ? 'Failed to update fixture' : 'Failed to create fixture')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {isEditing ? 'Edit Fixture' : isCopying ? 'Copy Fixture' : 'Add DMX Fixture'}
            </h2>
            {!isEditing && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {isCopying
                  ? copyOf!.entity_id
                    ? 'A new linked entity will be created automatically'
                    : 'No entity will be linked (source has none)'
                  : 'A linked entity will be created automatically'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* ── OFL Fixture Library (add/copy mode only) ─────────────────── */}
            {!isEditing && (
              <div className="space-y-3 pb-3 border-b border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  Fixture Library
                </div>

                {/* Manufacturer picker */}
                <div ref={mfrDropdownRef} className="relative">
                  <label className="block text-xs text-slate-400 mb-1">Manufacturer</label>
                  <div className="relative">
                    <input
                      value={mfrSearch}
                      onChange={(e) => { setMfrSearch(e.target.value); setMfrOpen(true) }}
                      onFocus={() => setMfrOpen(true)}
                      placeholder="Search manufacturers…"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 pr-8"
                    />
                    <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  </div>
                  {mfrOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {mfrLoading ? (
                          <div className="px-3 py-3 text-xs text-slate-600 text-center">Loading…</div>
                        ) : manufacturers.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-600 text-center">
                            No manufacturers found — run make sync-ofl first
                          </div>
                        ) : (
                          manufacturers.map((mfr) => (
                            <button
                              key={mfr.key}
                              type="button"
                              onClick={() => handleSelectMfr(mfr)}
                              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                selectedMfr?.key === mfr.key
                                  ? 'bg-blue-600/30 text-white'
                                  : 'hover:bg-slate-700/60 text-slate-300'
                              }`}
                            >
                              <span className="font-medium">{mfr.name}</span>
                              {mfr.fixture_count !== undefined && (
                                <span className="ml-1.5 text-slate-500">({mfr.fixture_count})</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Model picker — only when manufacturer selected */}
                {selectedMfr && (
                  <div ref={fixtureDropdownRef} className="relative">
                    <label className="block text-xs text-slate-400 mb-1">Model</label>
                    <div className="relative">
                      <input
                        value={fixtureSearch}
                        onChange={(e) => { setFixtureSearch(e.target.value); setFixtureOpen(true) }}
                        onFocus={() => setFixtureOpen(true)}
                        placeholder={`Search ${selectedMfr.name} fixtures…`}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 pr-8"
                      />
                      <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    </div>
                    {fixtureOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        <div className="max-h-48 overflow-y-auto">
                          {fixtureLoading ? (
                            <div className="px-3 py-3 text-xs text-slate-600 text-center">Loading…</div>
                          ) : oflFixtures.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-slate-600 text-center">No fixtures found</div>
                          ) : (
                            oflFixtures.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => handleSelectOFLFixture(f)}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                  selectedOFLFixture?.id === f.id
                                    ? 'bg-blue-600/30 text-white'
                                    : 'hover:bg-slate-700/60 text-slate-300'
                                }`}
                              >
                                <div className="font-medium">{f.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {f.categories.slice(0, 2).join(', ')}
                                  {f.channel_count_min !== undefined && f.channel_count_min !== null && (
                                    <> · {f.channel_count_min === f.channel_count_max
                                      ? `${f.channel_count_min}ch`
                                      : `${f.channel_count_min}–${f.channel_count_max}ch`}
                                    </>
                                  )}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Mode picker — only when OFL fixture selected with multiple modes */}
                {selectedOFLFixture && selectedOFLFixture.modes.length > 1 && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Channel Mode</label>
                    <select
                      value={selectedMode?.shortName ?? ''}
                      onChange={(e) => {
                        const mode = selectedOFLFixture.modes.find((m) => m.shortName === e.target.value)
                        if (mode) handleSelectMode(mode)
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      {selectedOFLFixture.modes.map((mode) => (
                        <option key={mode.shortName} value={mode.shortName}>
                          {mode.name} ({mode.channel_count} ch)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mode channel preview */}
                {selectedMode && (
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-2">
                      {selectedMode.channel_count} channels — {selectedMode.name}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedMode.channels.map((ch, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300"
                        >
                          {i + 1}: {ch.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
                  autoFocus={isEditing}
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
          </div>
        </form>
      </div>
    </div>
  )
}
