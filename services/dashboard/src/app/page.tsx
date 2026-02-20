'use client'

import Link from 'next/link'
import { useDevices, useFleetStats } from '@/hooks/useDevices'
import { useActivityFeed, type ActivityItem, type ActivityCategory } from '@/hooks/useActivityFeed'
import { StatsCard } from '@/components/StatsCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Card } from '@/components/Card'
import {
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  ChevronRight,
  DEVICE_TYPE_ICONS,
  DEFAULT_DEVICE_ICON,
  Boxes,
  GitFork,
  Monitor,
} from '@/components/icons'
import type { Device } from '@/lib/types'

export default function Home() {
  const { devices, loading } = useDevices(true, 10000)
  const stats = useFleetStats(devices)
  const { items: activityItems, isConnected } = useActivityFeed(50)

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Compact header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Fleet overview and activity</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="text-xs text-slate-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Fleet stats bar */}
        <div className="grid grid-cols-4 gap-3">
          <StatsCard title="Total Devices" value={stats.total} icon={Activity} />
          <StatsCard title="Online" value={stats.online} icon={CheckCircle2} />
          <StatsCard title="Offline" value={stats.offline} icon={PauseCircle} />
          <StatsCard title="Errors" value={stats.error} icon={AlertTriangle} />
        </div>

        {/* Device summary */}
        <Card
          title="Devices"
          action={
            <Link
              href="/devices"
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-blue-400 transition-colors"
            >
              View All
              <ChevronRight className="w-4 h-4" />
            </Link>
          }
        >
          {loading && <p className="text-sm text-slate-500">Loading devices...</p>}
          {!loading && devices.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-3">No devices registered yet.</p>
              <Link
                href="/devices"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                <Monitor className="w-4 h-4" />
                Register a Device
              </Link>
            </div>
          )}
          {!loading && devices.length > 0 && (
            <div className="space-y-1">
              {devices.slice(0, 6).map((device) => (
                <CompactDeviceRow key={device.id} device={device} />
              ))}
              {devices.length > 6 && (
                <Link
                  href="/devices"
                  className="block text-center text-sm text-slate-500 hover:text-blue-400 py-2 transition-colors"
                >
                  +{devices.length - 6} more devices
                </Link>
              )}
            </div>
          )}
        </Card>

        {/* Quick navigation */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/entities"
            className="flex items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-colors group"
          >
            <Boxes className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <div>
              <p className="text-sm font-medium group-hover:text-blue-400 transition-colors">Entities</p>
              <p className="text-xs text-slate-500">Spaces, rooms, state</p>
            </div>
          </Link>
          <Link
            href="/routing"
            className="flex items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-colors group"
          >
            <GitFork className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <div>
              <p className="text-sm font-medium group-hover:text-blue-400 transition-colors">Routing</p>
              <p className="text-xs text-slate-500">Signal patching</p>
            </div>
          </Link>
          <Link
            href="/devices"
            className="flex items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-colors group"
          >
            <Monitor className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <div>
              <p className="text-sm font-medium group-hover:text-blue-400 transition-colors">Devices</p>
              <p className="text-xs text-slate-500">Fleet management</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Activity feed sidebar */}
      <div className="w-80 border-l border-slate-800 bg-slate-900/50 overflow-auto p-4 shrink-0">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Live Activity
        </h2>
        {activityItems.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">
            {isConnected ? 'Waiting for events...' : 'Connecting to message bus...'}
          </p>
        )}
        <div className="space-y-0.5">
          {activityItems.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  )
}

function CompactDeviceRow({ device }: { device: Device }) {
  const Icon = DEVICE_TYPE_ICONS[device.device_type] || DEFAULT_DEVICE_ICON

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
      <div className="w-7 h-7 rounded bg-slate-700/50 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{device.name}</p>
        <p className="text-xs text-slate-500">{device.device_type.replace('_', ' ')}</p>
      </div>
      <StatusBadge status={device.status} />
    </div>
  )
}

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  device: 'border-green-600',
  entity: 'border-blue-600',
  route: 'border-purple-600',
  system: 'border-slate-600',
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className={`flex gap-3 py-2 border-l-2 pl-3 ${CATEGORY_COLORS[item.category]}`}>
      <span className="text-[10px] text-slate-600 w-8 shrink-0 text-right tabular-nums">
        {formatRelativeTime(item.timestamp)}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-300 truncate">{item.title}</p>
        <p className="text-[10px] text-slate-500 truncate">{item.detail}</p>
      </div>
    </div>
  )
}
