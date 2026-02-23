'use client'

import type { StreamSession } from '@/lib/types'
import { STREAM_TYPE_ICONS, DEFAULT_STREAM_ICON } from '@/components/icons'

function formatDuration(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

interface SessionListProps {
  sessions: StreamSession[]
  onStopSession: (sessionId: string) => Promise<void>
}

export function SessionList({ sessions, onStopSession }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
        <div className="text-4xl opacity-30">&#9656;</div>
        <p className="text-sm">No active sessions</p>
        <p className="text-xs text-slate-600 max-w-sm text-center">
          Sessions are created when a device requests a stream from a publisher.
          Active sessions maintain a heartbeat and expire if either side disconnects.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Table header */}
      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_80px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600 font-medium">
        <span>Stream</span>
        <span>Publisher</span>
        <span>Consumer</span>
        <span>Protocol</span>
        <span>Duration</span>
        <span />
      </div>

      {sessions.map((session) => {
        const Icon = STREAM_TYPE_ICONS[session.stream_type] || DEFAULT_STREAM_ICON

        return (
          <div
            key={session.session_id}
            className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_80px] gap-3 items-center px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
          >
            {/* Stream name + type */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{session.stream_name}</p>
                <p className="text-[10px] text-slate-500">{session.stream_type}</p>
              </div>
            </div>

            {/* Publisher */}
            <div className="min-w-0">
              <p className="text-xs text-slate-300 font-mono truncate">{session.publisher_id}</p>
              <p className="text-[10px] text-slate-600 font-mono">{session.publisher_address}</p>
            </div>

            {/* Consumer */}
            <div className="min-w-0">
              <p className="text-xs text-slate-300 font-mono truncate">{session.consumer_id}</p>
              <p className="text-[10px] text-slate-600 font-mono">{session.consumer_address}</p>
            </div>

            {/* Protocol */}
            <span className="text-xs text-slate-400 uppercase">{session.protocol}</span>

            {/* Duration */}
            <span className="text-xs text-slate-400 font-mono">
              {formatDuration(session.started_at)}
            </span>

            {/* Stop button */}
            <button
              onClick={() => onStopSession(session.session_id)}
              className="px-2.5 py-1 text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors"
            >
              Stop
            </button>
          </div>
        )
      })}
    </div>
  )
}
