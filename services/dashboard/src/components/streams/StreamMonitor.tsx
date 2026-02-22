'use client'

import { useState } from 'react'
import { useStreams } from '@/hooks/useStreams'
import { StreamRegistry } from './StreamRegistry'
import { SessionList } from './SessionList'
import { RefreshCw } from '@/components/icons'

type TabId = 'registry' | 'sessions'

const TABS: { id: TabId; label: string }[] = [
  { id: 'registry', label: 'Stream Registry' },
  { id: 'sessions', label: 'Active Sessions' },
]

export function StreamMonitor() {
  const [tab, setTab] = useState<TabId>('registry')
  const { streams, sessions, streamTypes, loading, error, refresh, stopSession } = useStreams()

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Streams</h1>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
                {t.id === 'registry' && streams.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded-full">
                    {streams.length}
                  </span>
                )}
                {t.id === 'sessions' && sessions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-300 rounded-full">
                    {sessions.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Auto-refresh 3s
          </div>

          <button
            onClick={refresh}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            Loading stream registry...
          </div>
        ) : tab === 'registry' ? (
          <StreamRegistry streams={streams} streamTypes={streamTypes} />
        ) : (
          <SessionList sessions={sessions} onStopSession={stopSession} />
        )}
      </div>
    </div>
  )
}
