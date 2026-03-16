'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Entity, EntityType, EntityUpdate, DMXFixture } from '@/lib/types'
import { entitiesApi, entityTypesApi, dmxApi } from '@/lib/api'
import { EntityVariablesPanel } from '@/components/EntityVariablesPanel'
import { StateTestPanel } from '@/components/StateTestPanel'
import { EntityStateOverview } from '@/components/EntityStateOverview'
import { DMXChannelPanel } from '@/components/dmx/DMXChannelPanel'
import { useToast } from '@/components/Toast'
import {
  ENTITY_TYPE_ICONS, DEFAULT_ENTITY_ICON,
  Pencil, Trash2, ChevronRight, Zap, ExternalLink, ChevronDown, X,
} from '@/components/icons'
import type { LucideIcon } from 'lucide-react'

function getEntityIcon(entityTypes: EntityType[], typeId: string): LucideIcon {
  const type = entityTypes.find((t) => t.id === typeId)
  return ENTITY_TYPE_ICONS[type?.name || ''] || DEFAULT_ENTITY_ICON
}

export default function EntityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const entityId = params.id as string
  const { toast, confirm } = useToast()

  const [entity, setEntity] = useState<Entity | null>(null)
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([])
  const [allEntities, setAllEntities] = useState<Entity[]>([])
  const [ancestors, setAncestors] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // DMX fixture link
  const [linkedFixture, setLinkedFixture] = useState<DMXFixture | null>(null)
  const [allFixtures, setAllFixtures] = useState<DMXFixture[]>([])
  const [fixtureDropdownOpen, setFixtureDropdownOpen] = useState(false)
  const [fixtureSearch, setFixtureSearch] = useState('')
  const [savingDmxLink, setSavingDmxLink] = useState(false)
  const fixtureDropdownRef = useRef<HTMLDivElement>(null)

  // Edit states
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editParentId, setEditParentId] = useState('')
  const [editStatus, setEditStatus] = useState('')

  // State editor
  const [stateJson, setStateJson] = useState('')
  const [stateError, setStateError] = useState<string | null>(null)
  const [savingState, setSavingState] = useState(false)

  const [activeTab, setActiveTab] = useState<'variables' | 'advanced'>('variables')
  const [variablesMode, setVariablesMode] = useState<'define' | 'test'>('test')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [entityData, typesData, entitiesData, allFixturesData] = await Promise.all([
        entitiesApi.get(entityId, true),
        entityTypesApi.list(),
        entitiesApi.list({ limit: 500 }),
        dmxApi.listFixtures().catch(() => [] as DMXFixture[]),
      ])

      setEntity(entityData)
      setEntityTypes(typesData)
      setAllEntities(entitiesData)
      setAllFixtures(allFixturesData)
      setStateJson(JSON.stringify(entityData.state, null, 2))
      setEditName(entityData.name)
      setEditDescription(entityData.description || '')
      setEditParentId(entityData.parent_id || '')
      setEditStatus(entityData.status)

      // Find which fixture (if any) links to this entity
      const linked = allFixturesData.find((f) => f.entity_id === entityId) ?? null
      setLinkedFixture(linked)

      try {
        const ancestorsData = await entitiesApi.getAncestors(entityId)
        setAncestors(ancestorsData)
      } catch {
        setAncestors([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity')
    } finally {
      setLoading(false)
    }
  }, [entityId])

  useEffect(() => { loadData() }, [loadData])

  // Close fixture dropdown on outside click
  useEffect(() => {
    if (!fixtureDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (fixtureDropdownRef.current && !fixtureDropdownRef.current.contains(e.target as Node)) {
        setFixtureDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fixtureDropdownOpen])

  // Link this entity to a different DMX fixture (or unlink)
  const handleSetDmxLink = async (newFixture: DMXFixture | null) => {
    setSavingDmxLink(true)
    setFixtureDropdownOpen(false)
    try {
      // Unlink old fixture if switching
      if (linkedFixture && linkedFixture.id !== newFixture?.id) {
        await dmxApi.updateFixture(linkedFixture.id, { entity_id: null })
      }
      // Link to new fixture
      if (newFixture) {
        await dmxApi.updateFixture(newFixture.id, { entity_id: entityId })
        setLinkedFixture({ ...newFixture, entity_id: entityId })
        toast({ message: `Linked to "${newFixture.name}"`, type: 'success' })
      } else {
        setLinkedFixture(null)
        toast({ message: 'DMX fixture unlinked', type: 'success' })
      }
      // Refresh fixture list to reflect new link state
      const updated = await dmxApi.listFixtures().catch(() => allFixtures)
      setAllFixtures(updated)
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to update DMX link', type: 'error' })
    } finally {
      setSavingDmxLink(false)
    }
  }

  const handleSaveMetadata = async () => {
    if (!entity) return
    try {
      const update: EntityUpdate = {}
      if (editName !== entity.name) update.name = editName
      if (editDescription !== (entity.description || '')) update.description = editDescription
      if (editParentId !== (entity.parent_id || '')) update.parent_id = editParentId || undefined
      if (editStatus !== entity.status) update.status = editStatus
      if (Object.keys(update).length === 0) { setEditing(false); return }
      await entitiesApi.update(entityId, update)
      await loadData()
      setEditing(false)
      toast({ message: 'Entity updated', type: 'success' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to update entity', type: 'error' })
    }
  }

  const handleSaveState = async () => {
    if (!entity) return
    try {
      const newState = JSON.parse(stateJson)
      setSavingState(true)
      setStateError(null)
      await entitiesApi.setState(entityId, { state: newState, source: 'dashboard' })
      await loadData()
      toast({ message: 'State saved', type: 'success' })
    } catch (err) {
      if (err instanceof SyntaxError) { setStateError('Invalid JSON') }
      else { setStateError(err instanceof Error ? err.message : 'Failed to save state') }
    } finally {
      setSavingState(false)
    }
  }

  const handleDelete = async () => {
    if (!entity) return
    const ok = await confirm({
      title: 'Delete Entity',
      message: `Delete "${entity.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await entitiesApi.delete(entityId)
      toast({ message: `"${entity.name}" deleted`, type: 'success' })
      router.push('/entities')
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to delete entity', type: 'error' })
    }
  }

  const getTypeName = (typeId: string) => entityTypes.find((t) => t.id === typeId)?.display_name || 'Unknown'

  // Fixtures available to link: all fixtures, excluding ones already linked to OTHER entities
  const linkableFixtures = allFixtures.filter(
    (f) => !f.entity_id || f.entity_id === entityId
  )
  const filteredFixtures = linkableFixtures.filter((f) => {
    const q = fixtureSearch.toLowerCase()
    return !q || f.name.toLowerCase().includes(q) || (f.label ?? '').toLowerCase().includes(q)
  })

  const channelMapEntries = linkedFixture
    ? Object.entries(linkedFixture.channel_map)
    : []

  if (loading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !entity) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <Link href="/entities" className="text-slate-400 hover:text-white text-sm">← Back to Entities</Link>
          <div className="mt-8 p-4 bg-red-900/50 border border-red-700 rounded-lg text-sm">
            {error || 'Entity not found'}
          </div>
        </div>
      </div>
    )
  }

  const EntityIcon = getEntityIcon(entityTypes, entity.entity_type_id)
  const isDmxController = entity.metadata?.dmx_controller === true || entity.slug === 'dmx-lighting'
  const isDmxLinked = !!linkedFixture || isDmxController

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="text-slate-400 hover:text-white">Dashboard</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <Link href="/entities" className="text-slate-400 hover:text-white">Entities</Link>
          {isDmxController && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <Link href="/dmx" className="text-amber-400 hover:text-amber-300 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                DMX Lighting
              </Link>
            </>
          )}
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <Link href={`/entities/${ancestor.id}`} className="text-slate-400 hover:text-white">
                {ancestor.name}
              </Link>
            </span>
          ))}
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white">{entity.name}</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                <EntityIcon className="w-6 h-6 text-slate-300" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{entity.name}</h1>
                  {isDmxLinked && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-900/40 border border-amber-800/50 text-amber-400 text-xs font-medium">
                      <Zap className="w-3 h-3" />
                      DMX
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm px-2 py-0.5 bg-slate-700 rounded">{getTypeName(entity.entity_type_id)}</span>
                  <span className="text-sm text-slate-400 font-mono">{entity.slug}</span>
                  <span className={`text-sm px-2 py-0.5 rounded ${entity.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                    {entity.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editing ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-900/50 hover:bg-red-800 rounded-lg text-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </header>

        {/* State Overview */}
        {Object.keys(entity.state).length > 0 && (
          <div className="mb-8">
            <EntityStateOverview entity={entity} onStateChange={loadData} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* DMX Fixture Card */}
            <div className={`rounded-lg border p-5 ${isDmxLinked ? 'bg-amber-950/20 border-amber-800/40' : 'bg-slate-800 border-slate-700'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${isDmxLinked ? 'text-amber-400' : 'text-slate-600'}`} />
                  <h2 className={`text-sm font-semibold ${isDmxLinked ? 'text-amber-300' : 'text-slate-400'}`}>
                    DMX Fixture
                  </h2>
                </div>
                {isDmxLinked && linkedFixture && (
                  <Link
                    href="/dmx"
                    className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-400 transition-colors"
                  >
                    Open in DMX Lighting
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                )}
              </div>

              {/* Linked fixture summary */}
              {isDmxLinked && linkedFixture && (
                <div className="mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fixture</span>
                    <span className="text-slate-200 font-medium">{linkedFixture.name}</span>
                  </div>
                  {linkedFixture.label && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Label</span>
                      <span className="text-slate-300">{linkedFixture.label}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Universe</span>
                    <span className="text-slate-300 font-mono">U{linkedFixture.universe}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">DMX Address</span>
                    <span className="text-slate-300 font-mono">
                      {linkedFixture.start_channel}–{linkedFixture.start_channel + linkedFixture.channel_count - 1}
                    </span>
                  </div>
                  {linkedFixture.fixture_mode && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mode</span>
                      <span className="text-slate-300">{linkedFixture.fixture_mode}</span>
                    </div>
                  )}

                  {/* Channel map reference */}
                  {channelMapEntries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-900/30">
                      <div className="text-[10px] uppercase tracking-wider text-amber-700 font-medium mb-2">
                        Channel Map
                      </div>
                      <div className="space-y-1">
                        {channelMapEntries.map(([varName, mapping]) => (
                          <div key={varName} className="flex items-center justify-between">
                            <span className="text-slate-400 font-mono">{varName}</span>
                            <span className="text-[10px] text-slate-600 font-mono">
                              ch {linkedFixture.start_channel + mapping.offset - 1} · {mapping.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Link / change / unlink dropdown */}
              <div ref={fixtureDropdownRef} className="relative">
                <button
                  type="button"
                  disabled={savingDmxLink}
                  onClick={() => { setFixtureDropdownOpen((v) => !v); setFixtureSearch('') }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs border transition-colors ${
                    isDmxLinked
                      ? 'bg-amber-900/20 border-amber-800/40 text-amber-400 hover:bg-amber-900/30'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  } disabled:opacity-50`}
                >
                  <span>{savingDmxLink ? 'Saving…' : isDmxLinked ? `Linked: ${linkedFixture!.name}` : 'No fixture linked'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 ml-2 transition-transform ${fixtureDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {fixtureDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    {/* Search */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                      <input
                        autoFocus
                        value={fixtureSearch}
                        onChange={(e) => setFixtureSearch(e.target.value)}
                        placeholder="Search fixtures…"
                        className="flex-1 bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                      {fixtureSearch && (
                        <button onClick={() => setFixtureSearch('')} className="text-slate-600 hover:text-slate-400">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {/* Unlink option */}
                      {isDmxLinked && (
                        <button
                          type="button"
                          onClick={() => handleSetDmxLink(null)}
                          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2"
                        >
                          <X className="w-3 h-3" />
                          Remove link
                        </button>
                      )}
                      {filteredFixtures.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-600 text-center">
                          {allFixtures.length === 0 ? 'No fixtures configured' : 'No fixtures available'}
                        </div>
                      ) : (
                        filteredFixtures.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleSetDmxLink(f)}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                              f.id === linkedFixture?.id
                                ? 'bg-amber-900/30 text-amber-300'
                                : 'hover:bg-slate-700/60 text-slate-300'
                            }`}
                          >
                            <div className="font-medium truncate">{f.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              U{f.universe} · Ch {f.start_channel} · {f.channel_count}ch
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Card */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Details</h2>
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Parent</label>
                    <select
                      value={editParentId}
                      onChange={(e) => setEditParentId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">No parent (root entity)</option>
                      {allEntities.filter((e) => e.id !== entityId).map((e) => (
                        <option key={e.id} value={e.id}>{e.name} ({e.slug})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="error">Error</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <button
                    onClick={handleSaveMetadata}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-slate-400">Description</dt>
                    <dd className="mt-0.5">{entity.description || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Path</dt>
                    <dd className="font-mono mt-0.5">{entity.path || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Tags</dt>
                    <dd className="mt-0.5">
                      {entity.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entity.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-slate-700 rounded text-xs">{tag}</span>
                          ))}
                        </div>
                      ) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Created</dt>
                    <dd className="mt-0.5">{new Date(entity.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Updated</dt>
                    <dd className="mt-0.5">{new Date(entity.updated_at).toLocaleString()}</dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Children Card */}
            {entity.children && entity.children.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Children ({entity.children.length})</h2>
                <div className="space-y-1">
                  {entity.children.map((child) => {
                    const ChildIcon = getEntityIcon(entityTypes, child.entity_type_id)
                    return (
                      <Link
                        key={child.id}
                        href={`/entities/${child.id}`}
                        className="flex items-center gap-2 p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <ChildIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{child.name}</span>
                        <span className="text-xs text-slate-500 font-mono">({child.slug})</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Variables & Advanced */}
          <div>
            {/* DMX Channel Panel — shown when fixture has a channel_map */}
            {isDmxLinked && linkedFixture && Object.keys(linkedFixture.channel_map).length > 0 && (
              <div className="mb-6">
                <DMXChannelPanel
                  fixture={linkedFixture}
                  entityId={entityId}
                  currentState={entity.state}
                  onStateChange={async (updates) => {
                    await entitiesApi.updateState(entityId, { state: updates, source: 'dmx_panel' })
                    await loadData()
                  }}
                />
              </div>
            )}

            {/* DMX-managed notice — unobtrusive, only when linked */}
            {isDmxLinked && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 mb-4 rounded-lg bg-amber-950/30 border border-amber-900/40">
                <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  This entity is DMX-managed. Its variables should correspond to channel map keys
                  defined on the linked fixture — the DMX gateway uses them to resolve channel values.
                </p>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('variables')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === 'variables' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
              >
                Variables
              </button>
              <button
                onClick={() => setActiveTab('advanced')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === 'advanced' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
              >
                Advanced
              </button>
            </div>

            {activeTab === 'variables' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-1 bg-slate-800 rounded-lg w-fit">
                  <button
                    onClick={() => setVariablesMode('test')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variablesMode === 'test' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Test
                  </button>
                  <button
                    onClick={() => setVariablesMode('define')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variablesMode === 'define' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Define
                  </button>
                </div>

                {/* DMX channel map hints in define mode */}
                {isDmxLinked && variablesMode === 'define' && channelMapEntries.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-500 mb-2">
                      Expected variables from fixture channel map:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {channelMapEntries.map(([varName]) => (
                        <span key={varName} className="px-2 py-0.5 rounded bg-amber-900/30 border border-amber-800/40 text-amber-400 text-[10px] font-mono">
                          {varName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {variablesMode === 'test' ? (
                  <StateTestPanel entity={entity} onStateChange={loadData} />
                ) : (
                  <EntityVariablesPanel entity={entity} onVariablesChange={loadData} />
                )}
              </div>
            ) : (
              <>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Raw State</h2>
                    <span className="text-xs text-slate-500">
                      Updated: {new Date(entity.state_updated_at).toLocaleString()}
                    </span>
                  </div>
                  {stateError && (
                    <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm">{stateError}</div>
                  )}
                  <textarea
                    value={stateJson}
                    onChange={(e) => setStateJson(e.target.value)}
                    rows={15}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                    spellCheck={false}
                  />
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-xs text-slate-500">
                      Edit JSON and save to update state. Changes broadcast via NATS/MQTT.
                    </p>
                    <button
                      onClick={handleSaveState}
                      disabled={savingState}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {savingState ? 'Saving...' : 'Save State'}
                    </button>
                  </div>
                </div>

                <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-2">Message Bus Topics</h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-500">NATS: </span>
                      <span className="text-blue-400">
                        maestra.entity.state.{entity.entity_type?.name || 'unknown'}.{entity.slug}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">MQTT: </span>
                      <span className="text-green-400">
                        maestra/entity/state/{entity.entity_type?.name || 'unknown'}/{entity.slug}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
