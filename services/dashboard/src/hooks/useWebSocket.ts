// WebSocket hook for real-time updates
//
// All calls to useWebSocket() share a single underlying WebSocket connection.
// The connection is reference-counted: it opens when the first consumer mounts
// and closes when the last one unmounts.
//
// For high-frequency message consumers (e.g. ConsoleProvider) use
// subscribeToWsMessages() to register a direct callback that bypasses React
// state entirely, avoiding a re-render on every incoming message.

import { useEffect, useState, useCallback } from 'react'
import type { WebSocketMessage } from '@/types'
import { getWsUrl } from '@/lib/hosts'

// --- Singleton connection manager ---

type MsgListener  = (msg: WebSocketMessage) => void
type ConnListener = (connected: boolean) => void

class WsManager {
  private ws: WebSocket | null = null
  private msgListeners  = new Set<MsgListener>()
  private connListeners = new Set<ConnListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private refCount = 0
  connected = false
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  /** Increment ref-count; opens the connection when first caller mounts. */
  ref() {
    this.refCount++
    if (this.refCount === 1) this._connect()
  }

  /** Decrement ref-count; closes the connection when last caller unmounts. */
  unref() {
    this.refCount = Math.max(0, this.refCount - 1)
    if (this.refCount === 0) {
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
      this.ws?.close()
      this.ws = null
      this.connected = false
    }
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(cb: MsgListener): () => void {
    this.msgListeners.add(cb)
    return () => this.msgListeners.delete(cb)
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onConnectionChange(cb: ConnListener): () => void {
    this.connListeners.add(cb)
    return () => this.connListeners.delete(cb)
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING) return

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      return
    }

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.connected = true
      this.connListeners.forEach(cb => cb(true))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage
        this.msgListeners.forEach(cb => cb(msg))
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    this.ws.onerror = () => {
      console.error('WebSocket error')
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.connected = false
      this.connListeners.forEach(cb => cb(false))
      if (this.refCount > 0) {
        console.log('Attempting to reconnect...')
        this.reconnectTimer = setTimeout(() => this._connect(), 5000)
      }
    }
  }
}

// Instantiated once at module load time (SSR-safe: guarded by typeof window).
const wsManager: WsManager | null =
  typeof window !== 'undefined' ? new WsManager(getWsUrl()) : null

// --- React hook (thin wrapper over the singleton) ---

export function useWebSocket(autoConnect = true) {
  const [isConnected, setIsConnected] = useState(wsManager?.connected ?? false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

  useEffect(() => {
    if (!wsManager || !autoConnect) return

    wsManager.ref()
    // Sync initial connection state in case it connected before this effect ran
    setIsConnected(wsManager.connected)

    const unsubMsg  = wsManager.onMessage(setLastMessage)
    const unsubConn = wsManager.onConnectionChange(setIsConnected)

    return () => {
      unsubMsg()
      unsubConn()
      wsManager.unref()
    }
  }, [autoConnect])

  const send = useCallback((data: unknown) => {
    wsManager?.send(data)
  }, [])

  const subscribe = useCallback((subject: string) => {
    wsManager?.send({ type: 'subscribe', subject })
  }, [])

  const publish = useCallback((subject: string, data: unknown) => {
    wsManager?.send({ type: 'publish', subject, data })
  }, [])

  // connect/disconnect are no-ops — lifecycle is managed by ref-counting.
  // Kept in the return value so call-sites don't need to be updated.
  const connect    = useCallback(() => {}, [])
  const disconnect = useCallback(() => {}, [])

  return {
    isConnected,
    lastMessage,
    error: null as string | null,
    connect,
    disconnect,
    send,
    subscribe,
    publish,
  }
}

/**
 * Register a direct message callback on the shared WebSocket connection,
 * bypassing React state. Use this in high-frequency consumers (e.g.
 * ConsoleProvider) where calling setLastMessage on every message would
 * cause hundreds of unnecessary re-renders per second.
 *
 * Returns an unsubscribe function suitable for use as a useEffect cleanup.
 */
export function subscribeToWsMessages(cb: MsgListener): () => void {
  return wsManager?.onMessage(cb) ?? (() => {})
}

export function subscribeToWsConnection(cb: ConnListener): () => void {
  return wsManager?.onConnectionChange(cb) ?? (() => {})
}
