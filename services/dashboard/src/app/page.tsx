'use client'

import { useState } from 'react'
import { useDevices, useFleetStats } from '@/hooks/useDevices'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Card } from '@/components/Card'
import { StatsCard } from '@/components/StatsCard'
import { DeviceCard } from '@/components/DeviceCard'
import { StatusBadge } from '@/components/StatusBadge'
import type { Device, ServiceStatus } from '@/types'
import { api } from '@/lib/api'

const services: ServiceStatus[] = [
  { name: 'Fleet Manager', url: 'http://localhost:8080/health', status: 'checking' },
  { name: 'NATS', url: 'http://localhost:8222', status: 'checking' },
  { name: 'Node-RED', url: 'http://localhost:1880', status: 'checking' },
  { name: 'Grafana', url: 'http://localhost:3000', status: 'checking' },
]

export default function Home() {
  const { devices, loading, error, refresh } = useDevices(true, 10000)
  const stats = useFleetStats(devices)
  const { isConnected, lastMessage } = useWebSocket(true)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [registerForm, setRegisterForm] = useState({
    name: '',
    device_type: 'arduino',
    hardware_id: '',
    ip_address: '',
  })

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.registerDevice(registerForm)
      setShowRegisterForm(false)
      setRegisterForm({ name: '', device_type: 'arduino', hardware_id: '', ip_address: '' })
      refresh()
    } catch (err) {
      console.error('Failed to register device:', err)
      alert('Failed to register device')
    }
  }

  const handleDelete = async (device: Device) => {
    if (!confirm(`Delete device "${device.name}"?`)) return
    try {
      await api.deleteDevice(device.id)
      refresh()
    } catch (err) {
      console.error('Failed to delete device:', err)
      alert('Failed to delete device')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Maestra Dashboard
              </h1>
              <p className="text-slate-400 text-lg">
                Immersive Experience Infrastructure Control Panel
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
                  }`}
                />
                <span className="text-sm text-slate-400">
                  WebSocket {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Fleet Statistics */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Fleet Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Total Devices" value={stats.total} icon="📟" />
            <StatsCard title="Online" value={stats.online} icon="✅" />
            <StatsCard title="Offline" value={stats.offline} icon="⏸️" />
            <StatsCard title="Error State" value={stats.error} icon="⚠️" />
          </div>
        </section>

        {/* Device Management */}
        <section className="mb-8">
          <Card
            title="Devices"
            action={
              <button
                onClick={() => setShowRegisterForm(!showRegisterForm)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
              >
                {showRegisterForm ? 'Cancel' : '+ Register Device'}
              </button>
            }
          >
            {showRegisterForm && (
              <form onSubmit={handleRegister} className="mb-6 p-4 bg-slate-900 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Device Name</label>
                    <input
                      type="text"
                      required
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Device Type</label>
                    <select
                      value={registerForm.device_type}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, device_type: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                    >
                      <option value="arduino">Arduino</option>
                      <option value="raspberry_pi">Raspberry Pi</option>
                      <option value="esp32">ESP32</option>
                      <option value="touchdesigner">TouchDesigner</option>
                      <option value="max_msp">Max/MSP</option>
                      <option value="unreal_engine">Unreal Engine</option>
                      <option value="web_client">Web Client</option>
                      <option value="mobile_client">Mobile Client</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Hardware ID</label>
                    <input
                      type="text"
                      required
                      value={registerForm.hardware_id}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, hardware_id: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                      placeholder="e.g., MAC address, serial number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">IP Address (Optional)</label>
                    <input
                      type="text"
                      value={registerForm.ip_address}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, ip_address: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                      placeholder="192.168.1.100"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md font-medium transition-colors"
                >
                  Register Device
                </button>
              </form>
            )}

            {loading && <p className="text-slate-400">Loading devices...</p>}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500 rounded-md">
                <p className="text-red-400">Error: {error}</p>
                <button onClick={refresh} className="mt-2 text-sm text-red-300 underline">
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && devices.length === 0 && (
              <p className="text-slate-400 text-center py-8">
                No devices registered. Click "Register Device" to add your first device.
              </p>
            )}

            {!loading && devices.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devices.map((device) => (
                  <DeviceCard key={device.id} device={device} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Quick Links */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLink
              title="Entities"
              description="Manage spaces, rooms, and state"
              url="/entities"
              icon="🏗️"
              internal
            />
            <QuickLink
              title="Node-RED"
              description="Visual programming and automation"
              url="http://localhost:1880"
              icon="🔧"
            />
            <QuickLink
              title="Grafana"
              description="Monitoring and analytics"
              url="http://localhost:3000"
              icon="📊"
            />
            <QuickLink
              title="Fleet Manager API"
              description="Device management API docs"
              url="http://localhost:8080/docs"
              icon="🚀"
            />
            <QuickLink
              title="Portainer"
              description="Container management"
              url="https://localhost:9443"
              icon="🐳"
            />
            <QuickLink
              title="Traefik"
              description="Reverse proxy dashboard"
              url="http://localhost:8081"
              icon="🔀"
            />
            <QuickLink
              title="MQTT Monitor"
              description="Real-time message monitoring"
              url="#"
              icon="📡"
              onClick={() => alert('MQTT Monitor coming soon!')}
            />
          </div>
        </section>

        {/* WebSocket Messages */}
        {lastMessage && (
          <section>
            <Card title="Latest WebSocket Message">
              <pre className="text-xs bg-slate-900 p-4 rounded-md overflow-auto">
                {JSON.stringify(lastMessage, null, 2)}
              </pre>
            </Card>
          </section>
        )}
      </div>
    </div>
  )
}

function QuickLink({ title, description, url, icon, internal }: {
  title: string
  description: string
  url: string
  icon: string
  internal?: boolean
}) {
  const className = "block bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-blue-500 transition-colors group"

  const content = (
    <div className="flex items-start gap-4">
      <span className="text-3xl">{icon}</span>
      <div>
        <h3 className="font-semibold mb-1 group-hover:text-blue-400 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </div>
  )

  if (internal) {
    return (
      <a href={url} className={className}>
        {content}
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  )
}
