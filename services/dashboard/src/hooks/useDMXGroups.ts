'use client'

import { useState, useEffect, useCallback } from 'react'
import { dmxApi } from '@/lib/api'
import { DMXGroup, DMXGroupCreate, DMXGroupUpdate } from '@/lib/types'

export function useDMXGroups() {
  const [groups, setGroups] = useState<DMXGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      setError(null)
      const data = await dmxApi.listGroups()
      setGroups(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const createGroup = useCallback(async (data: DMXGroupCreate) => {
    const group = await dmxApi.createGroup(data)
    setGroups((prev) => [...prev, group])
    return group
  }, [])

  const updateGroup = useCallback(async (id: string, data: DMXGroupUpdate) => {
    const updated = await dmxApi.updateGroup(id, data)
    setGroups((prev) => prev.map((g) => g.id === id ? updated : g))
    return updated
  }, [])

  const deleteGroup = useCallback(async (id: string) => {
    await dmxApi.deleteGroup(id)
    setGroups((prev) => prev.filter((g) => g.id !== id))
  }, [])

  const groupById = useCallback((id: string | undefined | null): DMXGroup | undefined => {
    if (!id) return undefined
    return groups.find((g) => g.id === id)
  }, [groups])

  return { groups, loading, error, refresh: fetchGroups, createGroup, updateGroup, deleteGroup, groupById }
}
