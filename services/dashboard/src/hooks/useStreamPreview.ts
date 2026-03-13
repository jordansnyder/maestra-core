/**
 * Hook for consuming a live stream preview via Server-Sent Events.
 *
 * The Fleet Manager acts as a consumer proxy — it negotiates with the publisher,
 * receives the raw data, decodes it, and forwards JSON to the browser via SSE.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { streamsApi } from '@/lib/api'
import type { PreviewData, PreviewInfo } from '@/lib/types'

export interface UseStreamPreviewReturn {
  /** Current connection status */
  status: 'idle' | 'connecting' | 'connected' | 'error'
  /** Latest decoded data packet */
  data: PreviewData | null
  /** Rolling buffer of recent packets (last 100) */
  history: PreviewData[]
  /** Connection info from the server */
  info: PreviewInfo | null
  /** Error message if status is 'error' */
  error: string | null
  /** Start the preview stream */
  start: () => void
  /** Stop the preview stream */
  stop: () => void
}

const MAX_HISTORY = 100

export function useStreamPreview(streamId: string | null): UseStreamPreviewReturn {
  const [status, setStatus] = useState<UseStreamPreviewReturn['status']>('idle')
  const [data, setData] = useState<PreviewData | null>(null)
  const [history, setHistory] = useState<PreviewData[]>([])
  const [info, setInfo] = useState<PreviewInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const historyRef = useRef<PreviewData[]>([])
  const rafRef = useRef<number | null>(null)
  const pendingDataRef = useRef<PreviewData | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStatus('idle')
  }, [])

  const start = useCallback(() => {
    if (!streamId) return

    // Clean up any existing connection
    stop()

    setStatus('connecting')
    setError(null)
    setData(null)
    setHistory([])
    setInfo(null)
    historyRef.current = []

    const url = streamsApi.getPreviewUrl(streamId)
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener('info', (event) => {
      try {
        const infoData = JSON.parse(event.data) as PreviewInfo
        setInfo(infoData)
        setStatus('connected')
      } catch {
        // ignore parse errors
      }
    })

    es.addEventListener('preview', (event) => {
      try {
        const previewData = JSON.parse(event.data) as PreviewData
        pendingDataRef.current = previewData

        // Add to history buffer (using ref for O(1) access)
        historyRef.current = [
          ...historyRef.current.slice(-(MAX_HISTORY - 1)),
          previewData,
        ]

        // Throttle React state updates to animation frames
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            if (pendingDataRef.current) {
              setData(pendingDataRef.current)
              setHistory([...historyRef.current])
            }
          })
        }
      } catch {
        // ignore parse errors
      }
    })

    es.addEventListener('error', (event) => {
      // SSE 'error' event from the EventSource API (connection lost, etc.)
      // Check if it's a custom error event with data
      const messageEvent = event as MessageEvent
      if (messageEvent.data) {
        try {
          const errorData = JSON.parse(messageEvent.data)
          setError(errorData.message || 'Stream error')
          setStatus('error')
          return
        } catch {
          // Not a JSON error, it's a connection error
        }
      }

      // Connection error — EventSource will auto-reconnect
      if (es.readyState === EventSource.CLOSED) {
        setStatus('error')
        setError('Connection closed')
      }
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus('error')
        setError('Connection lost')
      }
    }

    es.addEventListener('heartbeat', () => {
      // Keep status as connected
    })
  }, [streamId, stop])

  // Auto-start when streamId is provided
  useEffect(() => {
    if (streamId) {
      start()
    }
    return () => {
      stop()
    }
  }, [streamId, start, stop])

  return { status, data, history, info, error, start, stop }
}
