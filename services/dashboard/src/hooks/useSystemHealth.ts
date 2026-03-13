import { useState, useEffect, useCallback, useRef } from 'react'
import { healthApi } from '@/lib/api'

export interface ServiceHealth {
  name: string
  status: 'healthy' | 'unhealthy' | 'checking'
}

export interface SystemHealthState {
  services: ServiceHealth[]
  overallStatus: 'healthy' | 'degraded' | 'down' | 'checking'
}

const INITIAL_SERVICES: ServiceHealth[] = [
  { name: 'Fleet Manager', status: 'checking' },
  { name: 'Message Bus', status: 'checking' },
  { name: 'Database', status: 'checking' },
]

export function useSystemHealth(pollInterval = 30000): SystemHealthState {
  const [services, setServices] = useState<ServiceHealth[]>(INITIAL_SERVICES)
  const intervalRef = useRef<NodeJS.Timeout>()

  const checkHealth = useCallback(async () => {
    const results: ServiceHealth[] = []

    // Check Fleet Manager health
    try {
      const health = await healthApi.check()
      results.push({ name: 'Fleet Manager', status: health.status === 'healthy' ? 'healthy' : 'unhealthy' })
    } catch {
      results.push({ name: 'Fleet Manager', status: 'unhealthy' })
    }

    // Check message bus and DB via /status endpoint (Fleet Manager reports these)
    try {
      const status = await healthApi.status()
      results.push({
        name: 'Message Bus',
        status: status.message_bus.connected ? 'healthy' : 'unhealthy',
      })
      // If we can get status with device/entity counts, the DB is up
      results.push({ name: 'Database', status: 'healthy' })
    } catch {
      results.push({ name: 'Message Bus', status: 'unhealthy' })
      results.push({ name: 'Database', status: 'unhealthy' })
    }

    setServices(results)
  }, [])

  useEffect(() => {
    checkHealth()
    intervalRef.current = setInterval(checkHealth, pollInterval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [checkHealth, pollInterval])

  const healthyCount = services.filter((s) => s.status === 'healthy').length
  const checkingCount = services.filter((s) => s.status === 'checking').length

  let overallStatus: SystemHealthState['overallStatus']
  if (checkingCount === services.length) {
    overallStatus = 'checking'
  } else if (healthyCount === services.length) {
    overallStatus = 'healthy'
  } else if (healthyCount === 0) {
    overallStatus = 'down'
  } else {
    overallStatus = 'degraded'
  }

  return { services, overallStatus }
}
