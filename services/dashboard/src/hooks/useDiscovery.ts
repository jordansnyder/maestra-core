// Custom hook for device discovery management

import { useEffect, useState, useCallback } from 'react'
import { discoveryApi } from '@/lib/api'
import type { Device, BlockedDevice } from '@/lib/types'

export function usePendingDevices(autoRefresh = true, interval = 5000) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      setError(null)
      const data = await discoveryApi.listPending()
      setDevices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pending devices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()

    if (autoRefresh) {
      const timer = setInterval(fetchPending, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval, fetchPending])

  return { devices, loading, error, refresh: fetchPending }
}

export function useBlockedDevices() {
  const [devices, setDevices] = useState<BlockedDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBlocked = useCallback(async () => {
    try {
      setError(null)
      const data = await discoveryApi.listBlocked()
      setDevices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch blocked devices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBlocked()
  }, [fetchBlocked])

  return { devices, loading, error, refresh: fetchBlocked }
}
