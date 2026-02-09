'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Route, RoutingDevice, DEVICES, SIGNAL_TYPES, getSignalType } from './types'

interface NodeGraphViewProps {
  routes: Route[]
  onAddRoute: (route: Route) => void
  onRemoveRoute: (route: Route) => void
}

interface PortRef {
  deviceId: string
  portName: string
}

export function NodeGraphView({ routes, onAddRoute, onRemoveRoute }: NodeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [connecting, setConnecting] = useState<PortRef | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredPort, setHoveredPort] = useState<PortRef | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [zoom] = useState(1)

  useEffect(() => {
    const cols: Record<string, number> = { camera: 0, audio: 0, sync: 0, switcher: 1, ai: 1, recorder: 1, monitor: 2, storage: 2, output: 2 }
    const colCounts: Record<number, number> = {}
    const init: Record<string, { x: number; y: number }> = {}
    DEVICES.forEach((d) => {
      const col = cols[d.type] ?? 1
      colCounts[col] = (colCounts[col] || 0) + 1
      init[d.id] = { x: 80 + col * 380, y: 40 + (colCounts[col] - 1) * 160 }
    })
    setPositions(init)
  }, [])

  const getPortPos = useCallback((deviceId: string, portName: string, isOutput: boolean) => {
    const pos = positions[deviceId]
    if (!pos) return { x: 0, y: 0 }
    const device = DEVICES.find((d) => d.id === deviceId)
    if (!device) return { x: 0, y: 0 }
    const ports = isOutput ? device.outputs : device.inputs
    const idx = ports.indexOf(portName)
    const nodeW = 220
    const portStartY = 42
    const portSpacing = 20
    return {
      x: pos.x + (isOutput ? nodeW : 0),
      y: pos.y + portStartY + idx * portSpacing,
    }
  }, [positions])

  const handleMouseDown = (e: React.MouseEvent, deviceId: string) => {
    if ((e.target as HTMLElement).closest('.port-circle')) return
    const rect = containerRef.current!.getBoundingClientRect()
    const pos = positions[deviceId]
    setDragOffset({ x: (e.clientX - rect.left) / zoom - pos.x, y: (e.clientY - rect.top) / zoom - pos.y })
    setDragging(deviceId)
    setSelectedDevice(deviceId)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / zoom
    const my = (e.clientY - rect.top) / zoom
    setMousePos({ x: mx, y: my })
    if (dragging) {
      setPositions((p) => ({ ...p, [dragging]: { x: mx - dragOffset.x, y: my - dragOffset.y } }))
    }
  }

  const handleMouseUp = () => {
    setDragging(null)
    if (connecting && hoveredPort) {
      onAddRoute({ from: connecting.deviceId, fromPort: connecting.portName, to: hoveredPort.deviceId, toPort: hoveredPort.portName })
    }
    setConnecting(null)
  }

  const startConnect = (e: React.MouseEvent, deviceId: string, portName: string) => {
    e.stopPropagation()
    setConnecting({ deviceId, portName })
  }

  const renderCable = (x1: number, y1: number, x2: number, y2: number, signalType: string, key: string, isTemp?: boolean) => {
    const sig = SIGNAL_TYPES[signalType] || SIGNAL_TYPES.data
    const dx = Math.abs(x2 - x1) * 0.5
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
    return (
      <g key={key}>
        <path d={path} stroke={sig.color} strokeWidth={isTemp ? 2 : 3} fill="none" opacity={isTemp ? 0.5 : 0.85}
          strokeDasharray={isTemp ? '6 4' : 'none'} style={{ filter: isTemp ? 'none' : `drop-shadow(0 0 4px ${sig.color}55)` }} />
        {!isTemp && (
          <path d={path} stroke={sig.color} strokeWidth={1} fill="none" opacity={0.3} />
        )}
      </g>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ cursor: dragging ? 'grabbing' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Signal type legend */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {Object.entries(SIGNAL_TYPES).map(([k, v]) => (
          <span
            key={k}
            className="text-[11px] font-mono rounded px-2 py-0.5"
            style={{ color: v.color, background: `${v.color}15`, border: `1px solid ${v.color}30` }}
          >
            ● {v.label}
          </span>
        ))}
      </div>

      {/* SVG cables layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff06" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {routes.map((r, i) => {
          const from = getPortPos(r.from, r.fromPort, true)
          const to = getPortPos(r.to, r.toPort, false)
          const sig = getSignalType(r.fromPort)
          return renderCable(from.x, from.y, to.x, to.y, sig, `route-${i}`)
        })}

        {connecting && (() => {
          const fromPos = getPortPos(connecting.deviceId, connecting.portName, true)
          return renderCable(fromPos.x, fromPos.y, mousePos.x, mousePos.y, getSignalType(connecting.portName), 'temp-cable', true)
        })()}
      </svg>

      {/* Device nodes */}
      {DEVICES.map((device) => {
        const pos = positions[device.id]
        if (!pos) return null
        const isSelected = selectedDevice === device.id
        const maxPorts = Math.max(device.inputs.length, device.outputs.length)
        const nodeH = 42 + maxPorts * 20 + 12

        return (
          <div
            key={device.id}
            onMouseDown={(e) => handleMouseDown(e, device.id)}
            className="absolute w-[220px] rounded-lg select-none transition-[box-shadow,border-color] duration-200"
            style={{
              left: pos.x,
              top: pos.y,
              background: isSelected ? '#1a1a2e' : '#12121f',
              border: `1px solid ${isSelected ? device.color : '#2a2a3a'}`,
              cursor: dragging === device.id ? 'grabbing' : 'grab',
              boxShadow: isSelected ? `0 0 20px ${device.color}20, 0 4px 12px #00000060` : '0 2px 8px #00000040',
              zIndex: dragging === device.id ? 100 : isSelected ? 50 : 10,
            }}
          >
            {/* Device header */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderBottom: `1px solid ${device.color}25` }}
            >
              <span className="text-base">{device.icon}</span>
              <div>
                <div className="text-xs font-semibold text-slate-200 font-mono tracking-tight">{device.name}</div>
                <div className="text-[9px] uppercase tracking-[1.5px] font-mono" style={{ color: device.color }}>{device.type}</div>
              </div>
            </div>

            {/* Ports */}
            <div className="flex justify-between py-1.5" style={{ minHeight: nodeH - 42 }}>
              {/* Input ports */}
              <div className="flex flex-col gap-1">
                {device.inputs.map((inp) => {
                  const sig = getSignalType(inp)
                  const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portName === inp
                  return (
                    <div
                      key={inp}
                      className="flex items-center gap-1.5 relative -left-1.5"
                      onMouseEnter={() => setHoveredPort({ deviceId: device.id, portName: inp })}
                      onMouseLeave={() => setHoveredPort(null)}
                    >
                      <div
                        className="port-circle w-2.5 h-2.5 rounded-full cursor-crosshair transition-all duration-150"
                        style={{
                          background: isHovered ? SIGNAL_TYPES[sig].color : `${SIGNAL_TYPES[sig].color}40`,
                          border: `2px solid ${SIGNAL_TYPES[sig].color}`,
                          boxShadow: isHovered ? `0 0 8px ${SIGNAL_TYPES[sig].color}` : 'none',
                        }}
                      />
                      <span className="text-[10px] text-slate-500 font-mono">{inp}</span>
                    </div>
                  )
                })}
              </div>
              {/* Output ports */}
              <div className="flex flex-col gap-1 items-end">
                {device.outputs.map((out) => {
                  const sig = getSignalType(out)
                  const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portName === out
                  return (
                    <div
                      key={out}
                      className="flex items-center gap-1.5 relative -right-1.5 cursor-crosshair"
                      onMouseDown={(e) => startConnect(e, device.id, out)}
                      onMouseEnter={() => setHoveredPort({ deviceId: device.id, portName: out })}
                      onMouseLeave={() => setHoveredPort(null)}
                    >
                      <span className="text-[10px] text-slate-500 font-mono">{out}</span>
                      <div
                        className="port-circle w-2.5 h-2.5 rounded-full transition-all duration-150"
                        style={{
                          background: isHovered ? SIGNAL_TYPES[sig].color : `${SIGNAL_TYPES[sig].color}40`,
                          border: `2px solid ${SIGNAL_TYPES[sig].color}`,
                          boxShadow: isHovered ? `0 0 8px ${SIGNAL_TYPES[sig].color}` : 'none',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
