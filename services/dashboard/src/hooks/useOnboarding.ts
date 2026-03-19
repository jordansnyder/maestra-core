'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { getServiceLinks } from '@/lib/hosts'

interface OnboardingState {
  dismissed: boolean
  completedSteps: string[]
  firstVisit: boolean
  checklistHidden: boolean
}

const STORAGE_KEY = 'maestra-onboarding'

const DEFAULT_STATE: OnboardingState = {
  dismissed: false,
  completedSteps: [],
  firstVisit: true,
  checklistHidden: false,
}

interface ChecklistStepDef {
  id: string
  label: string
  description: string
  auto?: boolean
  path?: string
  external?: string
}

export const CHECKLIST_STEPS: ChecklistStepDef[] = [
  { id: 'explore-dashboard', label: 'Explore the Dashboard', description: 'You\'re here! Take a look around.', auto: true },
  { id: 'view-device', label: 'View Devices', description: 'See connected hardware and their status.', path: '/devices' },
  { id: 'browse-entities', label: 'Browse Entities', description: 'Explore spaces, lights, and sensors.', path: '/entities' },
  { id: 'open-node-red', label: 'Try Node-RED', description: 'Visual programming for your experience.', external: getServiceLinks().nodeRed },
  { id: 'view-stream', label: 'View Live Streams', description: 'See real-time data from devices.', path: '/streams' },
  { id: 'check-grafana', label: 'Check Grafana', description: 'Monitoring dashboards and metrics.', external: getServiceLinks().grafana },
]

export type ChecklistStep = ChecklistStepDef

function loadState(): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

function saveState(state: OnboardingState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be unavailable
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  // Load state from localStorage on mount
  useEffect(() => {
    const loaded = loadState()
    setState(loaded)
    setMounted(true)
  }, [])

  // Auto-complete 'explore-dashboard' on first render
  useEffect(() => {
    if (!mounted) return
    if (!state.completedSteps.includes('explore-dashboard')) {
      setState((prev) => {
        const next = {
          ...prev,
          completedSteps: [...prev.completedSteps, 'explore-dashboard'],
        }
        saveState(next)
        return next
      })
    }
  }, [mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect page visits to complete steps
  useEffect(() => {
    if (!mounted) return
    const matchingStep = CHECKLIST_STEPS.find(
      (step) => 'path' in step && step.path && pathname.startsWith(step.path)
    )
    if (matchingStep && !state.completedSteps.includes(matchingStep.id)) {
      setState((prev) => {
        const next = {
          ...prev,
          completedSteps: [...prev.completedSteps, matchingStep.id],
        }
        saveState(next)
        return next
      })
    }
  }, [pathname, mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissWelcome = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, dismissed: true }
      saveState(next)
      return next
    })
  }, [])

  const completeStep = useCallback((id: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(id)) return prev
      const next = {
        ...prev,
        completedSteps: [...prev.completedSteps, id],
      }
      saveState(next)
      return next
    })
  }, [])

  const hideChecklist = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, checklistHidden: true }
      saveState(next)
      return next
    })
  }, [])

  const resetOnboarding = useCallback(() => {
    const next = { ...DEFAULT_STATE }
    saveState(next)
    setState(next)
  }, [])

  const completed = state.completedSteps.length
  const total = CHECKLIST_STEPS.length

  return {
    state,
    steps: CHECKLIST_STEPS,
    dismissWelcome,
    completeStep,
    hideChecklist,
    resetOnboarding,
    progress: { completed, total },
  }
}
