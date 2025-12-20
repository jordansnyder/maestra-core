// Maestra API Client

import type { Device, DeviceRegistration, DeviceMetric, DeviceEvent, FleetStats } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

class MaestraAPI {
  private baseUrl: string

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Health & Status
  async getHealth() {
    return this.fetch<{ status: string; service: string; timestamp: string }>('/health')
  }

  async getStatus() {
    return this.fetch<{
      service: string
      version: string
      devices: FleetStats
      timestamp: string
    }>('/status')
  }

  // Device Management
  async listDevices(params?: {
    device_type?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<Device[]> {
    const query = new URLSearchParams(params as any).toString()
    return this.fetch<Device[]>(`/devices${query ? `?${query}` : ''}`)
  }

  async getDevice(deviceId: string): Promise<Device> {
    return this.fetch<Device>(`/devices/${deviceId}`)
  }

  async registerDevice(device: DeviceRegistration): Promise<Device> {
    return this.fetch<Device>('/devices/register', {
      method: 'POST',
      body: JSON.stringify(device),
    })
  }

  async deleteDevice(deviceId: string): Promise<{ status: string; device_id: string }> {
    return this.fetch(`/devices/${deviceId}`, {
      method: 'DELETE',
    })
  }

  async sendHeartbeat(hardwareId: string, status?: string, metadata?: Record<string, any>) {
    return this.fetch('/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        hardware_id: hardwareId,
        status,
        metadata,
      }),
    })
  }

  // Metrics
  async submitMetric(metric: DeviceMetric) {
    return this.fetch('/metrics', {
      method: 'POST',
      body: JSON.stringify(metric),
    })
  }

  // Events
  async submitEvent(event: DeviceEvent) {
    return this.fetch('/events', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  }
}

export const api = new MaestraAPI()
