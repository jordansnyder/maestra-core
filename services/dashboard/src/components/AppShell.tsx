'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { useOnboarding } from '@/hooks/useOnboarding'
import { Menu } from '@/components/icons'

/** Silently tracks page visits to auto-complete onboarding checklist steps */
function OnboardingTracker() {
  useOnboarding()
  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="nav-overlay-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <OnboardingTracker />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar — hamburger + logo */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 md:hidden shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="text-slate-400 hover:text-white transition-colors p-0.5"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-base font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Maestra
          </span>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
