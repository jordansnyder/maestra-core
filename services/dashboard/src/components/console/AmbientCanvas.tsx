'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useConsole, type GraphNode, type Protocol } from './ConsoleProvider'

// --- Protocol colors (more saturated for ambient) ---
const PARTICLE_COLORS: Record<Protocol, string> = {
  osc: '#22d3ee',
  mqtt: '#34d399',
  ws: '#a78bfa',
  internal: '#cbd5e1',
}

const NODE_COLOR = 'rgba(148, 163, 184, 0.6)' // slate-400
const BUS_COLOR = 'rgba(148, 163, 184, 0.3)'
const BACKGROUND = '#0a0a0f'

// --- Particle system ---
interface Particle {
  active: boolean
  x: number
  y: number
  targetX: number
  targetY: number
  startX: number
  startY: number
  controlX: number
  controlY: number
  color: string
  progress: number // 0 to 1
  lifetime: number // ms
  startTime: number
  trail: Array<{ x: number; y: number }>
  isRipple: boolean
  rippleRadius: number
}

interface AmbientNode {
  id: string
  label: string
  type: string
  x: number
  y: number
  radius: number
  targetRadius: number
  breathPhase: number
}

const MAX_PARTICLES = 200
const PARTICLE_LIFETIME = 1500

export function AmbientCanvas() {
  const { nodes, messages, subscribe, stats } = useConsole()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const ambientNodesRef = useRef<AmbientNode[]>([])
  const glowSpritesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const lastMsgCountRef = useRef(0)
  const samplingCounterRef = useRef(0)

  // Create glow sprite for a given color
  const createGlowSprite = useCallback((color: string, radius: number): HTMLCanvasElement => {
    const sprite = document.createElement('canvas')
    const size = radius * 4
    sprite.width = size
    sprite.height = size
    const ctx = sprite.getContext('2d')!
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius * 1.5)
    gradient.addColorStop(0, color)
    // Parse color and create faded version
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    const fadedColor = match
      ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.15)`
      : 'rgba(148, 163, 184, 0.15)'
    gradient.addColorStop(0.5, fadedColor)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    return sprite
  }, [])

  // Track canvas dimensions via ResizeObserver
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
    // Initial size
    setCanvasSize({ width: canvas.clientWidth || 800, height: canvas.clientHeight || 600 })
    return () => observer.disconnect()
  }, [])

  // Layout nodes in radial pattern
  useEffect(() => {
    if (nodes.length === 0) return

    const width = canvasSize.width
    const height = canvasSize.height
    if (width < 10 || height < 10) return
    const centerX = width / 2
    const centerY = height / 2

    const busNode = nodes.find(n => n.type === 'bus')
    const otherNodes = nodes.filter(n => n.type !== 'bus')

    const ambientNodes: AmbientNode[] = []

    // Bus at center
    if (busNode) {
      ambientNodes.push({
        id: busNode.id,
        label: busNode.label,
        type: busNode.type,
        x: centerX,
        y: centerY,
        radius: 30,
        targetRadius: 30,
        breathPhase: Math.random() * Math.PI * 2,
      })
    }

    // Other nodes in concentric rings
    const gateways = otherNodes.filter(n => n.type === 'gateway')
    const rest = otherNodes.filter(n => n.type !== 'gateway')

    // Inner ring: gateways
    gateways.forEach((n, i) => {
      const angle = (i / Math.max(gateways.length, 1)) * Math.PI * 2 - Math.PI / 2
      const ringRadius = Math.min(width, height) * 0.2
      ambientNodes.push({
        id: n.id,
        label: n.label,
        type: n.type,
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
        radius: 12,
        targetRadius: 12,
        breathPhase: Math.random() * Math.PI * 2,
      })
    })

    // Outer ring: devices and entities
    rest.forEach((n, i) => {
      const angle = (i / Math.max(rest.length, 1)) * Math.PI * 2 - Math.PI / 2
      const ringRadius = Math.min(width, height) * 0.35
      ambientNodes.push({
        id: n.id,
        label: n.label,
        type: n.type,
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
        radius: 12,
        targetRadius: 12,
        breathPhase: Math.random() * Math.PI * 2,
      })
    })

    ambientNodesRef.current = ambientNodes

    // Pre-render glow sprites
    const sprites = new Map<string, HTMLCanvasElement>()
    sprites.set('node', createGlowSprite(NODE_COLOR, 12))
    sprites.set('bus', createGlowSprite(BUS_COLOR, 30))
    Object.entries(PARTICLE_COLORS).forEach(([key, color]) => {
      sprites.set(`particle-${key}`, createGlowSprite(color, 5))
    })
    glowSpritesRef.current = sprites
  }, [nodes, canvasSize, createGlowSprite])

  // Subscribe to new messages for particle spawning
  useEffect(() => {
    return subscribe(() => {
      const msgs = messages.current
      if (msgs.length <= lastMsgCountRef.current) return

      const newMsgs = msgs.slice(lastMsgCountRef.current)
      lastMsgCountRef.current = msgs.length

      const rate = stats.messagesPerSecond
      const shouldSample = rate > 60

      for (const msg of newMsgs) {
        if (msg.isDivider || msg.isPauseSummary) continue

        // Probabilistic sampling at high rates
        if (shouldSample) {
          samplingCounterRef.current++
          const skipRate = Math.max(1, Math.floor(rate / 60))
          if (samplingCounterRef.current % skipRate !== 0) continue
        }

        // Find an inactive particle slot
        let particle = particlesRef.current.find(p => !p.active)
        if (!particle) {
          if (particlesRef.current.length < MAX_PARTICLES) {
            particle = {
              active: false, x: 0, y: 0, targetX: 0, targetY: 0,
              startX: 0, startY: 0, controlX: 0, controlY: 0,
              color: '', progress: 0, lifetime: PARTICLE_LIFETIME,
              startTime: 0, trail: [], isRipple: false, rippleRadius: 0,
            }
            particlesRef.current.push(particle)
          } else {
            // FIFO eviction
            particle = particlesRef.current.reduce((oldest, p) =>
              p.startTime < oldest.startTime ? p : oldest
            )
          }
        }

        const ambientNodes = ambientNodesRef.current
        const sourceNode = msg.sourceNode ? ambientNodes.find(n => n.id === msg.sourceNode) : null
        const targetNode = msg.targetNode ? ambientNodes.find(n => n.id === msg.targetNode) : null
        const busNode = ambientNodes.find(n => n.type === 'bus')

        if (sourceNode && targetNode) {
          // Animate from source to target
          const midX = (sourceNode.x + targetNode.x) / 2
          const midY = (sourceNode.y + targetNode.y) / 2
          const dx = targetNode.x - sourceNode.x
          const dy = targetNode.y - sourceNode.y
          const perpX = -dy * 0.3
          const perpY = dx * 0.3

          particle.active = true
          particle.startX = sourceNode.x
          particle.startY = sourceNode.y
          particle.targetX = targetNode.x
          particle.targetY = targetNode.y
          particle.controlX = midX + perpX
          particle.controlY = midY + perpY
          particle.x = sourceNode.x
          particle.y = sourceNode.y
          particle.color = PARTICLE_COLORS[msg.protocol] || PARTICLE_COLORS.internal
          particle.progress = 0
          particle.startTime = Date.now()
          particle.trail = []
          particle.isRipple = false

          // Pulse source node
          sourceNode.targetRadius = 16
        } else if (sourceNode) {
          // Ripple from source
          particle.active = true
          particle.x = sourceNode.x
          particle.y = sourceNode.y
          particle.startX = sourceNode.x
          particle.startY = sourceNode.y
          particle.targetX = sourceNode.x
          particle.targetY = sourceNode.y
          particle.color = PARTICLE_COLORS[msg.protocol] || PARTICLE_COLORS.internal
          particle.progress = 0
          particle.startTime = Date.now()
          particle.trail = []
          particle.isRipple = true
          particle.rippleRadius = sourceNode.radius

          sourceNode.targetRadius = 16
        } else if (busNode) {
          // Ripple from bus
          particle.active = true
          particle.x = busNode.x
          particle.y = busNode.y
          particle.startX = busNode.x
          particle.startY = busNode.y
          particle.targetX = busNode.x
          particle.targetY = busNode.y
          particle.color = PARTICLE_COLORS[msg.protocol] || PARTICLE_COLORS.internal
          particle.progress = 0
          particle.startTime = Date.now()
          particle.trail = []
          particle.isRipple = true
          particle.rippleRadius = 30
        }
      }
    })
  }, [subscribe, messages, stats.messagesPerSecond])

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    let mounted = true

    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio
      canvas.height = canvas.clientHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const render = () => {
      if (!mounted) return
      const now = Date.now()
      const w = canvas.clientWidth
      const h = canvas.clientHeight

      // Clear with background
      ctx.fillStyle = BACKGROUND
      ctx.fillRect(0, 0, w, h)

      // Subtle radial gradient
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2)
      bgGrad.addColorStop(0, '#0a0a1a')
      bgGrad.addColorStop(1, BACKGROUND)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Draw nodes with breathing glow
      const ambientNodes = ambientNodesRef.current
      for (const node of ambientNodes) {
        // Breathing animation
        const breathOffset = Math.sin(now / 3000 * Math.PI * 2 + node.breathPhase) * 2
        const currentRadius = node.radius + breathOffset

        // Ease radius back to default
        if (node.targetRadius > node.radius) {
          node.targetRadius = node.radius + (node.targetRadius - node.radius) * 0.9
          if (node.targetRadius - node.radius < 0.5) node.targetRadius = node.radius
        }

        const drawRadius = Math.max(currentRadius, node.targetRadius)

        // Glow
        if (node.type === 'bus') {
          // Nebula glow for bus
          for (let i = 3; i >= 0; i--) {
            ctx.beginPath()
            ctx.arc(node.x, node.y, drawRadius + i * 10, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(148, 163, 184, ${0.03 - i * 0.005})`
            ctx.fill()
          }
          // Ring outline
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
          ctx.lineWidth = 1.5
          ctx.stroke()
        } else {
          // Solid glow for other nodes
          const nodeGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, drawRadius * 2)
          const baseColor = node.type === 'gateway' ? 'rgba(251, 146, 60,' : node.type === 'device' ? 'rgba(96, 165, 250,' : 'rgba(52, 211, 153,'
          nodeGrad.addColorStop(0, baseColor + '0.8)')
          nodeGrad.addColorStop(0.5, baseColor + '0.2)')
          nodeGrad.addColorStop(1, baseColor + '0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawRadius * 2, 0, Math.PI * 2)
          ctx.fillStyle = nodeGrad
          ctx.fill()

          // Core
          ctx.beginPath()
          ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2)
          ctx.fillStyle = baseColor + '0.6)'
          ctx.fill()
        }

        // Label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
        ctx.font = '10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(node.label, node.x, node.y + drawRadius + 14)
      }

      // Draw particles
      for (const particle of particlesRef.current) {
        if (!particle.active) continue

        const elapsed = now - particle.startTime
        if (elapsed > PARTICLE_LIFETIME) {
          particle.active = false
          continue
        }

        const t = elapsed / PARTICLE_LIFETIME
        const easeOut = 1 - Math.pow(1 - t, 3)

        if (particle.isRipple) {
          // Expanding ripple
          const radius = particle.rippleRadius + easeOut * 80
          const opacity = (1 - t) * 0.4
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
          ctx.strokeStyle = particle.color
          ctx.lineWidth = 1
          ctx.globalAlpha = opacity
          ctx.stroke()
          ctx.globalAlpha = 1
        } else {
          // Bezier curve particle
          particle.progress = easeOut
          const p = particle.progress
          const invP = 1 - p
          const newX = invP * invP * particle.startX + 2 * invP * p * particle.controlX + p * p * particle.targetX
          const newY = invP * invP * particle.startY + 2 * invP * p * particle.controlY + p * p * particle.targetY

          // Store trail
          particle.trail.push({ x: newX, y: newY })
          if (particle.trail.length > 5) particle.trail.shift()

          particle.x = newX
          particle.y = newY

          // Draw trail
          const trailOpacities = [0.05, 0.15, 0.3, 0.6, 1.0]
          for (let i = 0; i < particle.trail.length; i++) {
            const tp = particle.trail[i]
            const opacity = trailOpacities[Math.min(i, trailOpacities.length - 1)] * (1 - t * 0.5)
            ctx.beginPath()
            ctx.arc(tp.x, tp.y, 3 + (i / particle.trail.length) * 2, 0, Math.PI * 2)
            ctx.fillStyle = particle.color
            ctx.globalAlpha = opacity
            ctx.fill()
          }
          ctx.globalAlpha = 1
        }
      }

      // Minimal HUD
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'
      ctx.font = '10px ui-monospace, monospace'
      ctx.textAlign = 'left'
      const time = new Date().toLocaleTimeString('en-US', { hour12: false })
      ctx.fillText(`${time}`, 16, h - 16)

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)

    return () => {
      mounted = false
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // Empty state text
  const isEmpty = messages.current.length === 0

  return (
    <div className="relative flex-1 bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-mono text-slate-600/30">
            Waiting for messages...
          </span>
        </div>
      )}
    </div>
  )
}
