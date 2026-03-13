'use client'

import type { StreamInfo, StreamSession, StreamTypeInfo } from '@/lib/types'
import { StreamPreview } from './previews'
import { streamsApi } from '@/lib/api'

interface StreamDetailProps {
  stream: StreamInfo
  sessions: StreamSession[]
  streamTypes: StreamTypeInfo[]
}

export function StreamDetail({ stream, sessions, streamTypes }: StreamDetailProps) {
  const typeInfo = streamTypes.find((t) => t.name === stream.stream_type)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column — Preview (wider) */}
      <div className="lg:col-span-2">
        <StreamPreview stream={stream} />
      </div>

      {/* Right column — Metadata */}
      <div className="space-y-5">
        {/* Stream Info Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-3">Stream Info</h3>
          <div className="space-y-2.5 text-xs">
            <InfoRow label="Type" value={typeInfo?.display_name || stream.stream_type} />
            <InfoRow label="Protocol" value={stream.protocol.toUpperCase()} />
            <InfoRow label="Publisher" value={stream.publisher_id} mono />
            <InfoRow label="Endpoint" value={`${stream.address}:${stream.port}`} mono />
            {stream.entity_id && <InfoRow label="Entity" value={stream.entity_id} mono />}
            {stream.device_id && <InfoRow label="Device" value={stream.device_id} mono />}
            <InfoRow label="Advertised" value={formatAge(stream.advertised_at)} />
            <InfoRow label="Last Heartbeat" value={formatAge(stream.last_heartbeat)} />
          </div>
        </div>

        {/* Config Card */}
        {Object.keys(stream.config).length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">Configuration</h3>
            <div className="space-y-2 text-xs">
              {Object.entries(stream.config).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 shrink-0">{key}</span>
                  <span className="text-slate-300 font-mono text-right break-all">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Card */}
        {Object.keys(stream.metadata).length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">Metadata</h3>
            <div className="space-y-2 text-xs">
              {Object.entries(stream.metadata).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 shrink-0">{key}</span>
                  <span className="text-slate-300 font-mono text-right break-all">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Sessions Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Active Sessions</h3>
            {sessions.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-300 rounded-full">
                {sessions.length}
              </span>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500">No active sessions</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="p-2.5 bg-slate-800/50 rounded-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-mono truncate max-w-[150px]">
                      {session.consumer_id}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await streamsApi.stopSession(session.session_id)
                        } catch {
                          // ignore
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{session.consumer_address}</span>
                    <span>{formatAge(session.started_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type Info Card */}
        {typeInfo && typeInfo.description && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-2">About {typeInfo.display_name}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{typeInfo.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-300 truncate max-w-[180px] ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function formatAge(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
