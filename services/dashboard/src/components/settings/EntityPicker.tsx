'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { entitiesApi } from '@/lib/api'
import type { Entity } from '@/lib/types'
import { Search, ChevronDown } from '@/components/icons'

interface EntityPickerProps {
  value: string
  onChange: (slug: string) => void
  className?: string
}

export function EntityPicker({ value, onChange, className = '' }: EntityPickerProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchEntities = useCallback(async () => {
    try {
      const data = await entitiesApi.list({ limit: 1000 })
      setEntities(data)
      setFetchError(false)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fallback to text input if fetch failed
  if (fetchError) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="entity-slug"
        className={`w-full bg-slate-900 border border-slate-600 focus:border-blue-500 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${className}`}
      />
    )
  }

  const filtered = entities.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.slug.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      (e.entity_type?.name ?? '').toLowerCase().includes(q)
    )
  })

  const selected = entities.find((e) => e.slug === value)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          if (!open) {
            setSearch('')
            setTimeout(() => inputRef.current?.focus(), 50)
          }
        }}
        className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-600 hover:border-slate-500 focus:border-blue-500 rounded px-3 py-2 text-sm text-left focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
      >
        {loading ? (
          <span className="text-slate-500">Loading entities...</span>
        ) : selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-slate-200 truncate">{selected.name}</span>
            {selected.entity_type?.name && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 border border-slate-600">
                {selected.entity_type.name}
              </span>
            )}
            <span className="shrink-0 text-xs text-slate-500 font-mono">{selected.slug}</span>
          </span>
        ) : value ? (
          <span className="text-slate-300 font-mono text-xs">{value}</span>
        ) : (
          <span className="text-slate-500">Select an entity...</span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
            <Search className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entities..."
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500 text-center">
                No entities found
              </div>
            ) : (
              filtered.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => {
                    onChange(entity.slug)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors flex items-center gap-2 ${
                    entity.slug === value ? 'bg-slate-700/50' : ''
                  }`}
                >
                  <span className="text-sm text-slate-200 truncate">{entity.name}</span>
                  {entity.entity_type?.name && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">
                      {entity.entity_type.name}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-slate-500 font-mono">{entity.slug}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
