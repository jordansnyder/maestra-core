'use client'

import { useState } from 'react'
import type { StreamInfo, PreviewInfo } from '@/lib/types'
import { useStreamPreview } from '@/hooks/useStreamPreview'

interface ConnectionPreviewProps {
  stream: StreamInfo
}

// Connection instructions per stream type
const CONNECTION_GUIDES: Record<string, { tool: string; instructions: string }> = {
  video: {
    tool: 'VLC / ffplay',
    instructions: 'Connect using a media player that supports the stream protocol.',
  },
  ndi: {
    tool: 'NDI Monitor / NDI Tools',
    instructions: 'Install NewTek NDI Tools and use NDI Monitor to discover and view this source on the network.',
  },
  srt: {
    tool: 'VLC / ffplay / OBS',
    instructions: 'Connect using an SRT-capable player or encoder.',
  },
  texture: {
    tool: 'Application-specific',
    instructions: 'Texture streams use GPU shared memory. Connect from an application on the same machine.',
  },
  spout: {
    tool: 'Spout Receiver (Windows)',
    instructions: 'Use any Spout-compatible application on the same Windows machine to receive this texture.',
  },
  syphon: {
    tool: 'Syphon Client (macOS)',
    instructions: 'Use any Syphon-compatible application on the same macOS machine to receive this texture.',
  },
}

export function ConnectionPreview({ stream }: ConnectionPreviewProps) {
  const { info } = useStreamPreview(stream.id)
  const [copied, setCopied] = useState<string | null>(null)
  const guide = CONNECTION_GUIDES[stream.stream_type] || CONNECTION_GUIDES.video

  // Build connection string based on protocol
  const connectionString = buildConnectionString(stream, info)

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard not available
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-white">Connection Info</h3>
        <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 rounded-full uppercase">
          {stream.protocol}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Notice */}
        <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
          <span className="text-lg">&#9432;</span>
          <div className="text-xs text-slate-400 space-y-1">
            <p className="text-slate-300 font-medium">
              Live preview is not available for {stream.stream_type.toUpperCase()} streams
            </p>
            <p>{guide.instructions}</p>
          </div>
        </div>

        {/* Connection details */}
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Connection Details</div>

          <div className="space-y-2">
            <InfoRow label="Protocol" value={stream.protocol.toUpperCase()} />
            <InfoRow label="Address" value={stream.address} />
            <InfoRow label="Port" value={String(stream.port)} />
            {stream.publisher_id && (
              <InfoRow label="Publisher" value={stream.publisher_id} />
            )}
          </div>
        </div>

        {/* Connection string */}
        {connectionString && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Connection String</div>
            <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-lg">
              <code className="flex-1 text-xs text-cyan-300 font-mono break-all">
                {connectionString}
              </code>
              <button
                onClick={() => handleCopy(connectionString, 'connection')}
                className="flex-shrink-0 px-2 py-1 text-[10px] font-medium rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                {copied === 'connection' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Recommended tool */}
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Recommended Tool</div>
          <div className="text-sm text-slate-300">{guide.tool}</div>
        </div>

        {/* Stream config */}
        {Object.keys(stream.config).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Stream Config</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stream.config).map(([key, val]) => (
                <span
                  key={key}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded font-mono"
                >
                  {key}: {String(val)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-300 font-mono">{value}</span>
    </div>
  )
}

function buildConnectionString(stream: StreamInfo, info: PreviewInfo | null): string | null {
  const addr = info?.address || stream.address
  const port = info?.port || stream.port

  switch (stream.protocol) {
    case 'srt':
      return `srt://${addr}:${port}`
    case 'udp':
      return `udp://${addr}:${port}`
    case 'tcp':
      return `tcp://${addr}:${port}`
    case 'ndi':
      return stream.name // NDI uses source names
    case 'webrtc':
      return `webrtc://${addr}:${port}`
    default:
      return `${stream.protocol}://${addr}:${port}`
  }
}
