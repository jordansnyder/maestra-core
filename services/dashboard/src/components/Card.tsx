import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
  onClick?: () => void
}

export function Card({ children, className = '', title, action, onClick }: CardProps) {
  return (
    <div className={`bg-surface-1 rounded-lg border border-edge ${className}`} onClick={onClick}>
      {(title || action) && (
        <div className="px-6 py-4 border-b border-edge flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
