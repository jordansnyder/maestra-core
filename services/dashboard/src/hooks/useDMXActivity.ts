import { useEffect, useRef, useState } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8765'
const ACTIVE_TTL = 600 // ms to keep a fixture lit after last data packet

/**
 * Subscribes to maestra.entity.state.> via the WebSocket gateway and returns
 * a Set of entity_ids that have received data within the last ACTIVE_TTL ms.
 */
export function useDMXActivity(): Set<string> {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>
    let alive = true

    function markActive(entityId: string) {
      setActiveIds((prev) => {
        if (prev.has(entityId)) return prev
        const next = new Set(prev)
        next.add(entityId)
        return next
      })

      const existing = timersRef.current.get(entityId)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(() => {
        setActiveIds((prev) => {
          const next = new Set(prev)
          next.delete(entityId)
          return next
        })
        timersRef.current.delete(entityId)
      }, ACTIVE_TTL)

      timersRef.current.set(entityId, timer)
    }

    function connect() {
      if (!alive) return
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: 'subscribe', subject: 'maestra.entity.state.>' }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type !== 'message') return
          const data = msg.data || {}
          // Try common locations where entity_id may live
          const entityId: string | undefined =
            data.entity_id ?? data.id ?? msg.subject?.split('.').pop()
          if (entityId) markActive(entityId)
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        if (alive) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(reconnectTimer)
      ws?.close()
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])

  return activeIds
}
