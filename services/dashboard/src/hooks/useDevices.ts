// Custom hook for device management

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Device } from '@/lib/types'

export interface FleetStats {
  total: number
  online: number
  offline: number
  error: number
  byType: Record<string, number>
}

export function useDevices(autoRefresh = true, interval = 5000) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = async () => {
    try {
      setError(null)
      const data = await api.listDevices()
      setDevices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()

    if (autoRefresh) {
      const timer = setInterval(fetchDevices, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval])

  return { devices, loading, error, refresh: fetchDevices }
}

export function useFleetStats(devices: Device[]): FleetStats {
  return {
    total: devices.length,
    online: devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    error: devices.filter(d => d.status === 'error').length,
    byType: devices.reduce((acc, device) => {
      acc[device.device_type] = (acc[device.device_type] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  }
}
