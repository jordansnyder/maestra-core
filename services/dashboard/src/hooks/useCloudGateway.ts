// Custom hook for cloud gateway state management

import { useEffect, useState, useCallback } from 'react'
import { cloudApi } from '@/lib/api'
import type { CloudConfig, CloudPolicy, CloudStatus, CloudTestResult, CloudSiteRegister } from '@/lib/cloudTypes'

export interface UseCloudGatewayReturn {
  // Data
  config: CloudConfig | null
  status: CloudStatus | null
  policies: CloudPolicy[]

  // State
  loading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
  saveConfig: (gatewayUrl: string) => Promise<boolean>
  disconnect: () => Promise<void>
  register: (data: CloudSiteRegister) => Promise<{ id: string } | null>
  activate: () => Promise<boolean>
  issueCertificates: () => Promise<boolean>
  savePolicies: (policies: CloudPolicy[]) => Promise<boolean>
  testConnection: () => Promise<CloudTestResult | null>
}

export function useCloudGateway(autoRefresh = false, interval = 10000): UseCloudGatewayReturn {
  const [config, setConfig] = useState<CloudConfig | null>(null)
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [policies, setPolicies] = useState<CloudPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      setError(null)
      const [cfg, sts, pols] = await Promise.all([
        cloudApi.getConfig(),
        cloudApi.getStatus(),
        cloudApi.getPolicies().catch(() => [] as CloudPolicy[]),
      ])
      setConfig(cfg)
      setStatus(sts)
      setPolicies(pols)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cloud state')
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

  const saveConfig = useCallback(async (gatewayUrl: string): Promise<boolean> => {
    try {
      const cfg = await cloudApi.saveConfig({ gateway_url: gatewayUrl })
      setConfig(cfg)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config')
      return false
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await cloudApi.deleteConfig()
      setConfig({ gateway_url: null, site_id: null, site_slug: null, status: 'disconnected' })
      setStatus(null)
      setPolicies([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }, [])

  const register = useCallback(async (data: CloudSiteRegister): Promise<{ id: string } | null> => {
    try {
      const result = await cloudApi.register(data)
      await fetchState()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register site')
      return null
    }
  }, [fetchState])

  const activate = useCallback(async (): Promise<boolean> => {
    try {
      await cloudApi.activate()
      await fetchState()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate site')
      return false
    }
  }, [fetchState])

  const issueCertificates = useCallback(async (): Promise<boolean> => {
    try {
      await cloudApi.issueCertificates()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue certificates')
      return false
    }
  }, [])

  const savePolicies = useCallback(async (newPolicies: CloudPolicy[]): Promise<boolean> => {
    try {
      const saved = await cloudApi.savePolicies(newPolicies)
      setPolicies(saved)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policies')
      return false
    }
  }, [])

  const testConnection = useCallback(async (): Promise<CloudTestResult | null> => {
    try {
      return await cloudApi.test()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test connection')
      return null
    }
  }, [])

  return {
    config,
    status,
    policies,
    loading,
    error,
    refresh: fetchState,
    saveConfig,
    disconnect,
    register,
    activate,
    issueCertificates,
    savePolicies,
    testConnection,
  }
}
