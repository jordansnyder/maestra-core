import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: {
    value: number
    positive: boolean
  }
  className?: string
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend, className = '' }: StatsCardProps) {
  return (
    <div className={`bg-surface-1 rounded-lg p-6 border border-edge ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-fg-muted">{title}</span>
        {Icon && <Icon className="w-5 h-5 text-fg-subtle" />}
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span className={trend.positive ? 'text-green-400' : 'text-red-400'}>
            {trend.positive ? '\u2191' : '\u2193'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-fg-subtle">vs last hour</span>
        </div>
      )}
    </div>
  )
}
