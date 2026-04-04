'use client'

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { WebSocketMessage } from '@/types'
import type { Device } from '@/types'
import { api, dmxApi } from '@/lib/api'
import type { DMXNode, DMXFixture } from '@/lib/types'

// crypto.randomUUID() requires a secure context (HTTPS or localhost).
// Fall back to a manual implementation for plain HTTP access.
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// --- Types ---

export type Protocol = 'osc' | 'mqtt' | 'ws' | 'dmx' | 'internal'

export interface ConsoleMessage {
  id: string
  timestamp: string
  subject: string
  protocol: Protocol
  payload: unknown
  sourceNode: string | null
  targetNode: string | null
  truncated?: boolean
  isPauseSummary?: boolean
  pauseCount?: number
  isDivider?: boolean
  dividerText?: string
}

export interface GraphNode {
  id: string
  label: string
  slug?: string            // entity/device slug used in NATS subjects
  type: 'device' | 'entity' | 'gateway' | 'bus' | 'artnet'
  artnetUniverses?: number[] // Art-Net universe numbers this node handles
  x?: number
  y?: number
  activity: number
}

export type ConsoleMode = 'debug' | 'ambient'

interface ConsoleFilters {
  subjectPattern: string
  protocols: Set<Protocol>
  textSearch: string
  hideHeartbeats: boolean
}

interface ConsoleStats {
  messagesPerSecond: number
  totalCount: number
  bufferDepth: number
  atCapacity: boolean
}

// --- Protocol Detection ---

function detectProtocol(subject: string): Protocol {
  if (subject.startsWith('maestra.osc.')) return 'osc'
  if (subject.startsWith('maestra.mqtt.')) return 'mqtt'
  if (subject.includes('websocket') || subject.startsWith('maestra.ws.')) return 'ws'
  if (subject.startsWith('maestra.dmx.') || subject.startsWith('maestra.to_artnet.')) return 'dmx'
  return 'internal'
}

// --- Source/Destination Resolution ---

function resolveSourceTarget(
  subject: string,
  payload: Record<string, unknown> | null,
  nodeMap: Map<string, GraphNode>
): { source: string | null; target: string | null } {
  // Entity state updates: maestra.entity.state.update.<slug> or maestra.entity.state.set.<slug>
  const entityMatch = subject.match(/maestra\.entity\.state\.(update|set)\.(.+)/)
  if (entityMatch) {
    const slug = entityMatch[2]
    const source = payload?.source as string | undefined
    let sourceId: string | null = null
    if (source) {
      // Try to find a gateway node matching the source protocol
      for (const [id, node] of nodeMap) {
        if (node.type === 'gateway' && node.label.toLowerCase().includes(source)) {
          sourceId = id
          break
        }
      }
    }
    // Find target entity by slug
    let targetId: string | null = null
    for (const [id, node] of nodeMap) {
      if (node.slug === slug || node.label === slug || id === slug) {
        targetId = id
        break
      }
    }
    return { source: sourceId, target: targetId }
  }

  // Entity state broadcasts: maestra.entity.state.<type>.<slug>
  const broadcastMatch = subject.match(/maestra\.entity\.state\.([^.]+)\.(.+)/)
  if (broadcastMatch) {
    const slug = broadcastMatch[2]
    for (const [id, node] of nodeMap) {
      if (node.slug === slug || node.label === slug || id === slug) {
        return { source: id, target: null }
      }
    }
  }

  // Direct Art-Net universe output: maestra.to_artnet.universe.N
  // Flow: something publishes this → DMX gateway subscribes → sends Art-Net UDP to node
  const artnetMatch = subject.match(/maestra\.to_artnet\.universe\.(\d+)/)
  if (artnetMatch) {
    const universe = parseInt(artnetMatch[1])
    for (const [id, node] of nodeMap) {
      if (node.type === 'artnet' && node.artnetUniverses?.includes(universe)) {
        return { source: 'gateway-dmx', target: id }
      }
    }
    return { source: 'gateway-dmx', target: null }
  }

  // Protocol-prefixed messages
  if (subject.startsWith('maestra.osc.')) return { source: 'gateway-osc', target: null }
  if (subject.startsWith('maestra.mqtt.')) return { source: 'gateway-mqtt', target: null }
  if (subject.startsWith('maestra.dmx.')) return { source: 'gateway-dmx', target: null }

  return { source: null, target: null }
}

// --- Stats Calculation (bucket counters) ---

class StatsTracker {
  private buckets: number[] = [0, 0, 0, 0, 0] // 5 one-second buckets
  private currentBucket = 0
  private lastTick = Date.now()
  total = 0

  add() {
    this.tick()
    this.buckets[this.currentBucket]++
    this.total++
  }

  private tick() {
    const now = Date.now()
    const elapsed = Math.floor((now - this.lastTick) / 1000)
    if (elapsed > 0) {
      for (let i = 0; i < Math.min(elapsed, 5); i++) {
        this.currentBucket = (this.currentBucket + 1) % 5
        this.buckets[this.currentBucket] = 0
      }
      this.lastTick = now
    }
  }

  getRate(): number {
    this.tick()
    const sum = this.buckets.reduce((a, b) => a + b, 0)
    return Math.round(sum / 5)
  }
}

// --- Max payload size (50KB) ---
const MAX_PAYLOAD_SIZE = 50 * 1024
const MAX_BUFFER_SIZE = 1000
const BUFFER_GROW_LIMIT = 2000

// --- Context ---

interface ConsoleContextValue {
  // State
  messages: React.MutableRefObject<ConsoleMessage[]>
  mode: ConsoleMode
  setMode: (mode: ConsoleMode) => void
  filters: ConsoleFilters
  setFilters: React.Dispatch<React.SetStateAction<ConsoleFilters>>
  paused: boolean
  setPaused: (paused: boolean) => void
  stats: ConsoleStats
  isConnected: boolean
  nodes: GraphNode[]
  simulate: boolean
  setSimulate: (v: boolean) => void
  // entity_slug → artnet node graph IDs (for DMX output visualisation)
  dmxEntityMap: React.MutableRefObject<Map<string, string[]>>
  // Actions
  clear: () => void
  subscribe: (cb: () => void) => () => void
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null)

export function useConsole() {
  const ctx = useContext(ConsoleContext)
  if (!ctx) throw new Error('useConsole must be used within ConsoleProvider')
  return ctx
}

// --- Provider ---

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, lastMessage } = useWebSocket(true)
  const messagesRef = useRef<ConsoleMessage[]>([])
  const listenersRef = useRef<Set<() => void>>(new Set())
  const statsRef = useRef(new StatsTracker())
  const pausedRef = useRef(false)
  const pauseCountRef = useRef(0)
  const lastMsgRef = useRef<WebSocketMessage | null>(null)
  const wasConnectedRef = useRef(true)

  const [mode, setMode] = useState<ConsoleMode>('debug')
  const [simulate, setSimulate] = useState(false)
  const [paused, setPausedState] = useState(false)
  const [filters, setFilters] = useState<ConsoleFilters>({
    subjectPattern: '',
    protocols: new Set(['osc', 'mqtt', 'ws', 'dmx', 'internal'] as Protocol[]),
    textSearch: '',
    hideHeartbeats: true,
  })
  const [stats, setStats] = useState<ConsoleStats>({
    messagesPerSecond: 0,
    totalCount: 0,
    bufferDepth: 0,
    atCapacity: false,
  })
  const [nodes, setNodes] = useState<GraphNode[]>([])

  // Subscription pattern for buffer changes
  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb)
    return () => { listenersRef.current.delete(cb) }
  }, [])

  const notify = useCallback(() => {
    listenersRef.current.forEach(cb => cb())
  }, [])

  // Add message to buffer
  const addMessage = useCallback((msg: ConsoleMessage) => {
    messagesRef.current.push(msg)
    // Amortized slicing: grow to 2x, then slice back
    if (messagesRef.current.length > BUFFER_GROW_LIMIT) {
      messagesRef.current = messagesRef.current.slice(-MAX_BUFFER_SIZE)
    }
    statsRef.current.add()
    notify()
  }, [notify])

  // Fetch devices and entities for graph topology
  useEffect(() => {
    const fetchTopology = async () => {
      const graphNodes: GraphNode[] = [
        { id: 'bus',          label: 'NATS Bus',     type: 'bus',     activity: 0 },
        { id: 'gateway-osc',  label: 'OSC',          type: 'gateway', activity: 0 },
        { id: 'gateway-mqtt', label: 'MQTT',         type: 'gateway', activity: 0 },
        { id: 'gateway-ws',   label: 'WebSocket',    type: 'gateway', activity: 0 },
        { id: 'gateway-dmx',  label: 'DMX / Art-Net',type: 'gateway', activity: 0 },
      ]
      try {
        const devices = await api.listDevices()
        devices.forEach((d: Device) => {
          graphNodes.push({ id: d.id, label: d.name, type: 'device', activity: 0 })
        })
      } catch {
        // API unavailable — degrade gracefully
      }
      try {
        const entities = await api.listEntities()
        entities.forEach((e: { id: string; name?: string; slug?: string }) => {
          graphNodes.push({
            id: e.id,
            label: e.name || e.slug || e.id,
            slug: e.slug,
            type: 'entity',
            activity: 0,
          })
        })
      } catch {
        // API unavailable — degrade gracefully
      }

      // Art-Net nodes: physical DMX hardware the DMX gateway sends to
      try {
        const dmxNodes = await dmxApi.listNodes()
        dmxNodes.forEach((n: DMXNode) => {
          graphNodes.push({
            id: `artnet-${n.id}`,
            label: n.name,
            slug: n.id,
            type: 'artnet',
            artnetUniverses: n.universes.map(u => u.artnet_universe),
            activity: 0,
          })
        })
      } catch {
        // DMX not configured — degrade gracefully
      }

      // Build entity_slug → artnet_node_ids map for secondary DMX output animations
      try {
        const fixtures = await dmxApi.listFixtures()
        const entitySlugToNodes = new Map<string, Set<string>>()
        fixtures.forEach((f: DMXFixture) => {
          if (f.entity_slug && f.node_id) {
            const key = f.entity_slug
            if (!entitySlugToNodes.has(key)) entitySlugToNodes.set(key, new Set())
            entitySlugToNodes.get(key)!.add(`artnet-${f.node_id}`)
          }
        })
        const map = new Map<string, string[]>()
        entitySlugToNodes.forEach((ids, slug) => map.set(slug, Array.from(ids)))
        dmxEntityMapRef.current = map
      } catch {
        // Fixtures unavailable — degrade gracefully
      }

      setNodes(graphNodes)
    }
    fetchTopology()
    const interval = setInterval(fetchTopology, 30000)
    return () => clearInterval(interval)
  }, [])

  // Build node map for resolution
  const nodeMapRef = useRef(new Map<string, GraphNode>())
  // entity_slug → artnet node IDs (for secondary DMX output particles)
  const dmxEntityMapRef = useRef(new Map<string, string[]>())
  useEffect(() => {
    const map = new Map<string, GraphNode>()
    nodes.forEach(n => map.set(n.id, n))
    nodeMapRef.current = map
  }, [nodes])

  // Process incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage || lastMessage === lastMsgRef.current) return
    lastMsgRef.current = lastMessage

    // Filter out gateway error messages (subscribe errors etc)
    if (lastMessage.type === 'error' || lastMessage.type === 'welcome' ||
        lastMessage.type === 'ack' || lastMessage.type === 'pong') return

    if (lastMessage.type !== 'message' || !lastMessage.subject) return

    const subject = lastMessage.subject

    // Heartbeat filtering
    if (subject.includes('heartbeat')) {
      // Still count in stats even if filtered
      statsRef.current.add()
      if (filters.hideHeartbeats) return
    }

    // Truncate large payloads
    let payload = lastMessage.data
    let truncated = false
    if (payload) {
      const serialized = JSON.stringify(payload)
      if (serialized.length > MAX_PAYLOAD_SIZE) {
        // Don't re-parse truncated JSON (it's invalid) — keep original object
        // but flag it as truncated for the UI
        truncated = true
      }
    }

    const protocol = detectProtocol(subject)
    const { source, target } = resolveSourceTarget(
      subject,
      payload as Record<string, unknown> | null,
      nodeMapRef.current
    )

    const msg: ConsoleMessage = {
      id: generateId(),
      timestamp: lastMessage.timestamp || new Date().toISOString(),
      subject,
      protocol,
      payload,
      sourceNode: source,
      targetNode: target,
      truncated,
    }

    if (pausedRef.current) {
      pauseCountRef.current++
      // Still buffer when paused (counts toward capacity)
      messagesRef.current.push(msg)
      if (messagesRef.current.length > BUFFER_GROW_LIMIT) {
        messagesRef.current = messagesRef.current.slice(-MAX_BUFFER_SIZE)
      }
      return
    }

    addMessage(msg)
  }, [lastMessage, addMessage, filters.hideHeartbeats])

  // Connection state tracking for divider rows
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      addMessage({
        id: generateId(),
        timestamp: new Date().toISOString(),
        subject: '',
        protocol: 'internal',
        payload: null,
        sourceNode: null,
        targetNode: null,
        isDivider: true,
        dividerText: 'Reconnected',
      })
    } else if (!isConnected && wasConnectedRef.current) {
      addMessage({
        id: generateId(),
        timestamp: new Date().toISOString(),
        subject: '',
        protocol: 'internal',
        payload: null,
        sourceNode: null,
        targetNode: null,
        isDivider: true,
        dividerText: 'Connection lost',
      })
    }
    wasConnectedRef.current = isConnected
  }, [isConnected, addMessage])

  // Pause/unpause handler
  const setPaused = useCallback((value: boolean) => {
    if (!value && pausedRef.current && pauseCountRef.current > 0) {
      // Insert summary row on unpause
      addMessage({
        id: generateId(),
        timestamp: new Date().toISOString(),
        subject: '',
        protocol: 'internal',
        payload: null,
        sourceNode: null,
        targetNode: null,
        isPauseSummary: true,
        pauseCount: pauseCountRef.current,
      })
    }
    pausedRef.current = value
    pauseCountRef.current = 0
    setPausedState(value)
  }, [addMessage])

  // Clear buffer
  const clear = useCallback(() => {
    messagesRef.current = []
    statsRef.current = new StatsTracker()
    notify()
  }, [notify])

  // Simulation: inject fake messages to demo the ambient visualization
  useEffect(() => {
    if (!simulate) return

    const TEMPLATES: Array<() => { subject: string; payload: Record<string, unknown> }> = [
      () => ({ subject: 'maestra.osc.venue.stage.dimmer',   payload: { value: +Math.random().toFixed(3) } }),
      () => ({ subject: 'maestra.osc.venue.stage.color',    payload: { r: +Math.random().toFixed(2), g: +Math.random().toFixed(2), b: +Math.random().toFixed(2) } }),
      () => ({ subject: 'maestra.osc.performer.position',   payload: { x: +Math.random().toFixed(3), y: +Math.random().toFixed(3) } }),
      () => ({ subject: 'maestra.mqtt.maestra.devices.sensor.temperature', payload: { temperature: +(20 + Math.random() * 10).toFixed(1), unit: 'C' } }),
      () => ({ subject: 'maestra.mqtt.maestra.devices.controller.button', payload: { id: Math.floor(Math.random() * 8) + 1, state: Math.random() > 0.5 ? 'pressed' : 'released' } }),
      () => ({ subject: 'maestra.mqtt.maestra.devices.sensor.humidity',    payload: { humidity: +(40 + Math.random() * 30).toFixed(1) } }),
      () => ({ subject: 'maestra.ws.client.interaction',    payload: { x: +Math.random().toFixed(3), y: +Math.random().toFixed(3), type: 'touch' } }),
      () => ({ subject: 'maestra.ws.client.event',          payload: { event: ['click', 'hover', 'scroll'][Math.floor(Math.random() * 3)] } }),
      () => ({ subject: 'maestra.dmx.fixture.wash_l1',  payload: { value: Math.floor(Math.random() * 255) } }),
      () => ({ subject: 'maestra.dmx.fixture.spot_c',   payload: { pan: Math.floor(Math.random() * 255), tilt: Math.floor(Math.random() * 255) } }),
    ]

    // Art-Net output: use real node universes if available, else fall back to universe 1
    const artnetNodes = nodes.filter(n => n.type === 'artnet')
    if (artnetNodes.length > 0) {
      artnetNodes.forEach(n => {
        const universes = n.artnetUniverses?.length ? n.artnetUniverses : [1]
        universes.forEach(u => {
          TEMPLATES.push(() => ({
            subject: `maestra.to_artnet.universe.${u}`,
            payload: { channel: Math.floor(Math.random() * 512) + 1, value: Math.floor(Math.random() * 255) },
          }))
        })
      })
    } else {
      // No nodes configured yet — simulate generic universe output
      TEMPLATES.push(() => ({
        subject: `maestra.to_artnet.universe.${Math.ceil(Math.random() * 4)}`,
        payload: { channel: Math.floor(Math.random() * 512) + 1, value: Math.floor(Math.random() * 255) },
      }))
    }

    // Target all real entities using their slug (the actual NATS subject key)
    const entityNodes = nodes.filter(n => n.type === 'entity' && (n.slug || n.label))
    entityNodes.forEach(entity => {
      const subjectSlug = entity.slug || entity.label
      const sources = ['osc', 'mqtt', 'ws']
      TEMPLATES.push(() => ({
        subject: `maestra.entity.state.update.${subjectSlug}`,
        payload: {
          state: { brightness: +Math.random().toFixed(2), active: Math.random() > 0.3 },
          source: sources[Math.floor(Math.random() * sources.length)],
        },
      }))
    })

    const interval = setInterval(() => {
      const count = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < count; i++) {
        const { subject, payload } = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]()
        const protocol = detectProtocol(subject)
        const { source, target } = resolveSourceTarget(subject, payload, nodeMapRef.current)
        addMessage({
          id: generateId(),
          timestamp: new Date().toISOString(),
          subject,
          protocol,
          payload,
          sourceNode: source,
          targetNode: target,
        })
      }
    }, 180)

    return () => clearInterval(interval)
  }, [simulate, nodes, addMessage])

  // Stats update interval
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        messagesPerSecond: statsRef.current.getRate(),
        totalCount: statsRef.current.total,
        bufferDepth: messagesRef.current.length,
        atCapacity: messagesRef.current.length >= MAX_BUFFER_SIZE,
      })
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <ConsoleContext.Provider
      value={{
        messages: messagesRef,
        mode,
        setMode,
        filters,
        setFilters,
        paused,
        setPaused,
        stats,
        isConnected,
        nodes,
        simulate,
        setSimulate,
        dmxEntityMap: dmxEntityMapRef,
        clear,
        subscribe,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  )
}
