'use client'

import { useState, useEffect, useCallback } from 'react'
import { showControlApi } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/Card'
import type { ShowState, ShowPhase } from '@/lib/types'

const PHASE_COLORS: Record<ShowPhase, string> = {
  idle: 'bg-slate-400',
  pre_show: 'bg-blue-400',
  active: 'bg-green-400',
  paused: 'bg-amber-400',
  post_show: 'bg-purple-400',
  shutdown: 'bg-red-400',
}

const PHASE_LABELS: Record<ShowPhase, string> = {
  idle: 'Idle',
  pre_show: 'Pre-Show',
  active: 'Active',
  paused: 'Paused',
  post_show: 'Post-Show',
  shutdown: 'Shutdown',
}

interface QuickAction {
  label: string
  action: () => Promise<unknown>
  variant: 'primary' | 'destructive' | 'default'
}

function getQuickActions(phase: ShowPhase, api: typeof showControlApi): QuickAction[] {
  switch (phase) {
    case 'idle':
      return [{ label: 'Warm Up', action: api.warmup, variant: 'primary' }]
    case 'pre_show':
      return [{ label: 'Go', action: api.go, variant: 'primary' }]
    case 'active':
      return [
        { label: 'Pause', action: api.pause, variant: 'default' },
        { label: 'Stop', action: api.stop, variant: 'default' },
      ]
    case 'paused':
      return [
        { label: 'Resume', action: api.resume, variant: 'primary' },
        { label: 'Stop', action: api.stop, variant: 'default' },
      ]
    case 'post_show':
      return [{ label: 'Reset', action: api.reset, variant: 'default' }]
    case 'shutdown':
      return [{ label: 'Reset', action: api.reset, variant: 'default' }]
    default:
      return []
  }
}

const ACTION_STYLES: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  destructive: 'bg-red-600/20 hover:bg-red-600/40 text-red-400',
  default: 'bg-slate-700 hover:bg-slate-600 text-slate-300',
}

export function ShowControlWidget() {
  const [showState, setShowState] = useState<ShowState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const { toast } = useToast()

  const fetchState = useCallback(async () => {
    try {
      const state = await showControlApi.getState()
      setShowState(state)
      setError(null)
    } catch {
      setError('Show control unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchState() }, [fetchState])

  // WebSocket real-time updates
  const { lastMessage, subscribe, isConnected } = useWebSocket()
  useEffect(() => {
    if (isConnected) subscribe('maestra.entity.state.show_control.show')
  }, [isConnected, subscribe])
  useEffect(() => {
    if (!lastMessage) return
    const event = (lastMessage.data ?? {}) as Record<string, unknown>
    if (event.type !== 'state_changed') return
    const newState = event.current_state as ShowState | undefined
    if (newState?.phase) setShowState(newState)
  }, [lastMessage])

  const handleAction = async (action: QuickAction) => {
    setActing(true)
    try {
      await action.action()
      await fetchState()
    } catch (err) {
      toast({ message: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' })
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return <div className="h-[80px] bg-slate-700/30 rounded-lg animate-pulse" />
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{error}</span>
          <button onClick={fetchState} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
        </div>
      </Card>
    )
  }

  if (!showState) return null

  const phase = showState.phase
  const actions = getQuickActions(phase, showControlApi)
  const since = showState.transition_time
    ? new Date(showState.transition_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full ${PHASE_COLORS[phase]} ${phase === 'active' ? 'animate-pulse' : ''}`} />
          <div>
            <span className="text-2xl font-bold">{PHASE_LABELS[phase]}</span>
            {since && <p className="text-xs text-slate-500">Since {since}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              disabled={acting}
              aria-label={`Transition show to ${action.label.toLowerCase()}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${ACTION_STYLES[action.variant]}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}
