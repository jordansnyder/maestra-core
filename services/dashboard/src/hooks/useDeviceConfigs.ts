// Custom hook for device hardware config management

import { useEffect, useState, useCallback } from 'react'
import { deviceConfigsApi } from '@/lib/api'
import type { DeviceHardwareConfig } from '@/lib/types'

export function useDeviceConfigs(autoRefresh = false, interval = 10000) {
  const [configs, setConfigs] = useState<DeviceHardwareConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      setError(null)
      const data = await deviceConfigsApi.list()
      setConfigs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch device configs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()

    if (autoRefresh) {
      const timer = setInterval(fetchConfigs, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval, fetchConfigs])

  return { configs, loading, error, refresh: fetchConfigs }
}
