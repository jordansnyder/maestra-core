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
  Workflow,
  BarChart3,
  FileCode,
  ExternalLink,
} from '@/components/icons'
import { useSystemHealth } from '@/hooks/useSystemHealth'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Monitor },
  { href: '/entities', label: 'Entities', icon: Boxes },
  { href: '/routing', label: 'Routing', icon: GitFork },
  { href: '/streams', label: 'Streams', icon: Cast },
]

interface ServiceLink {
  href: string
  label: string
  icon: LucideIcon
}

const SERVICE_LINKS: ServiceLink[] = [
  { href: 'http://localhost:1880', label: 'Node-RED', icon: Workflow },
  { href: 'http://localhost:3000', label: 'Grafana', icon: BarChart3 },
  { href: 'http://localhost:8080/docs', label: 'API Docs', icon: FileCode },
]

export function Sidebar() {
  const pathname = usePathname()
  const { services } = useSystemHealth(30000)

  return (
    <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl text-purple-400">{'\u2726'}</span>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Maestra
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* System health */}
      <div className="px-3 py-3 border-t border-slate-800">
        <span className="px-3 text-[10px] uppercase tracking-wider text-slate-600 font-medium">
          System
        </span>
        <div className="mt-2 px-3 space-y-1.5">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{service.name}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  service.status === 'healthy'
                    ? 'bg-green-500'
                    : service.status === 'unhealthy'
                    ? 'bg-red-500'
                    : 'bg-yellow-500 animate-pulse'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* External service links */}
      <div className="px-3 py-4 border-t border-slate-800 space-y-1">
        <span className="px-3 text-[10px] uppercase tracking-wider text-slate-600 font-medium">
          Services
        </span>
        {SERVICE_LINKS.map((link) => {
          const Icon = link.icon
          return (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="flex-1">{link.label}</span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
            </a>
          )
        })}
      </div>
    </aside>
  )
}
