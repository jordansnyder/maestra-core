'use client'

import { useMemo, useState } from 'react'
import { DMXFixture } from '@/lib/types'
import { EntityLiveState } from '@/hooks/useDMXActivity'

export type GroupMode = 'in-group' | 'eligible' | 'ineligible'

interface FixtureNodeProps {
  fixture: DMXFixture
  diameter: number
  universeColor: string
  groupColor?: string
  groupMode?: GroupMode
  selected: boolean
  multiSelectable: boolean
  dragging: boolean
  isActive: boolean
  liveState?: EntityLiveState
  onMouseDown: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onClick: (shiftKey: boolean) => void
  onDoubleClick?: () => void
}

const DIMMER_RE = /dimmer|intensity|master|brightness/i
const RED_RE = /red/i
const GREEN_RE = /green/i
const BLUE_RE = /blue/i
const PAN_RE = /^pan|_pan/i
const TILT_RE = /^tilt|_tilt/i

/** Normalize a channel value to 0–1 (values > 1 are legacy 0–255 DMX ints). */
function norm(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null
  const n = v > 1 ? v / 255 : v
  return Math.min(1, Math.max(0, n))
}

interface LiveRender {
  /** CSS color of the fixture's current output (hue only, not dimmed). */
  color: string
  /** 0–1 overall output level driving fill alpha and glow size. */
  intensity: number
  panOffset: number
  tiltOffset: number
}

/**
 * Derive the fixture's live look from its entity state. Channel roles are
 * matched by name against the channel_map keys (falling back to the state
 * keys for fixtures without a map). Returns null when there is no usable
 * live data, in which case the static universe styling renders.
 */
function computeLiveRender(
  liveState: EntityLiveState | undefined,
  channelMap: Record<string, unknown> | undefined,
): LiveRender | null {
  if (!liveState) return null
  const mapKeys = Object.keys(channelMap ?? {})
  const keys = mapKeys.length > 0 ? mapKeys.filter((k) => k in liveState) : Object.keys(liveState)
  if (keys.length === 0) return null

  const valueOf = (re: RegExp): number | null => {
    const key = keys.find((k) => re.test(k))
    return key ? norm(liveState[key]) : null
  }

  const r = valueOf(RED_RE)
  const g = valueOf(GREEN_RE)
  const b = valueOf(BLUE_RE)
  const dimmer = valueOf(DIMMER_RE)
  const pan = valueOf(PAN_RE)
  const tilt = valueOf(TILT_RE)

  const hasColor = r !== null || g !== null || b !== null
  const colorMax = Math.max(r ?? 0, g ?? 0, b ?? 0)

  let intensity: number | null
  if (dimmer !== null) {
    // Color mixing without a lit dimmer still previews faintly at zero
    intensity = hasColor ? dimmer * Math.max(colorMax, 0.15) : dimmer
  } else if (hasColor) {
    intensity = colorMax
  } else {
    const numeric = keys.map((k) => norm(liveState[k])).filter((v): v is number => v !== null)
    intensity = numeric.length > 0 ? Math.max(...numeric) : null
  }
  if (intensity === null) return null

  const color = hasColor
    ? `rgb(${Math.round((r ?? 0) * 255)}, ${Math.round((g ?? 0) * 255)}, ${Math.round((b ?? 0) * 255)})`
    : 'rgb(255, 214, 150)' // plain dimmers render as warm tungsten

  return {
    color,
    intensity,
    panOffset: pan !== null ? pan - 0.5 : 0,
    tiltOffset: tilt !== null ? tilt - 0.5 : 0,
  }
}

export function FixtureNode({
  fixture,
  diameter,
  universeColor,
  groupColor,
  groupMode,
  selected,
  multiSelectable,
  dragging,
  isActive,
  liveState,
  onMouseDown,
  onContextMenu,
  onClick,
  onDoubleClick,
}: FixtureNodeProps) {
  const [hovered, setHovered] = useState(false)
  const color = universeColor
  const displayName = fixture.name
  const shortId = fixture.id.replace(/-/g, '').slice(0, 7)

  const radius = Math.round(diameter / 2)
  const dotSize = Math.round(diameter * 0.24)
  const dotOffset = Math.round(-diameter * 0.07)

  const live = useMemo(
    () => computeLiveRender(liveState, fixture.channel_map),
    [liveState, fixture.channel_map],
  )
  const lit = live !== null && live.intensity > 0.02 && groupMode !== 'ineligible'
  const liveRgba = (alpha: number) =>
    live!.color.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(2)})`)
  const liveGlow = lit
    ? `, 0 0 ${Math.round(6 + 22 * live!.intensity)}px ${liveRgba(0.25 + 0.6 * live!.intensity)}`
    : ''
  const liveFill = lit
    ? `radial-gradient(circle at 35% 35%, ${liveRgba(0.3 + 0.6 * live!.intensity)}, #0f172a)`
    : null

  return (
    <div
      onMouseDown={groupMode === 'ineligible' ? undefined : onMouseDown}
      onContextMenu={onContextMenu}
      onClick={(e) => { e.stopPropagation(); onClick(e.shiftKey) }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute flex items-center select-none transition-opacity duration-150"
      style={{
        left: fixture.position_x - radius,
        top: fixture.position_y - radius,
        cursor: groupMode === 'ineligible' ? 'not-allowed' : dragging ? 'grabbing' : 'grab',
        zIndex: dragging ? 100 : selected ? 50 : 10,
        opacity: groupMode === 'ineligible' ? 0.3 : 1,
      }}
    >
      {/* Circle */}
      <div
        className="relative rounded-full shrink-0"
        style={{
          width: diameter,
          height: diameter,
          boxShadow: (groupMode === 'in-group'
            ? `0 0 0 2.5px ${groupColor ?? color}, 0 0 14px ${groupColor ?? color}99`
            : groupMode === 'eligible'
            ? `0 0 0 1.5px ${color}44`
            : selected
            ? `0 0 0 2px ${color}, 0 0 12px ${color}88`
            : multiSelectable
            ? `0 0 0 1.5px ${color}66`
            : hovered
            ? `0 0 0 1.5px ${color}cc`
            : `0 0 0 1px ${color}55`) + liveGlow,
          background: liveFill ?? (groupMode === 'in-group'
            ? `radial-gradient(circle at 35% 35%, ${groupColor ?? color}44, #1a2535)`
            : groupMode === 'eligible'
            ? `radial-gradient(circle at 35% 35%, ${color}15, #0d1117)`
            : selected
            ? `radial-gradient(circle at 35% 35%, ${color}55, #1e293b)`
            : multiSelectable
            ? `radial-gradient(circle at 35% 35%, ${color}2a, #131d2e)`
            : hovered
            ? `radial-gradient(circle at 35% 35%, ${color}33, #131d2e)`
            : `radial-gradient(circle at 35% 35%, ${color}22, #0f172a)`),
          transition: 'box-shadow 0.15s, background 0.15s',
        }}
      >
        {/* Group eligible dashed ring — shift-click hint */}
        {groupMode === 'eligible' && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: diameter + 8,
              height: diameter + 8,
              top: -4,
              left: -4,
              border: `1.5px dashed ${color}55`,
              animation: hovered ? undefined : undefined,
            }}
          />
        )}

        {/* Multi-selectable dashed ring — centered on the circle */}
        {multiSelectable && !selected && !groupMode && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: diameter + 8,
              height: diameter + 8,
              top: -4,
              left: -4,
              border: `1.5px dashed ${color}88`,
            }}
          />
        )}

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

        {/* Group color dot — top-left corner */}
        {groupColor && (
          <div
            title="Group"
            className="absolute rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              top: dotOffset,
              left: dotOffset,
              background: groupColor,
              border: `1.5px solid ${groupColor}cc`,
              boxShadow: `0 0 4px ${groupColor}88`,
            }}
          />
        )}

        {/* Inner circle — universe identity when idle, live beam when lit.
            Pan/tilt (when mapped) offsets the beam so moving heads visibly sweep. */}
        <div
          className="absolute rounded-full"
          style={{
            width: Math.round(diameter * 0.38),
            height: Math.round(diameter * 0.38),
            top: '50%',
            left: '50%',
            transform: lit
              ? `translate(calc(-50% + ${(live!.panOffset * diameter * 0.28).toFixed(1)}px), calc(-50% + ${(live!.tiltOffset * diameter * 0.28).toFixed(1)}px))`
              : 'translate(-50%, -50%)',
            background: lit ? liveRgba(0.55 + 0.45 * live!.intensity) : `${color}55`,
            boxShadow: lit
              ? `0 0 ${Math.round(3 + 8 * live!.intensity)}px ${liveRgba(0.5)}`
              : `0 0 0 1px ${color}33`,
            transition: 'transform 0.12s linear, background 0.12s linear, box-shadow 0.12s linear',
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
        {fixture.ofl_manufacturer && (
          <div
            className="text-[8px] leading-none mt-[2px] truncate"
            style={{ color: selected ? '#94a3b8' : '#475569', maxWidth: 80 }}
          >
            {fixture.ofl_manufacturer}
          </div>
        )}
        {fixture.ofl_model && (
          <div
            className="text-[8px] leading-none mt-[1px] truncate"
            style={{ color: selected ? '#94a3b8' : '#475569', maxWidth: 80 }}
          >
            {fixture.ofl_model}
          </div>
        )}
        <div
          className="text-[8px] font-mono leading-none mt-[2px]"
          style={{ color: `${color}bb` }}
        >
          U{fixture.universe}·{fixture.start_channel}
        </div>
        <div
          className="text-[8px] font-mono leading-none mt-[2px]"
          style={{ color: selected ? '#475569' : '#2d3f52' }}
        >
          #{shortId}
        </div>
      </div>
    </div>
  )
}
