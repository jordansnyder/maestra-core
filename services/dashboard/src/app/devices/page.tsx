'use client'

import { useState } from 'react'
import { useDevices, useFleetStats } from '@/hooks/useDevices'
import { usePendingDevices, useBlockedDevices } from '@/hooks/useDiscovery'
import { useDeviceConfigs } from '@/hooks/useDeviceConfigs'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/Card'
import { StatsCard } from '@/components/StatsCard'
import { DeviceCard } from '@/components/DeviceCard'
import { PendingDeviceCard } from '@/components/PendingDeviceCard'
import { ApproveDeviceModal } from '@/components/ApproveDeviceModal'
import { BlockedDevicesList } from '@/components/BlockedDevicesList'
import {
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  Plus,
  Search,
  Monitor,
  FileCode,
} from '@/components/icons'
import { EmptyState } from '@/components/EmptyState'
import { getDocsUrl } from '@/lib/hosts'
import { devicesApi, discoveryApi, deviceConfigsApi } from '@/lib/api'
import type { Device, DeviceApproval, DeviceHardwareConfig } from '@/lib/types'

type Tab = 'active' | 'pending' | 'blocked' | 'configs'

export default function DevicesPage() {
  const { devices, loading, error, refresh } = useDevices(true, 10000)
  const { devices: pendingDevices, refresh: refreshPending } = usePendingDevices(true, 5000)
  const { devices: blockedDevices, refresh: refreshBlocked } = useBlockedDevices()
  const { configs, refresh: refreshConfigs } = useDeviceConfigs()
  const stats = useFleetStats(devices)
  const { toast, confirm } = useToast()

  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [approveDevice, setApproveDevice] = useState<Device | null>(null)
  const [registerForm, setRegisterForm] = useState({
    name: '',
    device_type: 'arduino',
    hardware_id: '',
    ip_address: '',
  })

  // Device config state
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [editingConfig, setEditingConfig] = useState<DeviceHardwareConfig | null>(null)
  const [configForm, setConfigForm] = useState({ hardware_id: '', name: '', configJson: '{}' })
  const [configJsonError, setConfigJsonError] = useState<string | null>(null)

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

  const handleApproveConfirm = async (device: Device, approval: DeviceApproval) => {
    try {
      await discoveryApi.approve(device.id, approval)
      setApproveDevice(null)
      refreshPending()
      refresh()
      toast({ message: `Device "${device.name}" approved`, type: 'success' })
    } catch (err) {
      toast({ message: `Failed to approve device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const handleReject = async (device: Device) => {
    const ok = await confirm({
      title: 'Reject Device',
      message: `Reject device "${device.name}" (${device.hardware_id})? It will be removed from the pending list.`,
      confirmLabel: 'Reject',
      destructive: true,
    })
    if (!ok) return
    try {
      await discoveryApi.reject(device.id)
      refreshPending()
      toast({ message: `Device "${device.name}" rejected`, type: 'success' })
    } catch (err) {
      toast({ message: `Failed to reject device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const handleBlock = async (device: Device) => {
    const ok = await confirm({
      title: 'Block Device',
      message: `Block device "${device.name}" (${device.hardware_id})? Its hardware ID will be permanently blocked from discovery.`,
      confirmLabel: 'Block',
      destructive: true,
    })
    if (!ok) return
    try {
      await discoveryApi.block(device.id)
      refreshPending()
      refreshBlocked()
      toast({ message: `Device "${device.name}" blocked`, type: 'success' })
    } catch (err) {
      toast({ message: `Failed to block device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const handleUnblock = async (hardwareId: string) => {
    const ok = await confirm({
      title: 'Unblock Device',
      message: `Unblock hardware ID "${hardwareId}"? This device will be able to appear in discovery again.`,
      confirmLabel: 'Unblock',
    })
    if (!ok) return
    try {
      await discoveryApi.unblock(hardwareId)
      refreshBlocked()
      toast({ message: `Device unblocked`, type: 'success' })
    } catch (err) {
      toast({ message: `Failed to unblock device: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  // Device config handlers
  const openCreateConfig = () => {
    setEditingConfig(null)
    setConfigForm({ hardware_id: '', name: '', configJson: '{}' })
    setConfigJsonError(null)
    setShowConfigModal(true)
  }

  const openEditConfig = (config: DeviceHardwareConfig) => {
    setEditingConfig(config)
    setConfigForm({
      hardware_id: config.hardware_id,
      name: config.name || '',
      configJson: JSON.stringify(config.configuration, null, 2),
    })
    setConfigJsonError(null)
    setShowConfigModal(true)
  }

  const handleSaveConfig = async () => {
    let parsedConfig: Record<string, unknown>
    try {
      parsedConfig = JSON.parse(configForm.configJson)
    } catch {
      setConfigJsonError('Invalid JSON')
      return
    }

    try {
      if (editingConfig) {
        await deviceConfigsApi.update(editingConfig.hardware_id, {
          name: configForm.name || undefined,
          configuration: parsedConfig,
        })
        toast({ message: 'Config updated', type: 'success' })
      } else {
        await deviceConfigsApi.create({
          hardware_id: configForm.hardware_id,
          name: configForm.name || undefined,
          configuration: parsedConfig,
        })
        toast({ message: 'Config created', type: 'success' })
      }
      setShowConfigModal(false)
      refreshConfigs()
    } catch (err) {
      toast({ message: `Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  const handleDeleteConfig = async (config: DeviceHardwareConfig) => {
    const ok = await confirm({
      title: 'Delete Config',
      message: `Delete configuration for "${config.hardware_id}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deviceConfigsApi.delete(config.hardware_id)
      refreshConfigs()
      toast({ message: 'Config deleted', type: 'success' })
    } catch (err) {
      toast({ message: `Failed to delete config: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    }
  }

  // Filter active (non-pending) devices
  const activeDevices = devices.filter(d => d.status !== 'pending')
  const filteredDevices = activeDevices.filter((d) => {
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterType && d.device_type !== filterType) return false
    if (filterStatus && d.status !== filterStatus) return false
    return true
  })

  const deviceTypes = [...new Set(activeDevices.map((d) => d.device_type))]

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'active', label: 'Active', count: activeDevices.length },
    { key: 'pending', label: 'Pending', count: pendingDevices.length },
    { key: 'blocked', label: 'Blocked', count: blockedDevices.length },
    { key: 'configs', label: 'Configs', count: configs.length },
  ]

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Devices</h1>
              <p className="text-sm text-slate-400 mt-1">Register, discover, and manage fleet devices</p>
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
          <StatsCard title="Pending" value={pendingDevices.length} icon={AlertTriangle} />
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

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-700">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                  tab.key === 'pending' && tab.count > 0
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active Devices Tab */}
        {activeTab === 'active' && (
          <>
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
              activeDevices.length === 0 ? (
                <EmptyState
                  icon={Monitor}
                  title="No devices registered"
                  description="Devices connect to Maestra via MQTT, WebSocket, or OSC. Register your first device, or enable auto-discovery to detect devices on your network."
                  action={{ label: 'Register a Device', onClick: () => setShowRegisterForm(true) }}
                  secondaryAction={{ label: 'Read the Device Guide', href: getDocsUrl('/guides/device-registration/') }}
                />
              ) : (
                <p className="text-slate-400 text-center py-12">
                  No devices match your filters.
                </p>
              )
            )}

            {!loading && filteredDevices.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDevices.map((device) => (
                  <DeviceCard key={device.id} device={device} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Pending Devices Tab */}
        {activeTab === 'pending' && (
          <>
            {pendingDevices.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg mb-2">No pending devices</p>
                <p className="text-sm">Devices discovered via mDNS on your network will appear here for approval.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingDevices.map(device => (
                  <PendingDeviceCard
                    key={device.id}
                    device={device}
                    onApprove={setApproveDevice}
                    onReject={handleReject}
                    onBlock={handleBlock}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Blocked Devices Tab */}
        {activeTab === 'blocked' && (
          <BlockedDevicesList devices={blockedDevices} onUnblock={handleUnblock} />
        )}

        {/* Device Configs Tab */}
        {activeTab === 'configs' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-slate-400">
                Pre-provision JSON configurations for devices by MAC address / hardware ID.
                Configs are delivered automatically when devices connect.
              </p>
              <button
                onClick={openCreateConfig}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Config
              </button>
            </div>

            {configs.length === 0 ? (
              <EmptyState
                icon={FileCode}
                title="No device configs"
                description="Create a configuration for a hardware ID (MAC address). When that device connects via mDNS discovery, it will automatically receive this config."
                action={{ label: 'Create Config', onClick: openCreateConfig }}
              />
            ) : (
              <div className="space-y-3">
                {configs.map(config => (
                  <div
                    key={config.id}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <FileCode className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-white">{config.hardware_id}</span>
                          {config.name && (
                            <span className="text-sm text-slate-400">({config.name})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>{Object.keys(config.configuration).length} keys</span>
                          <span>Updated {new Date(config.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditConfig(config)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config)}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Approve Device Modal */}
      {approveDevice && (
        <ApproveDeviceModal
          device={approveDevice}
          onConfirm={handleApproveConfirm}
          onCancel={() => setApproveDevice(null)}
        />
      )}

      {/* Device Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">
              {editingConfig ? 'Edit Device Config' : 'New Device Config'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Hardware ID (MAC Address)</label>
                <input
                  type="text"
                  required
                  value={configForm.hardware_id}
                  onChange={(e) => setConfigForm({ ...configForm, hardware_id: e.target.value })}
                  disabled={!!editingConfig}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500 ${editingConfig ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="AA:BB:CC:DD:EE:FF"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Name (optional)</label>
                <input
                  type="text"
                  value={configForm.name}
                  onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Lobby Sensor Pod #3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Configuration (JSON)</label>
                <textarea
                  value={configForm.configJson}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, configJson: e.target.value })
                    setConfigJsonError(null)
                  }}
                  rows={10}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                  spellCheck={false}
                />
                {configJsonError && (
                  <p className="text-red-400 text-xs mt-1">{configJsonError}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={!configForm.hardware_id}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingConfig ? 'Save Changes' : 'Create Config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
