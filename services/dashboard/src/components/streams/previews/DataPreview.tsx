'use client'

import { useEffect, useRef } from 'react'
import type { StreamInfo } from '@/lib/types'
import { useStreamPreview } from '@/hooks/useStreamPreview'

interface DataPreviewProps {
  stream: StreamInfo
}

export function DataPreview({ stream }: DataPreviewProps) {
  const { status, history, info, error } = useStreamPreview(stream.id)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new data arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history.length])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Data Preview</h3>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {info && (
            <span>
              <span className="text-slate-500">Protocol:</span>{' '}
              <span className="font-mono uppercase">{info.protocol}</span>
            </span>
          )}
          <span className="font-mono">{history.length} packets</span>
        </div>
      </div>

      {/* Data log */}
      <div ref={scrollRef} className="overflow-auto max-h-[400px] min-h-[200px]">
        {status === 'connecting' && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Connecting to data stream...
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            {error || 'Connection failed'}
          </div>
        )}

        {history.length > 0 && (
          <div className="divide-y divide-slate-800/50">
            {history.map((entry, i) => {
              // Strip internal fields for display
              const displayData = { ...entry }
              delete (displayData as Record<string, unknown>)._seq

              return (
                <div key={i} className="px-4 py-2 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] text-slate-600 font-mono w-8 pt-0.5 flex-shrink-0">
                      #{entry._seq}
                    </span>
                    <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap flex-1">
                      {formatJson(displayData)}
                    </pre>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {status === 'connected' && history.length === 0 && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            Waiting for data...
          </div>
        )}

        {status === 'idle' && history.length === 0 && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            Click to preview live data
          </div>
        )}
      </div>
    </div>
  )
}

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    idle: 'bg-slate-500/20 text-slate-400',
    connecting: 'bg-yellow-500/20 text-yellow-300',
    connected: 'bg-green-500/20 text-green-300',
    error: 'bg-red-500/20 text-red-400',
  }
  const labels: Record<string, string> = {
    idle: 'Idle',
    connecting: 'Connecting...',
    connected: 'Live',
    error: 'Error',
  }
  return (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${styles[status] || styles.idle}`}>
      {status === 'connected' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />}
      {labels[status] || status}
    </span>
  )
}
