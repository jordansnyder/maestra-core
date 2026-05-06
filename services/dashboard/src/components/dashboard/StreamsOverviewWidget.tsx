'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { streamsApi } from '@/lib/api'
import { Card } from '@/components/Card'
import { ChevronRight } from '@/components/icons'
import { Radio } from 'lucide-react'
import type { StreamRegistryState } from '@/lib/types'

const STREAM_TYPE_COLORS: Record<string, string> = {
  ndi: 'bg-cyan-600/40 text-cyan-400',
  audio: 'bg-green-600/40 text-green-400',
  video: 'bg-purple-600/40 text-purple-400',
  sensor: 'bg-amber-600/40 text-amber-400',
  osc: 'bg-blue-600/40 text-blue-400',
  midi: 'bg-pink-600/40 text-pink-400',
  data: 'bg-slate-600/40 text-slate-400',
  texture: 'bg-orange-600/40 text-orange-400',
  srt: 'bg-red-600/40 text-red-400',
  spout: 'bg-teal-600/40 text-teal-400',
  syphon: 'bg-indigo-600/40 text-indigo-400',
}

export function StreamsOverviewWidget() {
  const [state, setState] = useState<StreamRegistryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const data = await streamsApi.getState()
      setState(data)
      setError(null)
    } catch {
      setError('Failed to load streams')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [fetchData])

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <div className="h-4 w-24 bg-slate-700/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-700/30 rounded animate-pulse" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{error}</span>
          <button onClick={fetchData} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
        </div>
      </Card>
    )
  }

  const streams = state?.streams || []
  const sessions = state?.sessions || []

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-300">Streams</h3>
        </div>
        <Link href="/streams" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {streams.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-1">No active streams</p>
          <p className="text-xs text-slate-600">Streams appear when devices publish NDI, audio, or sensor data.</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-purple-400">{streams.length}</span>
            <span className="text-sm text-slate-500">active, {sessions.length} sessions</span>
          </div>

          <div className="space-y-1.5">
            {streams.slice(0, 4).map(stream => (
              <div key={stream.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STREAM_TYPE_COLORS[stream.stream_type] || 'bg-slate-600/40 text-slate-400'}`}>
                  {stream.stream_type}
                </span>
                <span className="text-slate-300 truncate flex-1">{stream.name}</span>
              </div>
            ))}
            {streams.length > 4 && (
              <Link href="/streams" className="block text-xs text-slate-600 hover:text-blue-400 transition-colors">
                +{streams.length - 4} more
              </Link>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
