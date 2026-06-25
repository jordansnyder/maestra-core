'use client'

import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useWebSocket } from '@/hooks/useWebSocket'

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  unhealthy: 'bg-red-500',
  checking: 'bg-surface-2 animate-pulse',
}

export function SystemHealthBar() {
  const { services } = useSystemHealth(30000)
  const { isConnected: wsConnected } = useWebSocket()

  return (
    <div className="bg-surface-1/50 border border-edge rounded-lg px-4 py-2.5 flex items-center gap-6 text-xs flex-wrap">
      {/* Service dots */}
      {services.map((service) => (
        <div key={service.name} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[service.status] || 'bg-surface-2'}`}
            aria-label={`${service.name}: ${service.status}`} />
          <span className="text-fg-subtle">{service.name}</span>
        </div>
      ))}

      <div className="w-px h-4 bg-surface-2" />

      {/* WebSocket status */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
          aria-label={`WebSocket: ${wsConnected ? 'connected' : 'disconnected'}`} />
        <span className="text-fg-subtle">WebSocket</span>
      </div>
    </div>
  )
}
