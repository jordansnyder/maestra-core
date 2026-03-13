'use client'

import { useState, useRef, useCallback } from 'react'
import { DMXFixture, DMXNode, FixturePositionUpdate } from '@/lib/types'
import { FixtureNode } from './FixtureNode'
import { ContextMenu } from './ContextMenu'

interface DMXCanvasProps {
  fixtures: DMXFixture[]
  nodes: DMXNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEdit: (fixture: DMXFixture) => void
  onCopy: (fixture: DMXFixture) => void
  onDelete: (id: string) => void
  onPositionsChange: (positions: FixturePositionUpdate[]) => void
}

interface CtxMenu {
  x: number
  y: number
  fixtureId: string
}

export function DMXCanvas({
  fixtures,
  nodes,
  selectedId,
  onSelect,
  onEdit,
  onCopy,
  onDelete,
  onPositionsChange,
}: DMXCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  const getPos = useCallback((fixture: DMXFixture) => {
    return positions[fixture.id] ?? { x: fixture.position_x, y: fixture.position_y }
  }, [positions])

  const handleMouseDown = (e: React.MouseEvent, fixtureId: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const fixture = fixtures.find((f) => f.id === fixtureId)!
    const pos = getPos(fixture)
    setDragOffset({
      x: e.clientX - rect.left - pos.x,
      y: e.clientY - rect.top - pos.y,
    })
    setDragging(fixtureId)
    onSelect(fixtureId)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const rect = containerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left - dragOffset.x
    const y = e.clientY - rect.top - dragOffset.y
    setPositions((p) => ({ ...p, [dragging]: { x, y } }))
  }

  const handleMouseUp = () => {
    if (dragging) {
      const pos = positions[dragging]
      if (pos) {
        onPositionsChange([{ id: dragging, position_x: pos.x, position_y: pos.y }])
      }
    }
    setDragging(null)
  }

  const handleContextMenu = (e: React.MouseEvent, fixtureId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, fixtureId })
    onSelect(fixtureId)
  }

  const handleCanvasClick = () => {
    onSelect(null)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ cursor: dragging ? 'grabbing' : 'default', background: '#0d1117' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* CSS grid overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="dmx-grid-small" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#ffffff05" strokeWidth="0.5" />
          </pattern>
          <pattern id="dmx-grid-large" width="120" height="120" patternUnits="userSpaceOnUse">
            <rect width="120" height="120" fill="url(#dmx-grid-small)" />
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="#ffffff08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dmx-grid-large)" />
      </svg>

      {/* Empty state */}
      {fixtures.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-slate-700 text-sm font-medium">No fixtures yet</div>
          <div className="text-slate-800 text-xs mt-1">Click &quot;Add Fixture&quot; to place one on the canvas</div>
        </div>
      )}

      {/* Fixture nodes */}
      {fixtures.map((fixture) => {
        const node = nodes.find((n) => n.id === fixture.node_id)
        const pos = getPos(fixture)
        const displayFixture = { ...fixture, position_x: pos.x, position_y: pos.y }
        return (
          <FixtureNode
            key={fixture.id}
            fixture={displayFixture}
            node={node}
            selected={selectedId === fixture.id}
            dragging={dragging === fixture.id}
            onMouseDown={(e) => handleMouseDown(e, fixture.id)}
            onContextMenu={(e) => handleContextMenu(e, fixture.id)}
            onClick={() => onSelect(fixture.id)}
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
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
