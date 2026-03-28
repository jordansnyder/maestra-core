'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity } from '@/components/icons'
import { getWsUrl } from '@/lib/hosts'

interface LiveOscPreviewProps {
  oscAddress: string
}

interface PreviewMessage {
  id: number
  subject: string
  data: unknown
  timestamp: string
}

const MAX_MESSAGES = 5
const THROTTLE_INTERVAL = 100 // ~10 msg/s

export function LiveOscPreview({ oscAddress }: LiveOscPreviewProps) {
  const [messages, setMessages] = useState<PreviewMessage[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<NodeJS.Timeout>()
  const lastUpdateRef = useRef(0)
  const pendingRef = useRef<PreviewMessage | null>(null)
  const throttleTimerRef = useRef<NodeJS.Timeout>()
  const seqRef = useRef(0)

  // Convert OSC address /a/b/c to NATS subject maestra.osc.a.b.c
  const toNatsSubject = useCallback((addr: string) => {
    if (!addr) return ''
    const cleaned = addr.startsWith('/') ? addr.slice(1) : addr
    return `maestra.osc.${cleaned.replace(/\//g, '.')}`
  }, [])

  const natsSubject = toNatsSubject(oscAddress)

  useEffect(() => {
    if (!oscAddress) return

    // Reset messages when address changes
    setMessages([])
    seqRef.current = 0

    const WS_URL = getWsUrl()

    function connect() {
      try {
        const ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          setConnected(true)
          // Subscribe to the OSC subject pattern
          ws.send(JSON.stringify({
            type: 'subscribe',
            subject: natsSubject,
          }))
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type !== 'message') return
            if (!msg.subject) return

            // Check if the subject matches our expected pattern
            if (!msg.subject.startsWith(natsSubject.replace('.>', '').replace('.*', ''))) {
              // Also do exact match
              if (msg.subject !== natsSubject) return
            }

            const now = Date.now()
            const previewMsg: PreviewMessage = {
              id: seqRef.current++,
              subject: msg.subject,
              data: msg.data,
              timestamp: msg.timestamp || new Date().toISOString(),
            }

            // Throttle display updates to ~10/s
            if (now - lastUpdateRef.current >= THROTTLE_INTERVAL) {
              lastUpdateRef.current = now
              setMessages((prev) => [previewMsg, ...prev].slice(0, MAX_MESSAGES))
            } else {
              // Queue the latest message for next update
              pendingRef.current = previewMsg
              if (!throttleTimerRef.current) {
                throttleTimerRef.current = setTimeout(() => {
                  if (pendingRef.current) {
                    lastUpdateRef.current = Date.now()
                    setMessages((prev) => [pendingRef.current!, ...prev].slice(0, MAX_MESSAGES))
                    pendingRef.current = null
                  }
                  throttleTimerRef.current = undefined
                }, THROTTLE_INTERVAL)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onerror = () => {
          setConnected(false)
        }

        ws.onclose = () => {
          setConnected(false)
          // Reconnect after 5 seconds
          reconnectRef.current = setTimeout(connect, 5000)
        }

        wsRef.current = ws
      } catch {
        setConnected(false)
      }
    }

    connect()

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [oscAddress, natsSubject])

  if (!oscAddress) {
    return null
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-medium text-slate-400">Live Preview</span>
        <span className="text-[10px] font-mono text-slate-600 ml-auto">{natsSubject}</span>
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>

      {!connected ? (
        <div className="text-xs text-red-400/70 py-2">Disconnected</div>
      ) : messages.length === 0 ? (
        <div className="text-xs text-slate-600 py-2">Waiting for messages...</div>
      ) : (
        <div className="space-y-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-2 text-[11px] font-mono leading-tight"
            >
              <span className="text-slate-600 shrink-0">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-slate-400 truncate">
                {typeof msg.data === 'object'
                  ? JSON.stringify(msg.data)
                  : String(msg.data ?? '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
