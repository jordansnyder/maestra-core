// Cloud Gateway TypeScript types

export interface CloudConfig {
  gateway_url: string | null
  site_id: string | null
  site_slug: string | null
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export interface CloudPolicy {
  subject_pattern: string
  direction: 'outbound' | 'inbound'
  enabled: boolean
  description?: string
}

export interface CloudStatus {
  configured: boolean
  gateway_url: string | null
  site_id: string | null
  site_slug: string | null
  agent_running: boolean
  agent_connected: boolean
  last_heartbeat: string | null
  messages_sent: number
  messages_received: number
  active_policies: number
  error: string | null
}

export interface CloudTestResult {
  success: boolean
  latency_ms: number | null
  error: string | null
  checks: Record<string, boolean>
}

export interface CloudSiteRegister {
  gateway_url: string
  name: string
  slug: string
  description?: string
  region?: string
  tags?: string[]
}
