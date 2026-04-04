'use client'

import { useState, useEffect } from 'react'
import { useConsole, type Protocol } from './ConsoleProvider'
import { Pause, Play, Trash2, ChevronDown, ChevronUp, Search, Maximize2, Minimize2 } from 'lucide-react'

const PROTOCOL_COLORS: Record<Protocol, { bg: string; text: string; label: string }> = {
  osc:      { bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    label: 'OSC'  },
  mqtt:     { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'MQTT' },
  ws:       { bg: 'bg-violet-500/20',  text: 'text-violet-400',  label: 'WS'   },
  dmx:      { bg: 'bg-amber-500/20',   text: 'text-amber-400',   label: 'DMX'  },
  internal: { bg: 'bg-slate-500/20',   text: 'text-slate-400',   label: 'INT'  },
}

interface ConsoleToolbarProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function ConsoleToolbar({ isFullscreen = false, onToggleFullscreen }: ConsoleToolbarProps) {
  const {
    mode, setMode, filters, setFilters,
    paused, setPaused, stats, isConnected, clear,
  } = useConsole()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(true)

  useEffect(() => {
    setHintDismissed(localStorage.getItem('console-hint-dismissed') === 'true')
  }, [])

  const dismissHint = () => {
    localStorage.setItem('console-hint-dismissed', 'true')
    setHintDismissed(true)
  }

  const toggleProtocol = (p: Protocol) => {
    setFilters(prev => {
      const next = new Set(prev.protocols)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return { ...prev, protocols: next }
    })
  }

  const isAmbient = mode === 'ambient'

  // Ambient mode: compact floating overlay
  if (isAmbient) {
    return (
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 h-10 bg-transparent text-slate-400/60 transition-opacity hover:opacity-100 opacity-60">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className={isConnected ? 'text-green-400/60' : 'text-yellow-400/60'}>
            {isConnected ? '\u25CF' : '\u25CB'}
          </span>
          <span>{stats.messagesPerSecond} msg/s</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className="p-1 hover:text-white/80 transition-colors"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setMode('debug')}
            className="px-2 py-0.5 text-xs rounded bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
          >
            Debug
          </button>
          {onToggleFullscreen && (
            <>
              {isFullscreen && (
                <span className="text-[10px] font-mono text-slate-600/70 select-none">ESC</span>
              )}
              <button
                onClick={onToggleFullscreen}
                className="p-1 hover:text-white/80 transition-colors"
                title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Fullscreen'}
              >
                {isFullscreen
                  ? <Minimize2 className="w-3.5 h-3.5" />
                  : <Maximize2 className="w-3.5 h-3.5" />
                }
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Debug mode: full toolbar
  return (
    <div className="shrink-0">
      {/* Connection banner */}
      {!isConnected && (
        <div className="px-4 py-1.5 bg-yellow-500/20 text-yellow-400 text-xs font-mono text-center">
          Connection lost. Reconnecting...
        </div>
      )}

      {/* Main toolbar row */}
      <div className="flex items-center gap-3 px-4 h-14 bg-slate-800 border-b border-slate-700">
        {/* Connection dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span>{stats.messagesPerSecond} msg/s</span>
          <span className={stats.atCapacity ? 'text-orange-400' : ''} title={stats.atCapacity ? 'Oldest messages being dropped' : ''}>
            {stats.bufferDepth} buffered
          </span>
        </div>

        {/* Pause */}
        <button
          onClick={() => setPaused(!paused)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            paused ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>

        {/* Filter toggle */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          Filters
          {filtersOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Heartbeat toggle */}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hideHeartbeats}
            onChange={e => setFilters(prev => ({ ...prev, hideHeartbeats: e.target.checked }))}
            className="rounded border-slate-600 bg-slate-700 text-blue-500"
          />
          Hide heartbeats
        </label>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-600">
          {!hintDismissed && (
            <div className="relative">
              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 text-xs bg-slate-700 rounded-lg shadow-lg border border-slate-600 text-slate-300">
                <p><strong>Debug</strong> = message inspector</p>
                <p><strong>Ambient</strong> = live data visualization</p>
                <button onClick={dismissHint} className="mt-1 text-blue-400 hover:underline">Got it</button>
              </div>
            </div>
          )}
          <div className="flex rounded-lg bg-slate-900 p-0.5">
            <button
              onClick={() => setMode('debug')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === 'debug' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Debug
            </button>
            <button
              onClick={() => setMode('ambient')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === 'ambient' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ambient
            </button>
          </div>
        </div>
      </div>

      {/* Expandable filter drawer */}
      {filtersOpen && (
        <div className="flex items-center gap-3 px-4 h-12 bg-slate-800/80 border-b border-slate-700/50">
          {/* Subject filter */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter subjects (glob/regex)..."
              value={filters.subjectPattern}
              onChange={e => setFilters(prev => ({ ...prev, subjectPattern: e.target.value }))}
              className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Protocol toggles */}
          <div className="flex items-center gap-1.5">
            {(Object.entries(PROTOCOL_COLORS) as [Protocol, typeof PROTOCOL_COLORS[Protocol]][]).map(([key, val]) => (
              <button
                key={key}
                onClick={() => toggleProtocol(key)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                  filters.protocols.has(key)
                    ? `${val.bg} ${val.text}`
                    : 'bg-slate-900 text-slate-600'
                }`}
              >
                {val.label}
              </button>
            ))}
          </div>

          {/* Text search */}
          <input
            type="text"
            placeholder="Search payloads..."
            value={filters.textSearch}
            onChange={e => setFilters(prev => ({ ...prev, textSearch: e.target.value }))}
            className="w-40 px-2 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />

          {/* Clear */}
          <button
            onClick={clear}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
