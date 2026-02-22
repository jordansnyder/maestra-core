// Custom hook for routing state management

import { useEffect, useState, useCallback } from 'react'
import { routingApi } from '@/lib/api'
import type { RoutingDevice, RouteData, RoutePreset, RouteCreate } from '@/lib/types'

export interface UseRoutingReturn {
  // Data
  devices: RoutingDevice[]
  routes: RouteData[]
  presets: RoutePreset[]

  // State
  loading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
  addRoute: (route: RouteCreate) => Promise<void>
  removeRoute: (route: RouteCreate) => Promise<void>
  clearRoutes: () => Promise<void>

  // Preset actions
  createPreset: (name: string, description?: string) => Promise<RoutePreset | null>
  deletePreset: (id: string) => Promise<void>
  saveToPreset: (presetId: string) => Promise<void>
  recallPreset: (presetId: string) => Promise<void>

  // Device position saving
  savePositions: (positions: Record<string, { x: number; y: number }>) => Promise<void>
}

export function useRouting(autoRefresh = false, interval = 10000): UseRoutingReturn {
  const [devices, setDevices] = useState<RoutingDevice[]>([])
  const [routes, setRoutes] = useState<RouteData[]>([])
  const [presets, setPresets] = useState<RoutePreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      setError(null)
      const state = await routingApi.getState()
      setDevices(state.devices)
      setRoutes(state.routes)
      setPresets(state.presets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch routing state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()

    if (autoRefresh) {
      const timer = setInterval(fetchState, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval, fetchState])

  const addRoute = useCallback(async (route: RouteCreate) => {
    try {
      const newRoute = await routingApi.createRoute(route)
      setRoutes((prev) => [...prev, newRoute])
    } catch (err) {
      // If it's a duplicate, just ignore
      if (err instanceof Error && err.message.includes('already exists')) return
      setError(err instanceof Error ? err.message : 'Failed to create route')
    }
  }, [])

  const removeRoute = useCallback(async (route: RouteCreate) => {
    try {
      await routingApi.deleteRoute(route)
      setRoutes((prev) =>
        prev.filter(
          (r) =>
            !(r.from === route.from && r.fromPort === route.fromPort &&
              r.to === route.to && r.toPort === route.toPort)
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route')
    }
  }, [])

  const clearRoutes = useCallback(async () => {
    try {
      await routingApi.clearRoutes()
      setRoutes([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear routes')
    }
  }, [])

  const createPreset = useCallback(async (name: string, description?: string) => {
    try {
      const preset = await routingApi.createPreset({ name, description })
      setPresets((prev) => [...prev, preset])
      return preset
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preset')
      return null
    }
  }, [])

  const deletePreset = useCallback(async (id: string) => {
    try {
      await routingApi.deletePreset(id)
      setPresets((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset')
    }
  }, [])

  const saveToPreset = useCallback(async (presetId: string) => {
    try {
      await routingApi.saveToPreset(presetId)
      // Refresh preset counts
      const freshPresets = await routingApi.listPresets()
      setPresets(freshPresets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to preset')
    }
  }, [])

  const recallPreset = useCallback(async (presetId: string) => {
    try {
      await routingApi.recallPreset(presetId)
      // Refresh full state (routes changed + preset active flag changed)
      await fetchState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recall preset')
    }
  }, [fetchState])

  const savePositions = useCallback(async (positions: Record<string, { x: number; y: number }>) => {
    try {
      await routingApi.updatePositions(positions)
    } catch {
      // Silent fail for position saves — non-critical
    }
  }, [])

  return {
    devices,
    routes,
    presets,
    loading,
    error,
    refresh: fetchState,
    addRoute,
    removeRoute,
    clearRoutes,
    createPreset,
    deletePreset,
    saveToPreset,
    recallPreset,
    savePositions,
  }
}
