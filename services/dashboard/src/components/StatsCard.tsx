interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  trend?: {
    value: number
    positive: boolean
  }
  className?: string
}

export function StatsCard({ title, value, subtitle, icon, trend, className = '' }: StatsCardProps) {
  return (
    <div className={`bg-slate-800 rounded-lg p-6 border border-slate-700 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{title}</span>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span className={trend.positive ? 'text-green-400' : 'text-red-400'}>
            {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-slate-500">vs last hour</span>
        </div>
      )}
    </div>
  )
}
