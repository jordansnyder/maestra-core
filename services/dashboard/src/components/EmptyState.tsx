import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; href?: string; onClick?: () => void }
  secondaryAction?: { label: string; href: string }
  children?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-12 h-12 text-slate-600" />
      <h3 className="text-lg font-medium text-slate-300 mt-4">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-md">{description}</p>

      {action && (
        <div className="mt-6">
          {action.href ? (
            action.href.startsWith('http') ? (
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                {action.label}
              </a>
            ) : (
              <Link
                href={action.href}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                {action.label}
              </Link>
            )
          ) : action.onClick ? (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      )}

      {secondaryAction && (
        <div className="mt-3">
          {secondaryAction.href.startsWith('http') ? (
            <a
              href={secondaryAction.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-blue-400 transition-colors"
            >
              {secondaryAction.label}
              <span aria-hidden="true">&rarr;</span>
            </a>
          ) : (
            <Link
              href={secondaryAction.href}
              className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-blue-400 transition-colors"
            >
              {secondaryAction.label}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>
      )}

      {children}
    </div>
  )
}
