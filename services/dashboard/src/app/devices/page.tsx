'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useDevices, useFleetStats } from '@/hooks/useDevices'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/Card'
import { StatsCard } from '@/components/StatsCard'
import { DeviceCard } from '@/components/DeviceCard'
import {
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  Plus,
  Search,
  DEVICE_TYPE_ICONS,
} from '@/components/icons'
import { devicesApi } from '@/lib/api'
import type { Device } from '@/lib/types'

export default function DevicesPage() {
  const { devices, loading, error, refresh } = useDevices(true, 10000)
  const stats = useFleetStats(devices)
  const { toast, confirm } = useToast()

  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [registerForm, setRegisterForm] = useState({
    name: '',
    device_type: 'arduino',
    hardware_id: '',
    ip_address: '',
  })

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await devicesApi.register(registerForm)
      setShowRegisterForm(false)
      setRegisterForm({ name: '', device_type: 'arduino', hardware_id: '', ip_address: '' })
      refresh()
      toast({ message: 'Device registered successfully', type: 'success' })
    } catch (err) {
      toast({ message: `Failed to register device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const handleDelete = async (device: Device) => {
    const ok = await confirm({
      title: 'Delete Device',
      message: `Delete device "${device.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await devicesApi.delete(device.id)
      refresh()
      toast({ message: `Device "${device.name}" deleted`, type: 'success' })
    } catch (err) {
      toast({ message: `Failed to delete device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const filteredDevices = devices.filter((d) => {
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterType && d.device_type !== filterType) return false
    if (filterStatus && d.status !== filterStatus) return false
    return true
  })

  const deviceTypes = [...new Set(devices.map((d) => d.device_type))]

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Devices</h1>
              <p className="text-sm text-slate-400 mt-1">Register and manage fleet devices</p>
            </div>
            <button
              onClick={() => setShowRegisterForm(!showRegisterForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {showRegisterForm ? 'Cancel' : 'Register Device'}
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatsCard title="Total Devices" value={stats.total} icon={Activity} />
          <StatsCard title="Online" value={stats.online} icon={CheckCircle2} />
          <StatsCard title="Offline" value={stats.offline} icon={PauseCircle} />
          <StatsCard title="Errors" value={stats.error} icon={AlertTriangle} />
        </div>

        {/* Registration form */}
        {showRegisterForm && (
          <Card className="mb-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Register New Device</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Device Name</label>
                  <input
                    type="text"
                    required
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="My Arduino Sensor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Device Type</label>
                  <select
                    value={registerForm.device_type}
                    onChange={(e) => setRegisterForm({ ...registerForm, device_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
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
                    onChange={(e) => setRegisterForm({ ...registerForm, hardware_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g., MAC address, serial number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IP Address (Optional)</label>
                  <input
                    type="text"
                    value={registerForm.ip_address}
                    onChange={(e) => setRegisterForm({ ...registerForm, ip_address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="192.168.1.100"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
              >
                Register Device
              </button>
            </form>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All Types</option>
            {deviceTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        {/* Device grid */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg">
            <p className="text-red-400">Error: {error}</p>
            <button onClick={refresh} className="mt-2 text-sm text-red-300 underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filteredDevices.length === 0 && (
          <p className="text-slate-400 text-center py-12">
            {devices.length === 0
              ? 'No devices registered. Click "Register Device" to add your first device.'
              : 'No devices match your filters.'}
          </p>
        )}

        {!loading && filteredDevices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map((device) => (
              <DeviceCard key={device.id} device={device} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
