'use client'

import { useState } from 'react'
import { DMXFixture } from '@/lib/types'

interface FixtureNodeProps {
  fixture: DMXFixture
  diameter: number
  universeColor: string
  selected: boolean
  dragging: boolean
  isActive: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onClick: () => void
}

export function FixtureNode({
  fixture,
  diameter,
  universeColor,
  selected,
  dragging,
  isActive,
  onMouseDown,
  onContextMenu,
  onClick,
}: FixtureNodeProps) {
  const [hovered, setHovered] = useState(false)
  const color = universeColor
  const displayName = fixture.label || fixture.name

  const radius = Math.round(diameter / 2)
  const dotSize = Math.round(diameter * 0.24)
  const dotOffset = Math.round(-diameter * 0.07)

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute flex items-center select-none"
      style={{
        left: fixture.position_x - radius,
        top: fixture.position_y - radius,
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: dragging ? 100 : selected ? 50 : 10,
      }}
    >
      {/* Circle */}
      <div
        className="relative rounded-full shrink-0"
        style={{
          width: diameter,
          height: diameter,
          boxShadow: selected
            ? `0 0 0 2px ${color}, 0 0 12px ${color}88`
            : hovered
            ? `0 0 0 1.5px ${color}cc`
            : `0 0 0 1px ${color}55`,
          background: selected
            ? `radial-gradient(circle at 35% 35%, ${color}55, #1e293b)`
            : hovered
            ? `radial-gradient(circle at 35% 35%, ${color}33, #131d2e)`
            : `radial-gradient(circle at 35% 35%, ${color}22, #0f172a)`,
          transition: 'box-shadow 0.1s, background 0.1s',
        }}
      >
        {/* DMX activity ring — bottom-right corner */}
        <div
          title={isActive ? 'DMX data flowing' : 'No DMX activity'}
          className="absolute rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            bottom: dotOffset,
            right: dotOffset,
            background: isActive ? '#15803d' : '#0d1117',
            border: isActive ? '1.5px solid #4ade80' : '1.5px solid #334155',
            boxShadow: isActive ? '0 0 6px #4ade80cc' : 'none',
            transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
          }}
        />

        {/* Universe color inner circle */}
        <div
          className="absolute rounded-full"
          style={{
            width: Math.round(diameter * 0.38),
            height: Math.round(diameter * 0.38),
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `${color}55`,
            boxShadow: `0 0 0 1px ${color}33`,
          }}
        />

      </div>

      {/* Info — to the right so nodes only consume their circle height vertically */}
      <div className="ml-2 leading-none min-w-0">
        <div
          className="text-[9px] font-medium leading-none truncate"
          style={{
            color: selected ? '#f1f5f9' : hovered ? '#cbd5e1' : '#64748b',
            maxWidth: 80,
          }}
          title={displayName}
        >
          {displayName}
        </div>
        <div
          className="text-[8px] font-mono leading-none mt-[3px]"
          style={{ color: `${color}bb` }}
        >
          U{fixture.universe}·{fixture.start_channel}
        </div>
      </div>
    </div>
  )
}
