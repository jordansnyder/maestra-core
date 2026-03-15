'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { DMXFixture, DMXNode, FixturePositionUpdate } from '@/lib/types'
import { UNIVERSE_PALETTE } from '@/lib/dmx-constants'
import { useDMXActivity } from '@/hooks/useDMXActivity'
import { SlidersHorizontal } from '@/components/icons'
import { FixtureNode } from './FixtureNode'
import { ContextMenu } from './ContextMenu'

interface DMXCanvasProps {
  fixtures: DMXFixture[]
  nodes: DMXNode[]
  nodeSize: number
  selectedIds: Set<string>
  multiSelectGroup: Set<string>
  onSelect: (id: string | null, shiftKey?: boolean) => void
  onEdit: (fixture: DMXFixture) => void
  onCopy: (fixture: DMXFixture) => void
  onDelete: (id: string) => void
  onAdjustDMX: () => void
  onPositionsChange: (positions: FixturePositionUpdate[]) => void
}

interface CtxMenu {
  x: number
  y: number
  fixtureId: string
}

function getUniverseColor(nodes: DMXNode[], fixture: DMXFixture): string {
  const node = nodes.find((n) => n.id === fixture.node_id)
  const uCfg = node?.universes.find((u) => u.id === fixture.universe)
  return uCfg?.color ?? UNIVERSE_PALETTE[fixture.universe % UNIVERSE_PALETTE.length]
}

export function DMXCanvas({
  fixtures,
  nodes,
  nodeSize,
  selectedIds,
  multiSelectGroup,
  onSelect,
  onEdit,
  onCopy,
  onDelete,
  onAdjustDMX,
  onPositionsChange,
}: DMXCanvasProps) {
  const activeEntityIds = useDMXActivity()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  const getPos = useCallback((fixture: DMXFixture) => {
    return positions[fixture.id] ?? { x: fixture.position_x, y: fixture.position_y }
  }, [positions])

  // Use refs for drag state so window-level handlers always see current values
  const draggingRef = useRef<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  // Window-level move/up handlers — attached only while dragging so they always
  // fire even when the mouse leaves the canvas div
  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left - dragOffsetRef.current.x
      const y = e.clientY - rect.top - dragOffsetRef.current.y
      setPositions((p) => ({ ...p, [draggingRef.current!]: { x, y } }))
    }

    const onUp = () => {
      const id = draggingRef.current
      if (id) {
        const pos = positionsRef.current[id]
        if (pos) {
          onPositionsChange([{ id, position_x: pos.x, position_y: pos.y }])
        }
      }
      draggingRef.current = null
      setDragging(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onPositionsChange])

  const handleMouseDown = (e: React.MouseEvent, fixtureId: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const fixture = fixtures.find((f) => f.id === fixtureId)!
    const pos = getPos(fixture)
    const offset = {
      x: e.clientX - rect.left - pos.x,
      y: e.clientY - rect.top - pos.y,
    }
    dragOffsetRef.current = offset
    draggingRef.current = fixtureId
    setDragging(fixtureId)
  }

  const handleContextMenu = (e: React.MouseEvent, fixtureId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Suppress context menu when multiple fixtures are selected
    if (selectedIds.size > 1) return
    setCtxMenu({ x: e.clientX, y: e.clientY, fixtureId })
    onSelect(fixtureId, false)
  }

  // Group fixtures by (node_id, universe) for noodle drawing
  // useMemo on fixtures/nodes so group membership only recomputes on data change
  // Actual positions are computed at render via getPos
  const universeGroups = useMemo(() => {
    const groups = new Map<string, { fixtures: DMXFixture[]; color: string }>()
    for (const f of fixtures) {
      const key = `${f.node_id}:${f.universe}`
      if (!groups.has(key)) {
        groups.set(key, { fixtures: [], color: getUniverseColor(nodes, f) })
      }
      groups.get(key)!.fixtures.push(f)
    }
    // Preserve fixtures array order — it already reflects sidebar sort_order
    return groups
  }, [fixtures, nodes])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ cursor: dragging ? 'grabbing' : 'default', background: '#0d1117' }}
      onClick={() => onSelect(null)}
    >
      {/* Grid background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <pattern id="dmx-grid-small" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#ffffff05" strokeWidth="0.5" />
          </pattern>
          <pattern id="dmx-grid-large" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="url(#dmx-grid-small)" />
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dmx-grid-large)" />
      </svg>

      {/* Noodle SVG — daisy-chain lines per universe, drawn above grid, below nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 6 }}>
        {Array.from(universeGroups.entries()).map(([key, { fixtures: group, color }]) => {
          if (group.length < 2) return null
          const points = group.map((f) => {
            const pos = getPos(f)
            return `${pos.x},${pos.y}`
          }).join(' ')
          return (
            <polyline
              key={key}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeOpacity="0.3"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>

      {/* Adjust DMX — centered top overlay, visible when any fixture is selected */}
      {selectedIds.size > 0 && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto"
          style={{ zIndex: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onAdjustDMX}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-900/70 border border-blue-700/60 hover:bg-blue-800/80 text-blue-200 backdrop-blur-sm transition-colors shadow-lg"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Adjust DMX
          </button>
        </div>
      )}

      {/* Empty state */}
      {fixtures.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 7 }}>
          <div className="text-slate-700 text-sm font-medium">No fixtures yet</div>
          <div className="text-slate-800 text-xs mt-1">Click &quot;Add Fixture&quot; to place one on the canvas</div>
        </div>
      )}

      {/* Node badges — computed from fixture positions, highlight when child is selected */}
      {nodes.map((node) => {
        const nodeFixtures = fixtures.filter((f) => f.node_id === node.id)
        if (nodeFixtures.length === 0) return null
        const isParentOfSelected = nodeFixtures.some((f) => selectedIds.has(f.id))
        const livePositions = nodeFixtures.map((f) => getPos(f))
        const cx = livePositions.reduce((s, p) => s + p.x, 0) / livePositions.length
        const minY = Math.min(...livePositions.map((p) => p.y))
        const nodeColor = node.universes[0]?.color ?? UNIVERSE_PALETTE[0]
        return (
          <div
            key={node.id}
            className="absolute pointer-events-none select-none"
            style={{ left: Math.round(cx - 56), top: Math.round(minY - nodeSize / 2 - 18), zIndex: 7, transform: 'translateY(-100%)' }}
          >
            <div
              className="px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap transition-all duration-150"
              style={{
                background: isParentOfSelected ? `${nodeColor}22` : '#1e293b99',
                border: `1px solid ${isParentOfSelected ? nodeColor : '#1e293b'}`,
                color: isParentOfSelected ? nodeColor : '#475569',
                boxShadow: isParentOfSelected ? `0 0 10px ${nodeColor}44` : 'none',
              }}
            >
              {node.name} · {node.ip_address}
            </div>
          </div>
        )
      })}

      {/* Fixture nodes */}
      {fixtures.map((fixture) => {
        const pos = getPos(fixture)
        const displayFixture = { ...fixture, position_x: pos.x, position_y: pos.y }
        return (
          <FixtureNode
            key={fixture.id}
            fixture={displayFixture}
            diameter={nodeSize}
            universeColor={getUniverseColor(nodes, fixture)}
            selected={selectedIds.has(fixture.id)}
            multiSelectable={multiSelectGroup.has(fixture.id) && !selectedIds.has(fixture.id)}
            dragging={dragging === fixture.id}
            isActive={!!fixture.entity_id && activeEntityIds.has(fixture.entity_id)}
            onMouseDown={(e) => handleMouseDown(e, fixture.id)}
            onContextMenu={(e) => handleContextMenu(e, fixture.id)}
            onClick={(shiftKey) => onSelect(fixture.id, shiftKey)}
          />
        )
      })}

      {/* Right-click context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => {
            const fixture = fixtures.find((f) => f.id === ctxMenu.fixtureId)
            if (fixture) onEdit(fixture)
          }}
          onCopy={() => {
            const fixture = fixtures.find((f) => f.id === ctxMenu.fixtureId)
            if (fixture) onCopy(fixture)
          }}
          onDelete={() => onDelete(ctxMenu.fixtureId)}
          onAdjustDMX={onAdjustDMX}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
