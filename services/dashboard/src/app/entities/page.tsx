'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Entity, EntityType, EntityTreeNode } from '@/lib/types'
import { entitiesApi, entityTypesApi } from '@/lib/api'

type ViewMode = 'list' | 'tree'

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([])
  const [tree, setTree] = useState<EntityTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedType, setSelectedType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [typesData, entitiesData] = await Promise.all([
        entityTypesApi.list(),
        entitiesApi.list({
          entity_type: selectedType || undefined,
          search: searchQuery || undefined,
        }),
      ])

      setEntityTypes(typesData)
      setEntities(entitiesData)

      if (viewMode === 'tree') {
        const treeData = await entitiesApi.getTree(undefined, selectedType || undefined)
        setTree(treeData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [selectedType, searchQuery, viewMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete entity "${name}"? This action cannot be undone.`)) return

    try {
      await entitiesApi.delete(id)
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/" className="text-slate-400 hover:text-white">
              ← Dashboard
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Entities</h1>
              <p className="text-slate-400">Manage spaces, rooms, installations, and devices</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
            >
              + Create Entity
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="">All Types</option>
            {entityTypes.map((type) => (
              <option key={type.id} value={type.name}>
                {type.display_name}
              </option>
            ))}
          </select>

          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 ${viewMode === 'list' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-4 py-2 ${viewMode === 'tree' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              Tree
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Content */}
        {!loading && viewMode === 'list' && (
          <EntityList
            entities={entities}
            entityTypes={entityTypes}
            onDelete={handleDelete}
          />
        )}

        {!loading && viewMode === 'tree' && (
          <EntityTree nodes={tree} entityTypes={entityTypes} />
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <CreateEntityModal
            entityTypes={entityTypes}
            entities={entities}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              setShowCreateModal(false)
              loadData()
            }}
          />
        )}
      </div>
    </div>
  )
}

function EntityList({
  entities,
  entityTypes,
  onDelete,
}: {
  entities: Entity[]
  entityTypes: EntityType[]
  onDelete: (id: string, name: string) => void
}) {
  const getTypeName = (typeId: string) => {
    const type = entityTypes.find((t) => t.id === typeId)
    return type?.display_name || 'Unknown'
  }

  const getTypeIcon = (typeId: string) => {
    const type = entityTypes.find((t) => t.id === typeId)
    const icons: Record<string, string> = {
      space: '🏢',
      room: '🚪',
      zone: '📍',
      installation: '✨',
      device: '💻',
      sensor: '📡',
      actuator: '⚡',
      controller: '🎛️',
      media: '🖥️',
      group: '📁',
    }
    return icons[type?.name || ''] || '📦'
  }

  if (entities.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No entities found. Create your first entity to get started.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {entities.map((entity) => (
        <div
          key={entity.id}
          className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{getTypeIcon(entity.entity_type_id)}</span>
              <div>
                <Link
                  href={`/entities/${entity.id}`}
                  className="text-lg font-semibold hover:text-blue-400 transition-colors"
                >
                  {entity.name}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-slate-700 rounded">
                    {getTypeName(entity.entity_type_id)}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{entity.slug}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      entity.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {entity.status}
                  </span>
                </div>
                {entity.description && (
                  <p className="text-sm text-slate-400 mt-2">{entity.description}</p>
                )}
                {Object.keys(entity.state).length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-slate-500">State: </span>
                    <code className="text-xs text-slate-400 font-mono">
                      {JSON.stringify(entity.state).slice(0, 100)}
                      {JSON.stringify(entity.state).length > 100 ? '...' : ''}
                    </code>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/entities/${entity.id}`}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={() => onDelete(entity.id, entity.name)}
                className="px-3 py-1 text-sm bg-red-900/50 hover:bg-red-800 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EntityTree({
  nodes,
  entityTypes,
  level = 0,
}: {
  nodes: EntityTreeNode[]
  entityTypes: EntityType[]
  level?: number
}) {
  const getTypeIcon = (typeName?: string) => {
    const icons: Record<string, string> = {
      space: '🏢',
      room: '🚪',
      zone: '📍',
      installation: '✨',
      device: '💻',
      sensor: '📡',
      actuator: '⚡',
      controller: '🎛️',
      media: '🖥️',
      group: '📁',
    }
    return icons[typeName || ''] || '📦'
  }

  if (nodes.length === 0 && level === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No entities found. Create your first entity to get started.
      </div>
    )
  }

  return (
    <div className={level > 0 ? 'ml-6 border-l border-slate-700 pl-4' : ''}>
      {nodes.map((node) => (
        <div key={node.id} className="py-2">
          <Link
            href={`/entities/${node.id}`}
            className="flex items-center gap-2 hover:text-blue-400 transition-colors"
          >
            <span>{getTypeIcon(node.entity_type_name)}</span>
            <span className="font-medium">{node.name}</span>
            <span className="text-xs text-slate-500 font-mono">({node.slug})</span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                node.status === 'active'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {node.status}
            </span>
          </Link>
          {node.children.length > 0 && (
            <EntityTree nodes={node.children} entityTypes={entityTypes} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  )
}

function CreateEntityModal({
  entityTypes,
  entities,
  onClose,
  onCreated,
}: {
  entityTypes: EntityType[]
  entities: Entity[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [parentId, setParentId] = useState('')
  const [description, setDescription] = useState('')
  const [initialState, setInitialState] = useState('{}')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      let state = {}
      try {
        state = JSON.parse(initialState)
      } catch {
        setError('Invalid JSON in state field')
        return
      }

      setSubmitting(true)
      await entitiesApi.create({
        name,
        entity_type_id: typeId,
        parent_id: parentId || undefined,
        description: description || undefined,
        state,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entity')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Entity</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type *</label>
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
            >
              <option value="">Select type...</option>
              {entityTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Parent (optional)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
            >
              <option value="">No parent (root entity)</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name} ({entity.slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Initial State (JSON)</label>
            <textarea
              value={initialState}
              onChange={(e) => setInitialState(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded font-mono text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
