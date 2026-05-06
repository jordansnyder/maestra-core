'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { entitiesApi, entityTypesApi } from '@/lib/api'
import { Card } from '@/components/Card'
import { ChevronRight, Boxes } from '@/components/icons'
import type { Entity, EntityType } from '@/lib/types'

export function EntitiesOverviewWidget() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [entitiesData, typesData] = await Promise.all([
        entitiesApi.list({ limit: 10 }),
        entityTypesApi.list(),
      ])
      setEntities(entitiesData)
      setEntityTypes(typesData)
      setError(null)
    } catch {
      setError('Failed to load entities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const getTypeName = (typeId: string) => {
    const t = entityTypes.find(et => et.id === typeId)
    return t?.display_name || t?.name || 'unknown'
  }

  // Count by type
  const typeCounts: Record<string, number> = {}
  entities.forEach(e => {
    const name = getTypeName(e.entity_type_id)
    typeCounts[name] = (typeCounts[name] || 0) + 1
  })
  const typeBreakdown = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${count} ${name.toLowerCase()}`)
    .join(', ')

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <div className="h-4 w-24 bg-slate-700/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-700/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-700/30 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-slate-700/30 rounded animate-pulse" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{error}</span>
          <button onClick={fetchData} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-300">Entities</h3>
        </div>
        <Link href="/entities" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {entities.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-2">No entities yet</p>
          <Link href="/entities" className="text-xs text-blue-400 hover:text-blue-300">Create Entity</Link>
        </div>
      ) : (
        <>
          {/* Count + type breakdown */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold text-blue-400">{entities.length}</span>
            <span className="text-sm text-slate-500">entities</span>
          </div>
          {typeBreakdown && (
            <p className="text-xs text-slate-500 mb-3">{typeBreakdown}</p>
          )}

          {/* Recently updated entities with state preview */}
          <div className="space-y-1.5">
            {entities.slice(0, 4).map(entity => {
              const stateKeys = Object.entries(entity.state).slice(0, 2)
              return (
                <div key={entity.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    entity.status === 'active' ? 'bg-green-400' : 'bg-slate-500'
                  }`} />
                  <span className="text-slate-300 truncate flex-1">{entity.name}</span>
                  <span className="text-slate-600 font-mono truncate max-w-[120px]">
                    {stateKeys.map(([k, v]) => `${k}: ${typeof v === 'object' ? '{...}' : v}`).join(', ')}
                  </span>
                </div>
              )
            })}
            {entities.length > 4 && (
              <Link href="/entities" className="block text-xs text-slate-600 hover:text-blue-400 transition-colors">
                +{entities.length - 4} more
              </Link>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
