// Custom hook for OSC mapping state management

import { useEffect, useState, useCallback } from 'react'
import { oscMappingsApi } from '@/lib/api'
import type { OscMapping, OscMappingImportResult } from '@/lib/types'

export interface UseOscMappingsReturn {
  // Data
  mappings: OscMapping[]

  // State
  loading: boolean
  error: string | null

  // Actions
  fetchMappings: () => Promise<void>
  createMapping: (data: Partial<OscMapping>) => Promise<OscMapping | null>
  updateMapping: (id: string, data: Partial<OscMapping>) => Promise<OscMapping | null>
  patchMapping: (id: string, data: Partial<OscMapping>) => Promise<OscMapping | null>
  deleteMapping: (id: string) => Promise<void>
  importMappings: (data: Partial<OscMapping>[]) => Promise<OscMappingImportResult | null>
  exportMappings: () => Promise<void>
}

export function useOscMappings(autoRefresh = true, interval = 10000): UseOscMappingsReturn {
  const [mappings, setMappings] = useState<OscMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMappings = useCallback(async () => {
    try {
      setError(null)
      const data = await oscMappingsApi.getAll()
      setMappings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch OSC mappings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMappings()

    if (autoRefresh) {
      const timer = setInterval(fetchMappings, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval, fetchMappings])

  const createMapping = useCallback(async (data: Partial<OscMapping>) => {
    try {
      const mapping = await oscMappingsApi.create(data)
      setMappings((prev) => [...prev, mapping])
      return mapping
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mapping')
      return null
    }
  }, [])

  const updateMapping = useCallback(async (id: string, data: Partial<OscMapping>) => {
    try {
      const mapping = await oscMappingsApi.update(id, data)
      setMappings((prev) => prev.map((m) => (m.id === id ? mapping : m)))
      return mapping
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update mapping')
      return null
    }
  }, [])

  const patchMapping = useCallback(async (id: string, data: Partial<OscMapping>) => {
    try {
      const mapping = await oscMappingsApi.patch(id, data)
      setMappings((prev) => prev.map((m) => (m.id === id ? mapping : m)))
      return mapping
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to patch mapping')
      return null
    }
  }, [])

  const deleteMapping = useCallback(async (id: string) => {
    try {
      await oscMappingsApi.remove(id)
      setMappings((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mapping')
    }
  }, [])

  const importMappings = useCallback(async (data: Partial<OscMapping>[]) => {
    try {
      const result = await oscMappingsApi.importMappings(data)
      // Refresh the full list after import
      await fetchMappings()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import mappings')
      return null
    }
  }, [fetchMappings])

  const exportMappings = useCallback(async () => {
    try {
      const response = await oscMappingsApi.exportMappings()
      if (!response.ok) {
        throw new Error('Export failed')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'osc-mappings.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export mappings')
    }
  }, [])

  return {
    mappings,
    loading,
    error,
    fetchMappings,
    createMapping,
    updateMapping,
    patchMapping,
    deleteMapping,
    importMappings,
    exportMappings,
  }
}
