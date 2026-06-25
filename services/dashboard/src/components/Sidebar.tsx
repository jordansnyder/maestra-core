'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Monitor,
  Boxes,
  GitFork,
  Cast,
  Terminal,
  Workflow,
  BarChart3,
  FileCode,
  ExternalLink,
  BookOpen,
  Settings,
  Cloud,
  Zap,
  Play,
  X,
} from '@/components/icons'
import { getServiceLinks } from '@/lib/hosts'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useEffect, useState } from 'react'
import { cloudApi } from '@/lib/api'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/show-control', label: 'Show Control', icon: Play },
  { href: '/devices', label: 'Devices', icon: Monitor },
  { href: '/entities', label: 'Entities', icon: Boxes },
  { href: '/routing', label: 'Routing', icon: GitFork },
  { href: '/streams', label: 'Streams', icon: Cast },
  { href: '/console', label: 'Console', icon: Terminal },
  { href: '/dmx', label: 'DMX Lighting', icon: Zap },
  { href: '/settings', label: 'Settings', icon: Settings },
]


interface ServiceLink {
  href: string
  label: string
  icon: LucideIcon
}

function getServiceLinkItems(): ServiceLink[] {
  const urls = getServiceLinks()
  return [
    { href: urls.nodeRed, label: 'Node-RED', icon: Workflow },
    { href: urls.grafana, label: 'Grafana', icon: BarChart3 },
    { href: urls.apiDocs, label: 'API Docs', icon: FileCode },
    { href: urls.docs, label: 'Documentation', icon: BookOpen },
  ]
}

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { services } = useSystemHealth(30000)
  const [cloudStatus, setCloudStatus] = useState<'none' | 'connected' | 'disconnected' | 'connecting' | 'error'>('none')

  useEffect(() => {
    const checkCloud = async () => {
      try {
        const status = await cloudApi.getStatus()
        if (!status.configured) {
          setCloudStatus('none')
        } else if (status.agent_connected) {
          setCloudStatus('connected')
        } else if (status.agent_running) {
          setCloudStatus('connecting')
        } else {
          setCloudStatus('disconnected')
        }
      } catch {
        setCloudStatus('none')
      }
    }
    checkCloud()
    const timer = setInterval(checkCloud, 30000)
    return () => clearInterval(timer)
  }, [])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-edge flex items-center justify-between">
        <Link href="/" onClick={onClose} className="flex items-center gap-2">
          <span className="text-xl text-accent">{'\u2726'}</span>
          <span className="text-lg font-bold tracking-display text-fg">
            Maestra
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Close button — mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-fg-subtle hover:text-fg transition-colors p-0.5"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg-muted hover:text-fg hover:bg-surface-1'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* System health */}
      <div className="px-3 py-3 border-t border-edge">
        <span className="hud px-3">
          System
        </span>
        <div className="mt-2 px-3 space-y-1.5">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between text-xs">
              <span className="text-fg-muted">{service.name}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  service.status === 'healthy'
                    ? 'bg-success'
                    : service.status === 'unhealthy'
                    ? 'bg-danger'
                    : 'bg-warning animate-pulse'
                }`}
              />
            </div>
          ))}
          {cloudStatus !== 'none' && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-muted flex items-center gap-1.5">
                <Cloud className="w-3 h-3" />
                Cloud Gateway
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudStatus === 'connected'
                    ? 'bg-success'
                    : cloudStatus === 'connecting'
                    ? 'bg-warning animate-pulse'
                    : cloudStatus === 'error'
                    ? 'bg-danger'
                    : 'bg-fg-subtle'
                }`}
              />
            </div>
          )}
        </div>
      </div>

      {/* External service links */}
      <div className="px-3 py-4 border-t border-edge space-y-1">
        <span className="hud px-3">
          Services
        </span>
        {getServiceLinkItems().map((link) => {
          const Icon = link.icon
          return (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-1.5 text-xs text-fg-subtle hover:text-fg transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="flex-1">{link.label}</span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
            </a>
          )
        })}
      </div>
    </>
  )

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-sidebar-nav
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:z-auto md:transition-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        bg-surface-1 border-r border-edge flex flex-col shrink-0
      `}
    >
      {sidebarContent}
    </aside>
  )
}
