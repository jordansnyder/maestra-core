'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { showControlApi } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { ShowPhase, ShowState, ShowHistoryEntry, ShowSchedule, Device } from '@/lib/types'
import {
  Play, Pause, Square, AlertTriangle, RotateCcw, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2
} from '@/components/icons'

// =============================================================================
// PHASE COLORS AND LABELS
// =============================================================================

const PHASE_CONFIG: Record<ShowPhase, { color: string; bg: string; border: string; label: string; dot: string }> = {
  idle: { color: 'text-blue-400', bg: 'bg-blue-500', border: 'border-blue-500/30', label: 'IDLE', dot: 'bg-blue-500' },
  pre_show: { color: 'text-orange-400', bg: 'bg-orange-500', border: 'border-orange-500/30', label: 'PRE-SHOW', dot: 'bg-orange-500' },
  active: { color: 'text-green-400', bg: 'bg-green-500', border: 'border-green-500/30', label: 'ACTIVE', dot: 'bg-green-500' },
  paused: { color: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-500/30', label: 'PAUSED', dot: 'bg-yellow-500' },
  post_show: { color: 'text-slate-400', bg: 'bg-slate-500', border: 'border-slate-500/30', label: 'POST-SHOW', dot: 'bg-slate-500' },
  shutdown: { color: 'text-red-400', bg: 'bg-red-500', border: 'border-red-500/30', label: 'SHUTDOWN', dot: 'bg-red-500' },
}

const VALID_TRANSITIONS: Record<ShowPhase, ShowPhase[]> = {
  idle: ['pre_show'],
  pre_show: ['active', 'shutdown'],
  active: ['paused', 'post_show', 'shutdown'],
  paused: ['active', 'post_show', 'shutdown'],
  post_show: ['idle', 'shutdown'],
  shutdown: ['idle'],
}

export default function ShowControlPage() {
  const [showState, setShowState] = useState<ShowState | null>(null)
  const [history, setHistory] = useState<ShowHistoryEntry[]>([])
  const [schedules, setSchedules] = useState<ShowSchedule[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedulesExpanded, setSchedulesExpanded] = useState(false)
  const shutdownClickRef = useRef<number>(0)
  const shutdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch initial state
  const fetchState = useCallback(async () => {
    try {
      const [state, hist, scheds, devResponse] = await Promise.all([
        showControlApi.getState(),
        showControlApi.getHistory(20),
        showControlApi.listSchedules(),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/devices`).then(r => r.json()).catch(() => []),
      ])
      setShowState(state)
      setHistory(hist)
      setSchedules(scheds)
      setDevices(Array.isArray(devResponse) ? devResponse : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load show state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 10000)
    return () => clearInterval(interval)
  }, [fetchState])

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket()
  useEffect(() => {
    if (!lastMessage) return
    try {
      const data = typeof lastMessage === 'string' ? JSON.parse(lastMessage) : lastMessage
      if (data?.entity_slug === 'show' && data?.current_state) {
        setShowState(data.current_state)
        // Refresh history on state change
        showControlApi.getHistory(20).then(setHistory).catch(() => {})
      }
    } catch {}
  }, [lastMessage])

  // Transition handler
  const handleTransition = async (action: () => Promise<unknown>) => {
    setTransitioning(true)
    setError(null)
    try {
      await action()
      await fetchState()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed')
    } finally {
      setTransitioning(false)
    }
  }

  // Shutdown double-click handler
  const handleShutdown = () => {
    shutdownClickRef.current += 1
    if (shutdownClickRef.current === 1) {
      shutdownTimerRef.current = setTimeout(() => {
        shutdownClickRef.current = 0
      }, 500)
    } else if (shutdownClickRef.current >= 2) {
      shutdownClickRef.current = 0
      if (shutdownTimerRef.current) clearTimeout(shutdownTimerRef.current)
      handleTransition(() => showControlApi.shutdown())
    }
  }

  const phase = (showState?.phase || 'idle') as ShowPhase
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.idle
  const validTransitions = VALID_TRANSITIONS[phase] || []

  if (loading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8 max-w-4xl">

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Show Control</h1>
              <p className="text-sm text-slate-400 mt-1">System-wide show lifecycle management</p>
            </div>
            <button onClick={fetchState} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Phase Hero */}
        <div className={`bg-slate-800 border ${config.border} rounded-xl p-8 text-center mb-5 transition-all duration-300`}>
          <div className={`w-16 h-16 ${config.dot} rounded-full mx-auto mb-4 flex items-center justify-center ${phase === 'active' ? 'animate-pulse' : ''}`}>
            {phase === 'active' ? <Play className="w-7 h-7 text-white" /> :
             phase === 'paused' ? <Pause className="w-7 h-7 text-white" /> :
             phase === 'shutdown' ? <AlertTriangle className="w-7 h-7 text-white" /> :
             <Square className="w-7 h-7 text-white" />}
          </div>
          <div className={`text-3xl font-bold tracking-wider ${config.color}`}>{config.label}</div>
          {showState?.transition_time && (
            <div className="text-sm text-slate-500 mt-2">
              Since {new Date(showState.transition_time).toLocaleTimeString()}
              {showState.source && <span className="ml-2 text-xs px-2 py-0.5 bg-slate-700 rounded">{showState.source}</span>}
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <button
            onClick={() => handleTransition(() => showControlApi.warmup())}
            disabled={transitioning || !validTransitions.includes('pre_show')}
            className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
              validTransitions.includes('pre_show')
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                : 'bg-slate-800/50 border-slate-700/50 opacity-30 cursor-not-allowed'
            }`}
          >
            WARMUP
            <div className="text-xs text-slate-500 font-normal mt-1">idle → pre_show</div>
          </button>

          <button
            onClick={() => handleTransition(() => showControlApi.go())}
            disabled={transitioning || !validTransitions.includes('active') || phase === 'paused'}
            className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
              validTransitions.includes('active') && phase !== 'paused'
                ? 'bg-blue-600 border-blue-500 hover:bg-blue-500 text-white'
                : 'bg-slate-800/50 border-slate-700/50 opacity-30 cursor-not-allowed'
            }`}
          >
            GO
            <div className="text-xs text-blue-200/60 font-normal mt-1">pre_show → active</div>
          </button>

          <button
            onClick={() => phase === 'paused'
              ? handleTransition(() => showControlApi.resume())
              : handleTransition(() => showControlApi.pause())
            }
            disabled={transitioning || (!validTransitions.includes('paused') && !validTransitions.includes('active'))}
            className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
              validTransitions.includes('paused') || (phase === 'paused' && validTransitions.includes('active'))
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                : 'bg-slate-800/50 border-slate-700/50 opacity-30 cursor-not-allowed'
            }`}
          >
            {phase === 'paused' ? 'RESUME' : 'PAUSE'}
            <div className="text-xs text-slate-500 font-normal mt-1">
              {phase === 'paused' ? 'paused → active' : 'active → paused'}
            </div>
          </button>

          <button
            onClick={() => handleTransition(() =>
              phase === 'shutdown' || phase === 'post_show'
                ? showControlApi.reset()
                : showControlApi.stop()
            )}
            disabled={transitioning || (!validTransitions.includes('post_show') && !validTransitions.includes('idle'))}
            className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
              validTransitions.includes('post_show') || validTransitions.includes('idle')
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                : 'bg-slate-800/50 border-slate-700/50 opacity-30 cursor-not-allowed'
            }`}
          >
            {phase === 'shutdown' || phase === 'post_show' ? 'RESET' : 'STOP'}
            <div className="text-xs text-slate-500 font-normal mt-1">
              {phase === 'shutdown' || phase === 'post_show' ? '→ idle' : '→ post_show'}
            </div>
          </button>
        </div>

        {/* Shutdown Button */}
        <button
          onClick={handleShutdown}
          disabled={transitioning}
          className="w-full p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 font-semibold text-sm hover:bg-red-500/20 hover:border-red-500/50 transition-all mb-6"
        >
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          SHUTDOWN
          <div className="text-xs text-red-400/50 font-normal mt-1">Double-click to confirm</div>
        </button>

        {/* Device Health Panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <span className="text-sm font-semibold">Connected Devices</span>
            <span className="text-xs text-slate-400">{devices.length} total</span>
          </div>
          <div className="p-4">
            {devices.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4">
                No devices registered. Devices will appear here when they connect.
              </div>
            ) : (
              <>
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {devices.filter(d => d.status === 'online').length} online
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    {devices.filter(d => d.status === 'stale' || d.status === 'checking').length} warning
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {devices.filter(d => d.status === 'offline' || d.status === 'error').length} offline
                  </span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {devices.slice(0, 10).map(device => (
                    <div key={device.id} className="flex items-center gap-2 text-xs py-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        device.status === 'online' ? 'bg-green-500' :
                        device.status === 'offline' || device.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <span className="flex-1 truncate">{device.name || device.id}</span>
                      <span className="text-slate-500">{device.device_type || 'unknown'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Transition History */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <span className="text-sm font-semibold">Transition History</span>
          </div>
          <div className="p-4">
            {history.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4">
                No transitions yet. Start a show!
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map((entry, i) => {
                  const fromPhase = (entry.state?.previous_phase || 'unknown') as ShowPhase
                  const toPhase = (entry.state?.phase || 'unknown') as ShowPhase
                  const fromConfig = PHASE_CONFIG[fromPhase]
                  const toConfig = PHASE_CONFIG[toPhase]
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs py-1 border-b border-slate-700/50 last:border-0">
                      <span className="text-slate-500 font-mono w-16 flex-shrink-0">
                        {entry.time ? new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      <span className="flex items-center gap-1.5 flex-1">
                        {fromConfig && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${fromConfig.color} bg-slate-700/50`}>
                            {fromPhase}
                          </span>
                        )}
                        <span className="text-slate-600">→</span>
                        {toConfig && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${toConfig.color} bg-slate-700/50`}>
                            {toPhase}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded text-[10px]">
                        {entry.source || entry.state?.source || '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Schedule Panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg mb-4 overflow-hidden">
          <button
            onClick={() => setSchedulesExpanded(!schedulesExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold hover:bg-slate-700/50 transition-colors"
          >
            <span>Schedules</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{schedules.length} configured</span>
              {schedulesExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </div>
          </button>
          {schedulesExpanded && (
            <div className="border-t border-slate-700">
              {schedules.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 text-center">
                  No schedules configured. Add one to automate this show.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Entries</th>
                      <th className="px-4 py-2 font-medium">Timezone</th>
                      <th className="px-4 py-2 font-medium">Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map(schedule => (
                      <tr key={schedule.id} className="border-t border-slate-700/50">
                        <td className="px-4 py-2">{schedule.name}</td>
                        <td className="px-4 py-2 text-slate-400">{schedule.entries?.length || 0} entries</td>
                        <td className="px-4 py-2 text-slate-400 font-mono">{schedule.timezone}</td>
                        <td className="px-4 py-2">
                          <span className={`w-2 h-2 rounded-full inline-block ${schedule.enabled ? 'bg-green-500' : 'bg-slate-600'}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
