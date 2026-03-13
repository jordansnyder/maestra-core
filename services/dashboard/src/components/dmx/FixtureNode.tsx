'use client'

import { useState } from 'react'
import { DMXFixture, DMXNode } from '@/lib/types'

interface FixtureNodeProps {
  fixture: DMXFixture
  node?: DMXNode
  selected: boolean
  dragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onClick: () => void
}

const UNIVERSE_COLORS = [
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#fb923c', // orange-400
  '#f472b6', // pink-400
  '#38bdf8', // sky-400
  '#4ade80', // green-400
  '#fbbf24', // amber-400
]

export function FixtureNode({
  fixture,
  node,
  selected,
  dragging,
  onMouseDown,
  onContextMenu,
  onClick,
}: FixtureNodeProps) {
  const [hovered, setHovered] = useState(false)
  const universeIndex = fixture.universe % UNIVERSE_COLORS.length
  const color = UNIVERSE_COLORS[universeIndex]
  const shortName = fixture.label || fixture.name

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute flex flex-col items-center select-none"
      style={{
        left: fixture.position_x - 44,
        top: fixture.position_y - 44,
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: dragging ? 100 : selected ? 50 : 10,
      }}
    >
      {/* Outer glow ring when selected */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 88,
          height: 88,
          boxShadow: selected
            ? `0 0 0 3px ${color}, 0 0 20px ${color}66`
            : hovered
            ? `0 0 0 2px ${color}99`
            : `0 0 0 1.5px ${color}55`,
          background: selected
            ? `radial-gradient(circle at 35% 35%, ${color}30, #1e293b)`
            : hovered
            ? `radial-gradient(circle at 35% 35%, ${color}22, #131d2e)`
            : `radial-gradient(circle at 35% 35%, ${color}18, #0f172a)`,
          transition: 'box-shadow 0.15s, background 0.15s',
        }}
      >
        {/* Inner circle */}
        <div
          className="absolute inset-2 rounded-full flex flex-col items-center justify-center gap-0"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${color}22, #0f172a99)`,
            border: `1.5px solid ${color}44`,
          }}
        >
          {/* Universe badge */}
          <span
            className="text-[9px] font-mono font-bold uppercase tracking-widest"
            style={{ color }}
          >
            U{fixture.universe}
          </span>

          {/* Fixture name */}
          <span
            className="text-[10px] font-semibold text-white text-center leading-tight px-1"
            style={{ maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={shortName}
          >
            {shortName}
          </span>

          {/* DMX address */}
          <span className="text-[9px] font-mono text-slate-400">
            #{fixture.start_channel}
          </span>
        </div>
      </div>

      {/* Entity link indicator — bottom-right of ring */}
      <div
        title={fixture.entity_id ? 'Linked to entity' : 'No entity linked'}
        className="absolute rounded-full border-2 border-slate-950"
        style={{
          width: 10,
          height: 10,
          bottom: node ? 18 : 2,
          right: 4,
          background: fixture.entity_id ? '#22c55e' : '#ef4444',
        }}
      />

      {/* Label below */}
      {node && (
        <span className="mt-1 text-[9px] text-slate-600 font-mono max-w-[88px] truncate text-center">
          {node.name}
        </span>
      )}
    </div>
  )
}
