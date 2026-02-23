import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { WebSocketMessage } from '@/types'

export type ActivityCategory = 'device' | 'entity' | 'system' | 'route'

export interface ActivityItem {
  id: string
  timestamp: Date
  category: ActivityCategory
  title: string
  detail: string
  severity: 'info' | 'warning' | 'error'
}

let idCounter = 0

function parseMessage(msg: WebSocketMessage): ActivityItem | null {
  const timestamp = new Date(msg.timestamp || Date.now())
  const subject = msg.subject || ''
  const data = msg.data || {}

  // Welcome / connection messages
  if (msg.type === 'welcome') {
    return {
      id: `act-${++idCounter}`,
      timestamp,
      category: 'system',
      title: 'Connected',
      detail: 'WebSocket connection established',
      severity: 'info',
    }
  }

  if (msg.type === 'error') {
    return {
      id: `act-${++idCounter}`,
      timestamp,
      category: 'system',
      title: 'Error',
      detail: data?.message || msg.subject || 'Unknown error',
      severity: 'error',
    }
  }

  if (msg.type !== 'message') return null

  // Entity state change events
  if (subject.includes('state') || subject.includes('entity')) {
    const slug = data.entity_slug || data.slug || subject.split('.').pop() || 'unknown'
    const changedKeys = data.changed_keys
    const detail = changedKeys
      ? `${slug}: ${changedKeys.join(', ')} changed`
      : `${slug} state updated`
    return {
      id: `act-${++idCounter}`,
      timestamp,
      category: 'entity',
      title: 'State updated',
      detail,
      severity: 'info',
    }
  }

  // Device events
  if (subject.includes('device') || subject.includes('heartbeat')) {
    const deviceName = data.device_name || data.name || 'Unknown device'
    const isHeartbeat = subject.includes('heartbeat')
    const isRegister = subject.includes('register')
    const action = isHeartbeat ? 'heartbeat' : isRegister ? 'registered' : 'event'
    return {
      id: `act-${++idCounter}`,
      timestamp,
      category: 'device',
      title: `Device ${action}`,
      detail: deviceName,
      severity: isRegister ? 'info' : 'info',
    }
  }

  // Route events
  if (subject.includes('route')) {
    const from = data.from || '?'
    const to = data.to || '?'
    return {
      id: `act-${++idCounter}`,
      timestamp,
      category: 'route',
      title: 'Route changed',
      detail: `${from} \u2192 ${to}`,
      severity: 'info',
    }
  }

  // Generic fallback
  return {
    id: `act-${++idCounter}`,
    timestamp,
    category: 'system',
    title: 'Message',
    detail: subject || 'Unknown',
    severity: 'info',
  }
}

export function useActivityFeed(maxItems = 50) {
  const { isConnected, lastMessage } = useWebSocket(true)
  const [items, setItems] = useState<ActivityItem[]>([])
  const lastMessageRef = useRef<WebSocketMessage | null>(null)

  useEffect(() => {
    if (!lastMessage || lastMessage === lastMessageRef.current) return
    lastMessageRef.current = lastMessage

    const item = parseMessage(lastMessage)
    if (!item) return

    setItems((prev) => [item, ...prev].slice(0, maxItems))
  }, [lastMessage, maxItems])

  const clear = useCallback(() => setItems([]), [])

  return { items, isConnected, clear }
}
