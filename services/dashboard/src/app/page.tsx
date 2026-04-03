'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useActivityFeed, type ActivityItem, type ActivityCategory } from '@/hooks/useActivityFeed'
import { SystemHealthBar } from '@/components/dashboard/SystemHealthBar'
import { ShowControlWidget } from '@/components/dashboard/ShowControlWidget'
import { DeviceOverviewWidget } from '@/components/dashboard/DeviceOverviewWidget'
import { EntitiesOverviewWidget } from '@/components/dashboard/EntitiesOverviewWidget'
import { StreamsOverviewWidget } from '@/components/dashboard/StreamsOverviewWidget'
import { Boxes, GitFork, Monitor, Zap, Radio, Activity, X } from '@/components/icons'

export default function Home() {
  const { items: activityItems, isConnected } = useActivityFeed(50)
  const [mobileView, setMobileView] = useState<'dashboard' | 'activity'>('dashboard')

  return (
    <div className="flex h-full">

      {/* ── Main dashboard content ─────────────────────────────────────── */}
      <div className={`flex-1 overflow-auto p-4 md:p-6 space-y-4 ${mobileView === 'activity' ? 'hidden md:block' : ''}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Mission control</p>
          </div>

          {/* Mobile-only: toggle to Live Activity view */}
          <button
            onClick={() => setMobileView('activity')}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <Activity className="w-3.5 h-3.5" />
            Live Activity
          </button>
        </div>

        {/* System Health Bar */}
        <SystemHealthBar />

        {/* Show Control Widget */}
        <ShowControlWidget />

        {/* Widget Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeviceOverviewWidget />
          <EntitiesOverviewWidget />
        </div>

        {/* Streams Widget */}
        <StreamsOverviewWidget />

        {/* Quick navigation */}
        <div className="flex flex-wrap gap-2 pt-2">
          {[
            { href: '/entities', label: 'Entities', icon: Boxes },
            { href: '/routing', label: 'Routing', icon: GitFork },
            { href: '/devices', label: 'Devices', icon: Monitor },
            { href: '/dmx', label: 'DMX', icon: Zap },
            { href: '/streams', label: 'Streams', icon: Radio },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
            >
              <Icon className="w-3 h-3" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Live Activity feed ─────────────────────────────────────────── */}
      {/* Desktop: fixed right sidebar. Mobile: full-width when toggled. */}
      <div className={`
        border-l border-slate-800 bg-slate-900/50 overflow-auto shrink-0
        md:w-80 md:flex md:flex-col
        ${mobileView === 'activity' ? 'flex flex-col flex-1' : 'hidden'}
      `}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Live Activity
          </h2>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] text-slate-600">{isConnected ? 'Live' : 'Offline'}</span>
            {/* Mobile-only: close back to dashboard */}
            <button
              onClick={() => setMobileView('dashboard')}
              className="md:hidden ml-1 text-slate-500 hover:text-slate-300 transition-colors p-0.5"
              aria-label="Back to dashboard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {activityItems.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-8">
              {isConnected ? 'Waiting for events...' : 'Connecting to message bus...'}
            </p>
          )}
          <div className="space-y-0.5">
            {activityItems.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  device: 'border-green-600',
  entity: 'border-blue-600',
  route: 'border-purple-600',
  system: 'border-slate-600',
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className={`flex gap-3 py-2 border-l-2 pl-3 ${CATEGORY_COLORS[item.category]}`}>
      <span className="text-[10px] text-slate-600 w-8 shrink-0 text-right tabular-nums">
        {formatRelativeTime(item.timestamp)}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-300 truncate">{item.title}</p>
        <p className="text-[10px] text-slate-500 truncate">{item.detail}</p>
      </div>
    </div>
  )
}
