'use client'

import { RefreshCw } from 'lucide-react'
import type { CloudConfig, CloudStatus } from '@/lib/cloudTypes'

interface CloudStatusCardProps {
  status: CloudStatus
  config: CloudConfig
  onRefresh: () => void
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: 'Connected',
    dotClass: 'bg-green-400',
    textClass: 'text-green-400',
  },
  connecting: {
    label: 'Connecting...',
    dotClass: 'bg-yellow-400 animate-pulse',
    textClass: 'text-yellow-400',
  },
  disconnected: {
    label: 'Disconnected',
    dotClass: 'bg-slate-500',
    textClass: 'text-slate-400',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-red-400',
    textClass: 'text-red-400',
  },
}

function getRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}

function resolveStatus(config: CloudConfig, status: CloudStatus): ConnectionStatus {
  if (!config.gateway_url) return 'disconnected'
  if (status.error) return 'error'
  if (status.agent_connected) return 'connected'
  if (status.agent_running) return 'connecting'
  return config.status as ConnectionStatus
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base font-semibold text-slate-200">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

export function CloudStatusCard({ status, config, onRefresh }: CloudStatusCardProps) {
  const connectionStatus = resolveStatus(config, status)
  const { label, dotClass, textClass } = STATUS_CONFIG[connectionStatus]

  const truncateUrl = (url: string | null) => {
    if (!url) return '—'
    try {
      const u = new URL(url)
      const host = u.host
      return host.length > 40 ? host.slice(0, 37) + '...' : host
    } catch {
      return url.length > 40 ? url.slice(0, 37) + '...' : url
    }
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-start justify-between gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${dotClass}`} />
          <span className={`text-base font-semibold ${textClass}`}>{label}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Details */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div className="text-slate-500">Gateway</div>
        <div className="font-mono text-slate-300 truncate" title={config.gateway_url ?? undefined}>
          {truncateUrl(config.gateway_url)}
        </div>

        <div className="text-slate-500">Site</div>
        <div className="text-slate-300">{config.site_slug ?? '—'}</div>

        <div className="text-slate-500">Last heartbeat</div>
        <div className="text-slate-300">{getRelativeTime(status.last_heartbeat)}</div>
      </div>

      {/* Stats row */}
      <div className="mt-4 pt-4 border-t border-slate-700 flex justify-around">
        <StatItem label="Messages sent" value={status.messages_sent.toLocaleString()} />
        <StatItem label="Messages received" value={status.messages_received.toLocaleString()} />
        <StatItem label="Active policies" value={status.active_policies} />
      </div>

      {/* Error */}
      {status.error && (
        <div className="mt-3 px-3 py-2 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-xs">
          {status.error}
        </div>
      )}
    </div>
  )
}
