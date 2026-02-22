'use client'

import type { StreamInfo, StreamTypeInfo } from '@/lib/types'
import { STREAM_TYPE_ICONS, DEFAULT_STREAM_ICON } from '@/components/icons'

// Protocol badge colors
const PROTOCOL_COLORS: Record<string, string> = {
  udp: 'bg-blue-500/20 text-blue-300',
  tcp: 'bg-green-500/20 text-green-300',
  ndi: 'bg-purple-500/20 text-purple-300',
  srt: 'bg-orange-500/20 text-orange-300',
  webrtc: 'bg-cyan-500/20 text-cyan-300',
  spout: 'bg-yellow-500/20 text-yellow-300',
  syphon: 'bg-yellow-500/20 text-yellow-300',
  shared_memory: 'bg-pink-500/20 text-pink-300',
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

interface StreamRegistryProps {
  streams: StreamInfo[]
  streamTypes: StreamTypeInfo[]
}

export function StreamRegistry({ streams, streamTypes }: StreamRegistryProps) {
  if (streams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
        <div className="text-4xl opacity-30">&#9737;</div>
        <p className="text-sm">No active streams</p>
        <p className="text-xs text-slate-600 max-w-sm text-center">
          Devices can advertise streams via POST /streams/advertise or through the Python SDK.
          Streams appear here automatically and expire after 30 seconds without a heartbeat.
        </p>
      </div>
    )
  }

  // Get display name for stream type
  const typeDisplayName = (typeName: string) => {
    const st = streamTypes.find((t) => t.name === typeName)
    return st?.display_name || typeName
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {streams.map((stream) => {
        const Icon = STREAM_TYPE_ICONS[stream.stream_type] || DEFAULT_STREAM_ICON
        const protocolClass = PROTOCOL_COLORS[stream.protocol] || 'bg-slate-500/20 text-slate-300'

        return (
          <div
            key={stream.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800">
                  <Icon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white truncate max-w-[180px]">
                    {stream.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {typeDisplayName(stream.stream_type)}
                  </p>
                </div>
              </div>

              {/* Session count badge */}
              {stream.active_sessions > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-300 rounded-full">
                  {stream.active_sessions} session{stream.active_sessions !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Publisher</span>
                <span className="text-slate-300 font-mono truncate max-w-[160px]">
                  {stream.publisher_id}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Endpoint</span>
                <span className="text-slate-300 font-mono">
                  {stream.address}:{stream.port}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Protocol</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${protocolClass}`}>
                  {stream.protocol}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Advertised</span>
                <span className="text-slate-400">{formatAge(stream.advertised_at)}</span>
              </div>
            </div>

            {/* Config preview */}
            {Object.keys(stream.config).length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stream.config).slice(0, 4).map(([key, val]) => (
                    <span
                      key={key}
                      className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded"
                    >
                      {key}: {String(val)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
