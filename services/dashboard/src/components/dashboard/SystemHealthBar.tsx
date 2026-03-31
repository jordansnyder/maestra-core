'use client'

import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useWebSocket } from '@/hooks/useWebSocket'

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  unhealthy: 'bg-red-500',
  checking: 'bg-slate-600 animate-pulse',
}

export function SystemHealthBar() {
  const { services } = useSystemHealth(30000)
  const { isConnected: wsConnected } = useWebSocket()

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 flex items-center gap-6 text-xs flex-wrap">
      {/* Service dots */}
      {services.map((service) => (
        <div key={service.name} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[service.status] || 'bg-slate-600'}`}
            aria-label={`${service.name}: ${service.status}`} />
          <span className="text-slate-500">{service.name}</span>
        </div>
      ))}

      <div className="w-px h-4 bg-slate-700" />

      {/* WebSocket status */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
          aria-label={`WebSocket: ${wsConnected ? 'connected' : 'disconnected'}`} />
        <span className="text-slate-500">WebSocket</span>
      </div>
    </div>
  )
}
