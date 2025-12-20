interface StatusBadgeProps {
  status: 'online' | 'offline' | 'error' | 'maintenance' | 'checking' | 'healthy' | 'unhealthy'
  showDot?: boolean
  className?: string
}

const statusConfig = {
  online: { color: 'bg-green-500', text: 'Online', textColor: 'text-green-400' },
  healthy: { color: 'bg-green-500', text: 'Healthy', textColor: 'text-green-400' },
  offline: { color: 'bg-gray-500', text: 'Offline', textColor: 'text-gray-400' },
  error: { color: 'bg-red-500', text: 'Error', textColor: 'text-red-400' },
  unhealthy: { color: 'bg-red-500', text: 'Unhealthy', textColor: 'text-red-400' },
  maintenance: { color: 'bg-yellow-500', text: 'Maintenance', textColor: 'text-yellow-400' },
  checking: { color: 'bg-yellow-500 animate-pulse', text: 'Checking', textColor: 'text-yellow-400' },
}

export function StatusBadge({ status, showDot = true, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {showDot && <span className={`w-2 h-2 rounded-full ${config.color}`} />}
      <span className={`text-sm font-medium ${config.textColor}`}>{config.text}</span>
    </span>
  )
}
