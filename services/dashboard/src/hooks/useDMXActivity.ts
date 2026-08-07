import { useEffect, useRef, useState } from 'react'

import { entitiesApi } from '@/lib/api'
import { getWsUrl } from '@/lib/hosts'

const WS_URL = getWsUrl()
const ACTIVE_TTL = 600 // ms to keep a fixture lit after last data packet

export type EntityLiveState = Record<string, unknown>

export interface DMXActivity {
  /** Entity IDs that received data within the last ACTIVE_TTL ms. */
  activeIds: Set<string>
  /** Latest known entity state keyed by entity_id (merged across updates). */
  liveStates: Map<string, EntityLiveState>
}

/**
 * Subscribes to maestra.entity.state.> via the WebSocket gateway and returns
 * both a recent-activity Set and the latest state per entity. States are
 * primed with a one-shot REST fetch so fixtures render their current look
 * before any live traffic arrives, then merged from broadcasts. Incoming
 * updates are batched to animation frames so 10 Hz playback across many
 * fixtures doesn't trigger a render per message.
 */
export function useDMXActivity(): DMXActivity {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [liveStates, setLiveStates] = useState<Map<string, EntityLiveState>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRef = useRef<Map<string, EntityLiveState>>(new Map())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>
    let alive = true

    function flushStates() {
      rafRef.current = null
      if (!alive || pendingRef.current.size === 0) return
      const pending = pendingRef.current
      pendingRef.current = new Map()
      setLiveStates((prev) => {
        const next = new Map(prev)
        pending.forEach((state, id) => {
          next.set(id, { ...(next.get(id) ?? {}), ...state })
        })
        return next
      })
    }

    function queueState(entityId: string, state: EntityLiveState) {
      const merged = { ...(pendingRef.current.get(entityId) ?? {}), ...state }
      pendingRef.current.set(entityId, merged)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushStates)
      }
    }

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

    // Prime with current entity states so fixtures render immediately
    entitiesApi
      .list()
      .then((entities) => {
        if (!alive) return
        setLiveStates((prev) => {
          const next = new Map(prev)
          for (const e of entities) {
            if (e.state && !next.has(e.id)) next.set(e.id, e.state)
          }
          return next
        })
      })
      .catch(() => {
        /* non-fatal — states arrive via WS once traffic flows */
      })

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
          if (!entityId) return
          markActive(entityId)
          const state = data.current_state ?? data.state
          if (state && typeof state === 'object') queueState(entityId, state)
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])

  return { activeIds, liveStates }
}
