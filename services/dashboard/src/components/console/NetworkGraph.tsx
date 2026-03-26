'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useConsole, type GraphNode, type ConsoleMessage } from './ConsoleProvider'
import { ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react'

// D3 types (minimal, avoid full type import)
type D3Simulation = ReturnType<typeof import('d3-force').forceSimulation>
type D3Selection = ReturnType<typeof import('d3-selection').select>

const NODE_COLORS: Record<string, string> = {
  device: '#60a5fa',   // blue-400
  entity: '#34d399',   // emerald-400
  gateway: '#fb923c',  // orange-400
  bus: '#94a3b8',      // slate-400
}

const PROTOCOL_EDGE_COLORS: Record<string, string> = {
  osc: '#22d3ee',
  mqtt: '#34d399',
  ws: '#a78bfa',
  internal: '#94a3b8',
}

const NODE_RADIUS: Record<string, number> = {
  default: 8,
  pulse: 12,
  bus: 20,
}

export function NetworkGraph() {
  const { nodes, messages, subscribe, filters, setFilters } = useConsole()
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<D3Simulation | null>(null)
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const edgesRef = useRef<Array<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string; opacity: number; createdAt: number }>>([])
  const animFrameRef = useRef<number>(0)

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('console-graph-open') === 'true'
  })
  const [apiError, setApiError] = useState(false)

  const toggleOpen = useCallback(() => {
    const next = !isOpen
    setIsOpen(next)
    localStorage.setItem('console-graph-open', String(next))
  }, [isOpen])

  // Initialize D3 force simulation
  useEffect(() => {
    if (!isOpen || !svgRef.current || nodes.length === 0) return

    let mounted = true

    const initD3 = async () => {
      const d3Force = await import('d3-force')
      const d3Select = await import('d3-selection')

      if (!mounted || !svgRef.current) return

      const svg = d3Select.select(svgRef.current)
      const width = svgRef.current.clientWidth || 384
      const height = svgRef.current.clientHeight || 500

      // Clear existing
      svg.selectAll('*').remove()

      // Setup simulation
      const simNodes = nodes.map(n => ({
        ...n,
        fx: n.type === 'bus' ? width / 2 : undefined,
        fy: n.type === 'bus' ? height / 2 : undefined,
      }))

      const simulation = d3Force.forceSimulation(simNodes as any)
        .force('charge', d3Force.forceManyBody().strength(-150))
        .force('center', d3Force.forceCenter(width / 2, height / 2))
        .force('collision', d3Force.forceCollide().radius(25))
        .alphaDecay(0.05)

      simulationRef.current = simulation as any

      // Edge layer (below nodes)
      const edgeGroup = svg.append('g').attr('class', 'edges')

      // Node groups
      const nodeGroup = svg.append('g').attr('class', 'nodes')
      const nodeElements = nodeGroup
        .selectAll('g')
        .data(simNodes)
        .join('g')
        .attr('cursor', 'pointer')

      // Node circles
      nodeElements
        .append('circle')
        .attr('r', (d: any) => d.type === 'bus' ? NODE_RADIUS.bus : NODE_RADIUS.default)
        .attr('fill', (d: any) => d.type === 'bus' ? 'transparent' : NODE_COLORS[d.type] || NODE_COLORS.device)
        .attr('stroke', (d: any) => NODE_COLORS[d.type] || NODE_COLORS.device)
        .attr('stroke-width', (d: any) => d.type === 'bus' ? 2 : 0)
        .attr('opacity', 0.8)

      // Node labels
      nodeElements
        .append('text')
        .text((d: any) => d.label)
        .attr('text-anchor', 'middle')
        .attr('dy', (d: any) => (d.type === 'bus' ? NODE_RADIUS.bus : NODE_RADIUS.default) + 14)
        .attr('class', 'fill-slate-400')
        .attr('font-size', '10px')
        .attr('font-family', 'ui-monospace, monospace')

      // Click handler to filter by node
      nodeElements.on('click', (_event: any, d: any) => {
        if (d.type === 'bus') return
        setFilters(prev => ({
          ...prev,
          subjectPattern: d.label,
        }))
      })

      // Tooltip on hover
      nodeElements
        .append('title')
        .text((d: any) => `${d.label} (${d.type})`)

      // Tick handler — update positions via D3, not React state
      simulation.on('tick', () => {
        nodeElements.attr('transform', (d: any) => {
          positionsRef.current.set(d.id, { x: d.x, y: d.y })
          return `translate(${d.x},${d.y})`
        })
      })

      // Force-stop after 5 seconds
      setTimeout(() => {
        if (mounted && simulationRef.current) {
          (simulationRef.current as any).stop()
        }
      }, 5000)

      // Edge animation loop
      const animateEdges = () => {
        if (!mounted) return
        const now = Date.now()
        // Remove expired edges (0.5s lifetime)
        edgesRef.current = edgesRef.current.filter(e => now - e.createdAt < 500)

        // Clear and redraw edges
        edgeGroup.selectAll('*').remove()
        edgesRef.current.forEach(edge => {
          const age = now - edge.createdAt
          const opacity = Math.max(0, 1 - age / 500)
          edgeGroup
            .append('line')
            .attr('x1', edge.x1)
            .attr('y1', edge.y1)
            .attr('x2', edge.x2)
            .attr('y2', edge.y2)
            .attr('stroke', edge.color)
            .attr('stroke-width', 2)
            .attr('opacity', opacity * 0.7)
        })

        // Bus ripples
        edgesRef.current.filter(e => e.x1 === e.x2 && e.y1 === e.y2).forEach(edge => {
          const age = now - edge.createdAt
          const radius = NODE_RADIUS.bus + (age / 500) * 80
          const opacity = Math.max(0, 1 - age / 500) * 0.4
          edgeGroup
            .append('circle')
            .attr('cx', edge.x1)
            .attr('cy', edge.y1)
            .attr('r', radius)
            .attr('fill', 'none')
            .attr('stroke', edge.color)
            .attr('stroke-width', 1)
            .attr('opacity', opacity)
        })

        animFrameRef.current = requestAnimationFrame(animateEdges)
      }
      animFrameRef.current = requestAnimationFrame(animateEdges)
    }

    initD3().catch(() => setApiError(true))

    return () => {
      mounted = false
      if (simulationRef.current) (simulationRef.current as any).stop()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [isOpen, nodes, setFilters])

  // Process new messages for edge animations
  useEffect(() => {
    return subscribe(() => {
      const msgs = messages.current
      if (msgs.length === 0) return
      const latest = msgs[msgs.length - 1]
      if (!latest || latest.isDivider || latest.isPauseSummary) return

      const busPos = positionsRef.current.get('bus') || { x: 192, y: 250 }
      const sourcePos = latest.sourceNode ? positionsRef.current.get(latest.sourceNode) : null
      const targetPos = latest.targetNode ? positionsRef.current.get(latest.targetNode) : null
      const color = PROTOCOL_EDGE_COLORS[latest.protocol] || PROTOCOL_EDGE_COLORS.internal

      if (sourcePos && targetPos) {
        edgesRef.current.push({
          id: latest.id,
          x1: sourcePos.x, y1: sourcePos.y,
          x2: targetPos.x, y2: targetPos.y,
          color, opacity: 1, createdAt: Date.now(),
        })
      } else if (sourcePos) {
        // Pulse from source
        edgesRef.current.push({
          id: latest.id,
          x1: sourcePos.x, y1: sourcePos.y,
          x2: sourcePos.x, y2: sourcePos.y,
          color, opacity: 1, createdAt: Date.now(),
        })
      } else {
        // Ripple from bus
        edgesRef.current.push({
          id: latest.id,
          x1: busPos.x, y1: busPos.y,
          x2: busPos.x, y2: busPos.y,
          color, opacity: 1, createdAt: Date.now(),
        })
      }
    })
  }, [subscribe, messages])

  // Collapsed state — just show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={toggleOpen}
        className="shrink-0 flex items-center justify-center w-8 bg-slate-800/50 border-l border-slate-700 hover:bg-slate-800 transition-colors"
        title="Open network graph"
      >
        <ChevronLeft className="w-4 h-4 text-slate-500" />
      </button>
    )
  }

  return (
    <div className="shrink-0 w-96 border-l border-slate-700 flex flex-col bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <span className="text-xs font-medium text-slate-400">Network Graph</span>
        <button onClick={toggleOpen} className="p-1 hover:bg-slate-800 rounded transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {/* Graph */}
      {nodes.length <= 1 && !apiError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 px-4">
          <span className="text-xs text-center">No devices registered</span>
          <span className="text-xs text-slate-600 mt-1 text-center">
            Register devices to see the network topology
          </span>
        </div>
      ) : apiError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 px-4 gap-2">
          <span className="text-xs">Could not load devices</span>
          <button
            onClick={() => { setApiError(false) }}
            className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      ) : (
        <svg ref={svgRef} className="flex-1 w-full" />
      )}
    </div>
  )
}
