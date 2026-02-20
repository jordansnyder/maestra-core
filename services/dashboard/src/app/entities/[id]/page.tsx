'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Entity, EntityType, EntityUpdate } from '@/lib/types'
import { entitiesApi, entityTypesApi } from '@/lib/api'
import { EntityVariablesPanel } from '@/components/EntityVariablesPanel'
import { StateTestPanel } from '@/components/StateTestPanel'
import { useToast } from '@/components/Toast'
import { ENTITY_TYPE_ICONS, DEFAULT_ENTITY_ICON, Pencil, Trash2, ChevronRight } from '@/components/icons'
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

  // Tab navigation - Variables is now the default
  const [activeTab, setActiveTab] = useState<'variables' | 'advanced'>('variables')
  const [variablesMode, setVariablesMode] = useState<'define' | 'test'>('test')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [entityData, typesData, entitiesData] = await Promise.all([
        entitiesApi.get(entityId, true),
        entityTypesApi.list(),
        entitiesApi.list({ limit: 500 }),
      ])

      setEntity(entityData)
      setEntityTypes(typesData)
      setAllEntities(entitiesData)
      setStateJson(JSON.stringify(entityData.state, null, 2))

      // Set edit form defaults
      setEditName(entityData.name)
      setEditDescription(entityData.description || '')
      setEditParentId(entityData.parent_id || '')
      setEditStatus(entityData.status)

      // Load ancestors
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

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveMetadata = async () => {
    if (!entity) return

    try {
      const update: EntityUpdate = {}
      if (editName !== entity.name) update.name = editName
      if (editDescription !== (entity.description || '')) update.description = editDescription
      if (editParentId !== (entity.parent_id || '')) update.parent_id = editParentId || undefined
      if (editStatus !== entity.status) update.status = editStatus

      if (Object.keys(update).length === 0) {
        setEditing(false)
        return
      }

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

      await entitiesApi.setState(entityId, {
        state: newState,
        source: 'dashboard',
      })

      await loadData()
      toast({ message: 'State saved', type: 'success' })
    } catch (err) {
      if (err instanceof SyntaxError) {
        setStateError('Invalid JSON')
      } else {
        setStateError(err instanceof Error ? err.message : 'Failed to save state')
      }
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

  const getTypeName = (typeId: string) => {
    const type = entityTypes.find((t) => t.id === typeId)
    return type?.display_name || 'Unknown'
  }

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
          <Link href="/entities" className="text-slate-400 hover:text-white text-sm">
            Back to Entities
          </Link>
          <div className="mt-8 p-4 bg-red-900/50 border border-red-700 rounded-lg text-sm">
            {error || 'Entity not found'}
          </div>
        </div>
      </div>
    )
  }

  const EntityIcon = getEntityIcon(entityTypes, entity.entity_type_id)

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="text-slate-400 hover:text-white">
            Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <Link href="/entities" className="text-slate-400 hover:text-white">
            Entities
          </Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <Link
                href={`/entities/${ancestor.id}`}
                className="text-slate-400 hover:text-white"
              >
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
                <h1 className="text-2xl font-bold">{entity.name}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm px-2 py-0.5 bg-slate-700 rounded">
                    {getTypeName(entity.entity_type_id)}
                  </span>
                  <span className="text-sm text-slate-400 font-mono">{entity.slug}</span>
                  <span
                    className={`text-sm px-2 py-0.5 rounded ${
                      entity.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Metadata */}
          <div className="space-y-6">
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
                      {allEntities
                        .filter((e) => e.id !== entityId)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.slug})
                          </option>
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
                    <dd className="mt-0.5">{entity.description || '\u2014'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Path</dt>
                    <dd className="font-mono mt-0.5">{entity.path || '\u2014'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Tags</dt>
                    <dd className="mt-0.5">
                      {entity.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entity.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-slate-700 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '\u2014'
                      )}
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
                <h2 className="text-lg font-semibold mb-4">
                  Children ({entity.children.length})
                </h2>
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

          {/* Right Column - Variables (default) & Advanced */}
          <div>
            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('variables')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === 'variables'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                Variables
              </button>
              <button
                onClick={() => setActiveTab('advanced')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === 'advanced'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                Advanced
              </button>
            </div>

            {activeTab === 'variables' ? (
              <div className="space-y-4">
                {/* Define/Test Toggle */}
                <div className="flex items-center gap-2 p-1 bg-slate-800 rounded-lg w-fit">
                  <button
                    onClick={() => setVariablesMode('test')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      variablesMode === 'test'
                        ? 'bg-green-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Test
                  </button>
                  <button
                    onClick={() => setVariablesMode('define')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      variablesMode === 'define'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Define
                  </button>
                </div>

                {variablesMode === 'test' ? (
                  <StateTestPanel
                    entity={entity}
                    onStateChange={loadData}
                  />
                ) : (
                  <EntityVariablesPanel
                    entity={entity}
                    onVariablesChange={loadData}
                  />
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
                    <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm">
                      {stateError}
                    </div>
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

                {/* MQTT/NATS Info */}
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
