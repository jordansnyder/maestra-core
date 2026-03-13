'use client'

import { Sidebar } from './Sidebar'
import { useOnboarding } from '@/hooks/useOnboarding'

/** Silently tracks page visits to auto-complete onboarding checklist steps */
function OnboardingTracker() {
  useOnboarding()
  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      <Sidebar />
      <OnboardingTracker />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
