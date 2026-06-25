'use client'

import Link from 'next/link'
import { useDevices } from '@/hooks/useDevices'
import { Card } from '@/components/Card'
import { ChevronRight, Monitor } from '@/components/icons'

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-fg-subtle',
  error: 'bg-red-400',
  maintenance: 'bg-amber-400',
}

export function DeviceOverviewWidget() {
  const { devices, loading, error, refresh } = useDevices(true, 15000)

  const onlineCount = devices.filter(d => d.status === 'online').length
  const total = devices.filter(d => d.status !== 'pending').length
  const onlinePercent = total > 0 ? (onlineCount / total) * 100 : 0

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <div className="h-4 w-24 bg-surface-2/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-surface-2/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-surface-2/30 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-surface-2/30 rounded animate-pulse" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">Failed to load devices</span>
          <button onClick={refresh} className="text-xs text-accent hover:text-accent">Retry</button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-fg-subtle" />
          <h3 className="text-sm font-semibold text-fg">Devices</h3>
        </div>
        <Link href="/devices" className="flex items-center gap-1 text-xs text-fg-subtle hover:text-accent transition-colors">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-fg-subtle mb-2">No devices registered</p>
          <Link href="/devices" className="text-xs text-accent hover:text-accent">Register a Device</Link>
        </div>
      ) : (
        <>
          {/* Online ratio */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-green-400">{onlineCount}</span>
            <span className="text-sm text-fg-subtle">/ {total} online</span>
          </div>

          {/* Health bar */}
          <div className="h-1.5 bg-surface-2 rounded-full mb-3 overflow-hidden">
            <div className="h-full bg-green-500/70 rounded-full transition-all" style={{ width: `${onlinePercent}%` }} />
          </div>

          {/* Mini device list */}
          <div className="space-y-1.5">
            {devices.filter(d => d.status !== 'pending').slice(0, 4).map(device => (
              <div key={device.id} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[device.status] || 'bg-fg-subtle'}`} />
                <span className="text-fg truncate flex-1">{device.name}</span>
                <span className="text-fg-subtle capitalize">{device.status}</span>
              </div>
            ))}
            {total > 4 && (
              <Link href="/devices" className="block text-xs text-fg-subtle hover:text-accent transition-colors">
                +{total - 4} more
              </Link>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
