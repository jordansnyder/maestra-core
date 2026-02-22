// Custom hook for stream registry state management

import { useEffect, useState, useCallback } from 'react'
import { streamsApi } from '@/lib/api'
import type { StreamInfo, StreamSession, StreamTypeInfo } from '@/lib/types'

export interface UseStreamsReturn {
  // Data
  streams: StreamInfo[]
  sessions: StreamSession[]
  streamTypes: StreamTypeInfo[]

  // State
  loading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
  stopSession: (sessionId: string) => Promise<void>
}

export function useStreams(autoRefresh = true, interval = 3000): UseStreamsReturn {
  const [streams, setStreams] = useState<StreamInfo[]>([])
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [streamTypes, setStreamTypes] = useState<StreamTypeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      setError(null)
      const state = await streamsApi.getState()
      setStreams(state.streams)
      setSessions(state.sessions)
      setStreamTypes(state.stream_types)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stream state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()

    if (autoRefresh) {
      const timer = setInterval(fetchState, interval)
      return () => clearInterval(timer)
    }
  }, [autoRefresh, interval, fetchState])

  const stopSession = useCallback(async (sessionId: string) => {
    try {
      await streamsApi.stopSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop session')
    }
  }, [])

  return {
    streams,
    sessions,
    streamTypes,
    loading,
    error,
    refresh: fetchState,
    stopSession,
  }
}
