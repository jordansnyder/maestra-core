'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useConsole, type GraphNode, type Protocol } from './ConsoleProvider'

// --- Color types & palettes ---

type RGB = [number, number, number]

const PROTOCOL_COLORS: Record<Protocol, RGB> = {
  osc:      [34,  211, 238], // cyan-400
  mqtt:     [52,  211, 153], // emerald-400
  ws:       [167, 139, 250], // violet-400
  dmx:      [251, 191,  36], // amber-400
  internal: [148, 163, 184], // slate-400
}

// Per-gateway node color (by node ID)
const GATEWAY_COLORS: Record<string, RGB> = {
  'gateway-osc':  [34,  211, 238],
  'gateway-mqtt': [52,  211, 153],
  'gateway-ws':   [167, 139, 250],
  'gateway-dmx':  [251, 191,  36],
}

const BACKGROUND = '#0a0a0f'
const MAX_PARTICLES = 250
const PARTICLE_LIFETIME = 1100 // ms
const HEAT_DECAY = 0.35        // heat units/second — full decay in ~3s

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`
}

// --- Node & Particle types ---

interface AmbientNode {
  id: string
  label: string
  type: string
  x: number
  y: number
  radius: number
  targetRadius: number
  breathPhase: number
  heat: number        // 0–1, amplifies glow
  lastActivity: number
}

interface Particle {
  active: boolean
  startX: number; startY: number
  targetX: number; targetY: number
  controlX: number; controlY: number
  x: number; y: number
  color: RGB
  size: number
  lifetime: number
  startTime: number
  trail: Array<{ x: number; y: number }>
  isRipple: boolean
  rippleRadius: number
  arrivedFired: boolean
  onArrive: (() => void) | null
}

function makeParticle(): Particle {
  return {
    active: false,
    startX: 0, startY: 0, targetX: 0, targetY: 0,
    controlX: 0, controlY: 0, x: 0, y: 0,
    color: [148, 163, 184],
    size: 3,
    lifetime: PARTICLE_LIFETIME,
    startTime: 0,
    trail: [],
    isRipple: false,
    rippleRadius: 0,
    arrivedFired: false,
    onArrive: null,
  }
}

// --- Component ---

export function AmbientCanvas() {
  const { nodes, messages, subscribe, stats } = useConsole()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const ambientNodesRef = useRef<AmbientNode[]>([])
  const lastMsgCountRef = useRef(0)
  const samplingCounterRef = useRef(0)
  const statsRef = useRef(stats)
  const lastRenderTimeRef = useRef(0)
  const idleRingsRef = useRef<Array<{ startTime: number; x: number; y: number }>>([])

  // Keep statsRef current so the render loop never reads stale values
  useEffect(() => { statsRef.current = stats }, [stats])

  // Track canvas size for layout recalculation
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(canvas)
    setCanvasSize({ width: canvas.clientWidth || 800, height: canvas.clientHeight || 600 })
    return () => observer.disconnect()
  }, [])

  // --- Particle pool ---

  const acquireParticle = useCallback((): Particle => {
    const pool = particlesRef.current
    const free = pool.find(p => !p.active)
    if (free) return free
    if (pool.length < MAX_PARTICLES) {
      const p = makeParticle()
      pool.push(p)
      return p
    }
    // FIFO: evict the oldest active particle
    return pool.reduce((oldest, p) => p.startTime < oldest.startTime ? p : oldest)
  }, [])

  const spawnParticle = useCallback((
    src: AmbientNode,
    dst: AmbientNode,
    color: RGB,
    size: number,
    onArrive: (() => void) | null,
  ) => {
    const p = acquireParticle()
    const midX = (src.x + dst.x) / 2
    const midY = (src.y + dst.y) / 2
    const dx = dst.x - src.x
    const dy = dst.y - src.y
    const perpX = -dy * 0.25
    const perpY = dx * 0.25

    p.active = true
    p.startX = src.x;    p.startY = src.y
    p.targetX = dst.x;   p.targetY = dst.y
    p.controlX = midX + perpX
    p.controlY = midY + perpY
    p.x = src.x;         p.y = src.y
    p.color = color
    p.size = size
    p.lifetime = PARTICLE_LIFETIME
    p.startTime = Date.now()
    p.trail = []
    p.isRipple = false
    p.rippleRadius = 0
    p.arrivedFired = false
    p.onArrive = onArrive

    src.heat = Math.min(1, src.heat + 0.35)
    src.lastActivity = Date.now()
  }, [acquireParticle])

  const spawnRipple = useCallback((node: AmbientNode, color: RGB) => {
    const p = acquireParticle()
    p.active = true
    p.startX = node.x;  p.startY = node.y
    p.targetX = node.x; p.targetY = node.y
    p.controlX = node.x; p.controlY = node.y
    p.x = node.x;       p.y = node.y
    p.color = color
    p.size = 2
    p.lifetime = PARTICLE_LIFETIME
    p.startTime = Date.now()
    p.trail = []
    p.isRipple = true
    p.rippleRadius = node.radius
    p.arrivedFired = false
    p.onArrive = null

    node.heat = Math.min(1, node.heat + 0.2)
    node.lastActivity = Date.now()
  }, [acquireParticle])

  // --- Node layout: preserve heat/activity across re-layouts ---

  useEffect(() => {
    if (nodes.length === 0) return
    const { width, height } = canvasSize
    if (width < 10 || height < 10) return

    const cx = width / 2
    const cy = height / 2

    // Build a map so we can reuse existing node objects (preserving heat)
    const existing = new Map<string, AmbientNode>()
    for (const n of ambientNodesRef.current) existing.set(n.id, n)

    const makeNode = (n: GraphNode, x: number, y: number, r: number): AmbientNode => {
      const ex = existing.get(n.id)
      if (ex) {
        ex.x = x; ex.y = y; ex.radius = r
        return ex
      }
      return {
        id: n.id, label: n.label, type: n.type,
        x, y, radius: r, targetRadius: r,
        breathPhase: Math.random() * Math.PI * 2,
        heat: 0, lastActivity: 0,
      }
    }

    const busNode    = nodes.find(n => n.type === 'bus')
    const gateways   = nodes.filter(n => n.type === 'gateway')
    const rest       = nodes.filter(n => n.type !== 'bus' && n.type !== 'gateway')
    const result: AmbientNode[] = []

    if (busNode) {
      result.push(makeNode(busNode, cx, cy, 28))
    }

    const innerR = Math.min(width, height) * 0.22
    gateways.forEach((n, i) => {
      const angle = (i / Math.max(gateways.length, 1)) * Math.PI * 2 - Math.PI / 2
      result.push(makeNode(n,
        cx + Math.cos(angle) * innerR,
        cy + Math.sin(angle) * innerR,
        10,
      ))
    })

    const outerR = Math.min(width, height) * 0.38
    rest.forEach((n, i) => {
      const angle = (i / Math.max(rest.length, 1)) * Math.PI * 2 - Math.PI / 2
      result.push(makeNode(n,
        cx + Math.cos(angle) * outerR,
        cy + Math.sin(angle) * outerR,
        7,
      ))
    })

    ambientNodesRef.current = result
  }, [nodes, canvasSize])

  // --- Subscribe for particle spawning ---

  useEffect(() => {
    return subscribe(() => {
      const msgs = messages.current
      if (msgs.length <= lastMsgCountRef.current) return

      const newMsgs = msgs.slice(lastMsgCountRef.current)
      lastMsgCountRef.current = msgs.length

      const rate = statsRef.current.messagesPerSecond
      const shouldSample = rate > 60

      for (const msg of newMsgs) {
        if (msg.isDivider || msg.isPauseSummary) continue

        if (shouldSample) {
          samplingCounterRef.current++
          const skipRate = Math.max(1, Math.floor(rate / 60))
          if (samplingCounterRef.current % skipRate !== 0) continue
        }

        const an = ambientNodesRef.current
        const busNode = an.find(n => n.type === 'bus')
        if (!busNode) continue

        const color = PROTOCOL_COLORS[msg.protocol] ?? PROTOCOL_COLORS.internal

        // Internal messages: ripple from bus only
        if (msg.protocol === 'internal') {
          spawnRipple(busNode, color)
          continue
        }

        // Determine source gateway node
        const gatewayId: string | null =
          msg.sourceNode ??
          (msg.protocol === 'osc'  ? 'gateway-osc'  :
           msg.protocol === 'mqtt' ? 'gateway-mqtt' :
           msg.protocol === 'ws'   ? 'gateway-ws'   :
           msg.protocol === 'dmx'  ? 'gateway-dmx'  : null)

        const gatewayNode = gatewayId ? an.find(n => n.id === gatewayId) : null
        const targetNode  = msg.targetNode ? an.find(n => n.id === msg.targetNode) : null

        if (gatewayNode) {
          // Two-hop: gateway → bus → entity (or ripple at bus)
          spawnParticle(gatewayNode, busNode, color, 3, () => {
            busNode.heat = Math.min(1, busNode.heat + 0.08)
            if (targetNode) {
              spawnParticle(busNode, targetNode, color, 2.5, () => {
                spawnRipple(targetNode, color)
              })
            } else {
              spawnRipple(busNode, color)
            }
          })
        } else {
          spawnRipple(busNode, color)
        }
      }
    })
  }, [subscribe, messages, spawnParticle, spawnRipple])

  // --- Main render loop (empty deps — all state via refs) ---

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let mounted = true

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = canvas.clientWidth  * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const render = (timestamp: number) => {
      if (!mounted) return

      const dt = lastRenderTimeRef.current
        ? Math.min((timestamp - lastRenderTimeRef.current) / 1000, 0.1)
        : 0.016
      lastRenderTimeRef.current = timestamp

      const now = Date.now()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const an = ambientNodesRef.current
      const busNode = an.find(n => n.type === 'bus')
      const mps = statsRef.current.messagesPerSecond

      // Background
      ctx.fillStyle = BACKGROUND
      ctx.fillRect(0, 0, w, h)
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6)
      bgGrad.addColorStop(0, '#0b0b1e')
      bgGrad.addColorStop(1, BACKGROUND)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Topology lines: bus ↔ each gateway (always visible, heat-modulated)
      if (busNode) {
        for (const node of an) {
          if (node.type !== 'gateway') continue
          const [r, g, b] = GATEWAY_COLORS[node.id] ?? [148, 163, 184]
          const lineAlpha = 0.07 + node.heat * 0.18
          ctx.beginPath()
          ctx.moveTo(busNode.x, busNode.y)
          ctx.lineTo(node.x, node.y)
          ctx.strokeStyle = rgba(r, g, b, lineAlpha)
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Idle bus rings when message rate < 1 msg/s
      if (mps < 1 && busNode) {
        const lastRing = idleRingsRef.current[idleRingsRef.current.length - 1]
        if (!lastRing || now - lastRing.startTime > 2000) {
          idleRingsRef.current.push({ startTime: now, x: busNode.x, y: busNode.y })
        }
        idleRingsRef.current = idleRingsRef.current.filter(ring => now - ring.startTime < 4000)
        for (const ring of idleRingsRef.current) {
          const t = (now - ring.startTime) / 4000
          ctx.beginPath()
          ctx.arc(ring.x, ring.y, busNode.radius + t * 60, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(148, 163, 184, (1 - t) * 0.12)
          ctx.lineWidth = 1
          ctx.stroke()
        }
      } else if (mps >= 1) {
        idleRingsRef.current = []
      }

      // Nodes
      for (const node of an) {
        // Heat decay
        node.heat = Math.max(0, node.heat - HEAT_DECAY * dt)

        // Ease targetRadius back to base
        const baseR = node.radius
        if (node.targetRadius > baseR) {
          node.targetRadius = Math.max(baseR, node.targetRadius - (node.targetRadius - baseR) * Math.min(1, dt * 8))
        } else {
          node.targetRadius = baseR
        }

        const breathOffset = Math.sin(now / 3000 * Math.PI * 2 + node.breathPhase) * 1.5
        const drawR = node.targetRadius + breathOffset + node.heat * 4

        if (node.type === 'bus') {
          // Multi-layer nebula glow
          for (let i = 3; i >= 0; i--) {
            ctx.beginPath()
            ctx.arc(node.x, node.y, drawR + i * 11 + node.heat * 8, 0, Math.PI * 2)
            ctx.fillStyle = rgba(148, 163, 184, (0.022 + node.heat * 0.018) / (i + 1))
            ctx.fill()
          }
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(148, 163, 184, 0.35 + node.heat * 0.45)
          ctx.lineWidth = 1.5
          ctx.stroke()
          // Center dot
          ctx.beginPath()
          ctx.arc(node.x, node.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = rgba(148, 163, 184, 0.65 + node.heat * 0.35)
          ctx.fill()

        } else if (node.type === 'gateway') {
          const [r, g, b] = GATEWAY_COLORS[node.id] ?? [148, 163, 184]
          // Heat glow
          if (node.heat > 0.04) {
            const glowGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, drawR * 4)
            glowGrad.addColorStop(0, rgba(r, g, b, node.heat * 0.45))
            glowGrad.addColorStop(1, rgba(r, g, b, 0))
            ctx.beginPath()
            ctx.arc(node.x, node.y, drawR * 4, 0, Math.PI * 2)
            ctx.fillStyle = glowGrad
            ctx.fill()
          }
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2)
          ctx.fillStyle = rgba(r, g, b, 0.5 + node.heat * 0.35)
          ctx.fill()
          ctx.strokeStyle = rgba(r, g, b, 0.85 + node.heat * 0.15)
          ctx.lineWidth = 1
          ctx.stroke()

        } else {
          // Device (blue) or entity (green)
          const [r, g, b]: RGB = node.type === 'device' ? [96, 165, 250] : [52, 211, 153]
          if (node.heat > 0.08) {
            const glowGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, drawR * 3.5)
            glowGrad.addColorStop(0, rgba(r, g, b, node.heat * 0.4))
            glowGrad.addColorStop(1, rgba(r, g, b, 0))
            ctx.beginPath()
            ctx.arc(node.x, node.y, drawR * 3.5, 0, Math.PI * 2)
            ctx.fillStyle = glowGrad
            ctx.fill()
          }
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2)
          ctx.fillStyle = rgba(r, g, b, 0.4 + node.heat * 0.45)
          ctx.fill()
        }

        // Labels: always for bus/gateway; fade in for entities/devices based on heat
        const isFixed = node.type === 'bus' || node.type === 'gateway'
        const labelAlpha = isFixed
          ? 0.5 + node.heat * 0.4
          : Math.min(1, node.heat * 2.5)
        if (labelAlpha > 0.02) {
          ctx.fillStyle = rgba(148, 163, 184, labelAlpha)
          ctx.font = `${node.type === 'bus' ? 11 : 9}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(node.label, node.x, node.y + drawR + 13)
        }
      }

      // Particles
      for (const p of particlesRef.current) {
        if (!p.active) continue

        const elapsed = now - p.startTime

        // Fire onArrive just before the particle reaches the target (~92% of lifetime)
        if (!p.arrivedFired && elapsed >= p.lifetime * 0.92) {
          p.arrivedFired = true
          p.onArrive?.()
        }

        if (elapsed >= p.lifetime) {
          p.active = false
          continue
        }

        const t = elapsed / p.lifetime
        const [r, g, b] = p.color

        if (p.isRipple) {
          const radius  = p.rippleRadius + t * 55
          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(r, g, b, (1 - t) * 0.5)
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          // Ease-out quadratic Bezier
          const ease = 1 - Math.pow(1 - t, 2.5)
          const inv  = 1 - ease
          const nx = inv * inv * p.startX + 2 * inv * ease * p.controlX + ease * ease * p.targetX
          const ny = inv * inv * p.startY + 2 * inv * ease * p.controlY + ease * ease * p.targetY

          p.trail.push({ x: nx, y: ny })
          if (p.trail.length > 6) p.trail.shift()
          p.x = nx; p.y = ny

          const trailAlphas = [0.04, 0.1, 0.22, 0.42, 0.65, 1.0]
          for (let i = 0; i < p.trail.length; i++) {
            const tp = p.trail[i]
            const a  = trailAlphas[Math.min(i, trailAlphas.length - 1)] * (1 - t * 0.4)
            const ts = p.size * (0.45 + (i / p.trail.length) * 0.55)
            ctx.beginPath()
            ctx.arc(tp.x, tp.y, ts, 0, Math.PI * 2)
            ctx.fillStyle = rgba(r, g, b, a)
            ctx.fill()
          }
        }
      }

      // HUD
      ctx.fillStyle = rgba(148, 163, 184, 0.28)
      ctx.font = '10px ui-monospace, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(new Date().toLocaleTimeString('en-US', { hour12: false }), 16, h - 16)
      if (mps > 0) {
        ctx.textAlign = 'right'
        ctx.fillText(`${mps} msg/s`, w - 16, h - 16)
      }

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)

    return () => {
      mounted = false
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, []) // empty — all mutable state is accessed via refs

  const isEmpty = messages.current.length === 0

  return (
    <div className="relative flex-1 bg-[#0a0a0f]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-mono text-slate-600/30">Waiting for messages...</span>
        </div>
      )}
    </div>
  )
}
