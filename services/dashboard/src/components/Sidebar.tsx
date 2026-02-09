'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '\uD83D\uDCDF' },
  { href: '/entities', label: 'Entities', icon: '\uD83C\uDFD7\uFE0F' },
  { href: '/routing', label: 'Routing', icon: '\uD83D\uDD00' },
]

export function Sidebar() {
  const pathname = usePathname()

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
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
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
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* External links */}
      <div className="px-3 py-4 border-t border-slate-800 space-y-1">
        <span className="px-3 text-[10px] uppercase tracking-wider text-slate-600 font-medium">Services</span>
        <a href="http://localhost:1880" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Node-RED
        </a>
        <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Grafana
        </a>
        <a href="http://localhost:8080/docs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors">
          API Docs
        </a>
      </div>
    </aside>
  )
}
