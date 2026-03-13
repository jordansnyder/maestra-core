'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { streamsApi } from '@/lib/api'
import type { StreamInfo, StreamSession, StreamTypeInfo } from '@/lib/types'
import { StreamDetail } from '@/components/streams/StreamDetail'
import { STREAM_TYPE_ICONS, DEFAULT_STREAM_ICON, ChevronRight } from '@/components/icons'

export default function StreamDetailPage() {
  const params = useParams()
  const streamId = params.id as string

  const [stream, setStream] = useState<StreamInfo | null>(null)
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [streamTypes, setStreamTypes] = useState<StreamTypeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)

      const [streamData, sessionsData, typesData] = await Promise.all([
        streamsApi.getStream(streamId),
        streamsApi.listSessions(streamId),
        streamsApi.listTypes(),
      ])

      setStream(streamData)
      setSessions(sessionsData)
      setStreamTypes(typesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stream')
    } finally {
      setLoading(false)
    }
  }, [streamId])

  useEffect(() => {
    loadData()

    // Refresh sessions every 5s
    const timer = setInterval(async () => {
      try {
        const [streamData, sessionsData] = await Promise.all([
          streamsApi.getStream(streamId),
          streamsApi.listSessions(streamId),
        ])
        setStream(streamData)
        setSessions(sessionsData)
      } catch {
        // Stream may have expired
      }
    }, 5000)

    return () => clearInterval(timer)
  }, [loadData, streamId])

  const getTypeDisplayName = (typeName: string) => {
    const st = streamTypes.find((t) => t.name === typeName)
    return st?.display_name || typeName
  }

  if (loading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !stream) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <Link href="/streams" className="text-slate-400 hover:text-white text-sm">
            Back to Streams
          </Link>
          <div className="mt-8 p-4 bg-red-900/50 border border-red-700 rounded-lg text-sm">
            {error || 'Stream not found or expired'}
          </div>
        </div>
      </div>
    )
  }

  const StreamIcon = STREAM_TYPE_ICONS[stream.stream_type] || DEFAULT_STREAM_ICON

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="text-slate-400 hover:text-white">
            Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <Link href="/streams" className="text-slate-400 hover:text-white">
            Streams
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white">{stream.name}</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
              <StreamIcon className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{stream.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm px-2 py-0.5 bg-slate-700 rounded">
                  {getTypeDisplayName(stream.stream_type)}
                </span>
                <span className="text-sm px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded uppercase font-mono">
                  {stream.protocol}
                </span>
                {stream.active_sessions > 0 && (
                  <span className="text-sm px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                    {stream.active_sessions} session{stream.active_sessions !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-xs text-slate-500 font-mono">{stream.id}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Detail content */}
        <StreamDetail stream={stream} sessions={sessions} streamTypes={streamTypes} />
      </div>
    </div>
  )
}
