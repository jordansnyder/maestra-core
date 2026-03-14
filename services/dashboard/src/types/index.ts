// Maestra Dashboard Type Definitions

export interface Device {
  id: string
  name: string
  device_type: 'arduino' | 'raspberry_pi' | 'esp32' | 'touchdesigner' | 'max_msp' | 'unreal_engine' | 'web_client' | 'mobile_client'
  hardware_id: string
  firmware_version?: string
  ip_address?: string
  location?: Record<string, unknown>
  metadata?: Record<string, unknown>
  status: 'online' | 'offline' | 'error' | 'maintenance'
  last_seen?: string
  created_at: string
  updated_at: string
}

export interface DeviceRegistration {
  name: string
  device_type: string
  hardware_id: string
  firmware_version?: string
  ip_address?: string
  location?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface DeviceMetric {
  time: string
  device_id: string
  metric_name: string
  metric_value: number
  unit?: string
  tags?: Record<string, unknown>
}

export interface DeviceEvent {
  time: string
  device_id: string
  event_type: string
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical'
  message?: string
  data?: Record<string, unknown>
}

export interface ServiceStatus {
  name: string
  url: string
  status: 'checking' | 'healthy' | 'unhealthy'
  responseTime?: number
  lastCheck?: string
}

export interface MQTTMessage {
  topic: string
  payload: string
  timestamp: string
  qos: number
}

export interface WebSocketMessage {
  type: 'message' | 'error' | 'welcome' | 'ack' | 'pong'
  subject?: string
  data?: unknown
  timestamp: string
}

export interface SystemMetrics {
  cpu: number
  memory: number
  disk: number
  network: {
    rx: number
    tx: number
  }
}

export interface FleetStats {
  total: number
  online: number
  offline: number
  error: number
  byType: Record<string, number>
}
