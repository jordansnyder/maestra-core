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
    console.log('[WsManager] ref() called, refCount:', this.refCount)
    if (this.refCount === 1) {
      console.log('[WsManager] First caller, initiating connection')
      this._connect()
    }
  }

  /** Decrement ref-count; closes the connection when last caller unmounts. */
  unref() {
    this.refCount = Math.max(0, this.refCount - 1)
    console.log('[WsManager] unref() called, refCount:', this.refCount)
    if (this.refCount === 0) {
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
      this.ws?.close()
      this.ws = null
      this.connected = false
      console.log('[WsManager] Last caller, connection closed')
    }
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(cb: MsgListener): () => void {
    console.log('[WsManager] onMessage() called, msgListeners count:', this.msgListeners.size + 1)
    this.msgListeners.add(cb)
    return () => {
      this.msgListeners.delete(cb)
      console.log('[WsManager] onMessage() cleanup, msgListeners count:', this.msgListeners.size)
    }
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onConnectionChange(cb: ConnListener): () => void {
    console.log('[WsManager] onConnectionChange() called, connListeners count:', this.connListeners.size + 1)
    this.connListeners.add(cb)
    return () => {
      this.connListeners.delete(cb)
      console.log('[WsManager] onConnectionChange() cleanup, connListeners count:', this.connListeners.size)
    }
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WsManager] Already connecting or connected, skipping')
      return
    }

    console.log('[WsManager] Creating new WebSocket connection to:', this.url)
    try {
      this.ws = new WebSocket(this.url)
      console.log('[WsManager] WebSocket instance created')
    } catch (err) {
      console.error('[WsManager] Failed to create WebSocket:', err)
      return
    }

    this.ws.onopen = () => {
      console.log('[WsManager] WebSocket connected')
      this.connected = true
      console.log('[WsManager] Notifying', this.connListeners.size, 'connection listeners')
      this.connListeners.forEach(cb => cb(true))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage
        console.log('[WsManager] Received message, type:', msg.type, 'subject:', msg.subject)
        console.log('[WsManager] Notifying', this.msgListeners.size, 'message listeners')
        this.msgListeners.forEach(cb => cb(msg))
      } catch (err) {
        console.error('[WsManager] Failed to parse WebSocket message:', err)
      }
    }

    this.ws.onerror = () => {
      // Connection errors are expected on initial page load if the gateway
      // isn't ready yet. The onclose handler will schedule a reconnect.
      if (!this.connected) {
        console.debug('[WsManager] WebSocket connection failed (will retry)')
      } else {
        console.error('[WsManager] WebSocket error')
      }
    }

    this.ws.onclose = () => {
      console.log('[WsManager] WebSocket disconnected')
      this.connected = false
      console.log('[WsManager] Notifying', this.connListeners.size, 'connection listeners')
      this.connListeners.forEach(cb => cb(false))
      if (this.refCount > 0) {
        console.log('[WsManager] refCount > 0, scheduling reconnect in 5s')
        this.reconnectTimer = setTimeout(() => this._connect(), 5000)
      } else {
        console.log('[WsManager] refCount === 0, not reconnecting')
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
  if (!wsManager) {
    console.warn('[subscribeToWsMessages] wsManager is null (SSR or not on browser)')
    return () => {}
  }
  console.log('[subscribeToWsMessages] Called from caller')
  const unsub = wsManager.onMessage(cb)
  console.log('[subscribeToWsMessages] Returning unsubscribe function')
  return unsub
}

/**
 * Current connection state of the shared socket. Consumers using the direct
 * callbacks must read this on mount — subscribeToWsConnection only fires on
 * CHANGES, so a socket that connected before the consumer mounted would
 * otherwise be reported as disconnected forever.
 */
export function getWsConnected(): boolean {
  return wsManager?.connected ?? false
}

/** Send on the shared socket without going through the React hook. */
export function sendWsMessage(data: unknown): void {
  wsManager?.send(data)
}

export function subscribeToWsConnection(cb: ConnListener): () => void {
  if (!wsManager) {
    console.warn('[subscribeToWsConnection] wsManager is null (SSR or not on browser)')
    return () => {}
  }
  console.log('[subscribeToWsConnection] Called from caller')
  const unsub = wsManager.onConnectionChange(cb)
  console.log('[subscribeToWsConnection] Returning unsubscribe function')
  return unsub
}
