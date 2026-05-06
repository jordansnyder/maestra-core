'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DMXFixture, DMXGroup, DMXNode, DMXCue, DMXSequence, DMXCuePlacement } from '@/lib/types'
import { UNIVERSE_PALETTE } from '@/lib/dmx-constants'
import { SequencePlaybackStatus } from '@/hooks/useSequencePlayback'
import {
  Pencil, Network, Layers, SlidersHorizontal, ChevronRight, BookOpen, Trash2,
  GripVertical, X, Check, Play, Pause, Square, ListOrdered, Plus, Repeat, Sunset, ExternalLink, ZapOff, FolderOpen,
} from '@/components/icons'

function getUniverseColor(nodes: DMXNode[], fixture: DMXFixture): string {
  const node = nodes.find((n) => n.id === fixture.node_id)
  const uCfg = node?.universes.find((u) => u.id === fixture.universe)
  return uCfg?.color ?? UNIVERSE_PALETTE[fixture.universe % UNIVERSE_PALETTE.length]
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

interface DMXSidebarProps {
  nodes: DMXNode[]
  fixtures: DMXFixture[]
  groups?: DMXGroup[]
  selectedGroupId?: string | null
  onGroupSelect?: (id: string | null) => void
  cueGroupId?: string | null
  onCueGroupChange?: (id: string | null) => void
  onCreateGroup?: (name: string, color: string) => Promise<void>
  onUpdateGroup?: (id: string, name: string, color: string) => Promise<void>
  onDeleteGroup?: (id: string) => Promise<void>
  selectedIds: Set<string>
  multiSelectGroup: Set<string>
  onSelect: (id: string | null, shiftKey?: boolean) => void
  onEdit: (fixture: DMXFixture) => void
  onDelete: (id: string) => void
  onEditNode: (node: DMXNode) => void
  onAdjustDMX: () => void
  onReorderNodes: (draggedId: string, targetId: string) => void
  onReorderFixtures: (draggedId: string, targetId: string) => void
  isPaused: boolean
  onAddNode: () => void
  onAddFixture: () => void
  // Cues
  cues: DMXCue[]
  activeCueId: string | null
  editingCueId: string | null
  cueFadeProgress: number | null
  onRecallCue: (id: string, fadeDuration: number) => void
  onEnterEditCue: (id: string) => void
  onExitEditCue: () => void
  onRenameCue: (id: string, name: string) => Promise<void>
  onDeleteCue: (id: string) => void
  onReorderCues: (draggedId: string, targetId: string) => void
  onOpenCues: () => void
  onSaveCue: (name: string, groupId?: string) => Promise<void>
  onUpdateCue: () => void
  updateCueLoading: boolean
  // Sequences
  sequences: DMXSequence[]
  getStatusForSeq: (seq: DMXSequence) => SequencePlaybackStatus
  activeGroupIds: Set<string | null>
  onPlaySequence: (seq: DMXSequence) => void
  onPauseSequence: (seq: DMXSequence) => void
  onStopSequence: (seq: DMXSequence) => void
  onToggleLoop: (seq: DMXSequence) => void
  onFadeOut: (durationSec: number, seq: DMXSequence) => void
  onBlackout: () => void
  onRenameSequence: (id: string, name: string) => Promise<void>
  onDeleteSequence: (seq: DMXSequence) => void
  onReorderSequences: (draggedId: string, targetId: string) => void
  onAddCueToSequence: (sequenceId: string, cueId: string) => void
  onReorderSequenceCues: (sequenceId: string, draggedId: string, targetId: string) => void
  onUpdatePlacement: (sequenceId: string, placementId: string, data: { transition_time?: number; hold_duration?: number }) => void
  onRemoveCueFromSequence: (sequenceId: string, placementId: string) => void
  onOpenSequences: () => void
  openSequencesSignal?: number
  availableCues: DMXCue[]
  onCreateSequence: (groupId?: string) => void
  onAdjustFixture?: (fixture: DMXFixture) => void
}

type ActiveSection = 'nodes' | 'fixtures' | 'groups' | 'cues' | 'sequences'

export function DMXSidebar({
  nodes, fixtures, groups = [], selectedGroupId, onGroupSelect, cueGroupId = null, onCueGroupChange, onCreateGroup, onUpdateGroup, onDeleteGroup, selectedIds, multiSelectGroup, onSelect, onEdit, onDelete, onEditNode, onAdjustDMX,
  isPaused, onAddNode, onAddFixture, onReorderNodes, onReorderFixtures,
  cues, activeCueId, editingCueId, cueFadeProgress, onRecallCue, onEnterEditCue, onExitEditCue, onRenameCue, onDeleteCue, onReorderCues, onOpenCues, onSaveCue, onUpdateCue, updateCueLoading,
  sequences, getStatusForSeq, activeGroupIds, onPlaySequence, onPauseSequence, onStopSequence, onRenameSequence, onDeleteSequence,
  onReorderSequences, onAddCueToSequence, onReorderSequenceCues, onUpdatePlacement, onRemoveCueFromSequence,
  onOpenSequences, openSequencesSignal, availableCues, onToggleLoop, onFadeOut, onBlackout, onCreateSequence, onAdjustFixture,
}: DMXSidebarProps) {
  const SESSION_KEY = 'dmx-sidebar-section'
  const [active, setActive] = useState<ActiveSection>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved === 'nodes' || saved === 'fixtures' || saved === 'groups' || saved === 'cues' || saved === 'sequences') return saved
    } catch {}
    return 'fixtures'
  })
  const setActiveSection = (s: ActiveSection) => {
    setActive(s)
    if (s === 'groups') {
      // Carry cue/sequence context into the Groups tab so the same group stays highlighted
      if (cueGroupId) onGroupSelect?.(cueGroupId)
    } else if (s === 'fixtures' || s === 'nodes') {
      // These tabs have no group concept — clear everything
      onGroupSelect?.(null)
      onCueGroupChange?.(null)
    } else {
      // cues / sequences: selectedGroupId no longer needed (canvas driven by cueGroupId)
      onGroupSelect?.(null)
    }
    try { sessionStorage.setItem(SESSION_KEY, s) } catch {}
  }

  // Auto-switch to sequences if any group engine is playing when the sidebar mounts
  const didAutoSwitch = useRef(false)
  useEffect(() => {
    if (!didAutoSwitch.current && activeGroupIds.size > 0) {
      didAutoSwitch.current = true
      setActiveSection('sequences')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupIds.size])

  // ── Node drag state ────────────────────────────────────────────────────────
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)
  const dragNodeCounter = useRef(0)

  // ── Fixture drag + filter state ────────────────────────────────────────────
  const [draggedFixtureId, setDraggedFixtureId] = useState<string | null>(null)
  const [dragOverFixtureId, setDragOverFixtureId] = useState<string | null>(null)
  const dragFixtureCounter = useRef(0)
  const [filterUniverse, setFilterUniverse] = useState<number | null>(null)

  // ── Save cue form state ────────────────────────────────────────────────────
  const [showSaveCueForm, setShowSaveCueForm] = useState(false)
  const [newCueName, setNewCueName] = useState('')
  const [saveCueLoading, setSaveCueLoading] = useState(false)
  const [saveCueError, setSaveCueError] = useState<string | null>(null)

  async function submitSaveCue() {
    if (!newCueName.trim()) return
    setSaveCueLoading(true)
    setSaveCueError(null)
    try {
      await onSaveCue(newCueName.trim(), cueGroupId ?? undefined)
      setShowSaveCueForm(false)
      setNewCueName('')
    } catch (e) {
      setSaveCueError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaveCueLoading(false)
    }
  }

  // ── Cue drag/rename/fade state ─────────────────────────────────────────────
  const [cueFadeDuration, setCueFadeDuration] = useState(0)
  const [renamingCueId, setRenamingCueId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [draggedCueId, setDraggedCueId] = useState<string | null>(null)
  const [dragOverCueId, setDragOverCueId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  // ── Sequence UI state ──────────────────────────────────────────────────────
  const [expandedSeqId, setExpandedSeqId] = useState<string | null>(null)
  const [renamingSeqId, setRenamingSeqId] = useState<string | null>(null)
  const [renameSeqValue, setRenameSeqValue] = useState('')
  const [fadeOutDuration, setFadeOutDuration] = useState(3)
  const [showAddCueFor, setShowAddCueFor] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [cueSearch, setCueSearch] = useState('')
  const addCueDropdownRef = useRef<HTMLDivElement>(null)

  // Sequence drag state
  const [draggedSeqId, setDraggedSeqId] = useState<string | null>(null)
  const [dragOverSeqId, setDragOverSeqId] = useState<string | null>(null)
  const dragSeqCounter = useRef(0)

  // Placement drag state (within an expanded sequence)
  const [draggedPlacement, setDraggedPlacement] = useState<{ seqId: string; placementId: string } | null>(null)
  const [dragOverPlacementId, setDragOverPlacementId] = useState<string | null>(null)
  const dragPlacementCounter = useRef(0)

  // Inline editing of placement times
  const [editingPlacement, setEditingPlacement] = useState<{ id: string; field: 'transition_time' | 'hold_duration'; value: string } | null>(null)

  // ── Group management state ─────────────────────────────────────────────────
  const GROUP_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#94a3b8']
  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0])
  const [newGroupLoading, setNewGroupLoading] = useState(false)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameGroupValue, setRenameGroupValue] = useState('')
  const [renamingGroupColor, setRenamingGroupColor] = useState('')
  const [groupError, setGroupError] = useState<string | null>(null)

  // Auto-switch to sequences section when a new sequence is added externally
  useEffect(() => {
    if (!openSequencesSignal) return
    setActiveSection('sequences')
    onOpenSequences()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSequencesSignal])

  // Close add-cue dropdown on outside click or Escape
  useEffect(() => {
    if (!showAddCueFor) return
    function handleClick(e: MouseEvent) {
      if (addCueDropdownRef.current && !addCueDropdownRef.current.contains(e.target as Node)) {
        setShowAddCueFor(null); setDropdownPos(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setShowAddCueFor(null); setDropdownPos(null) }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [showAddCueFor])

  function openAddCueDropdown(e: React.MouseEvent, seqId: string) {
    if (showAddCueFor === seqId) { setShowAddCueFor(null); setDropdownPos(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const maxH = 280
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const top = spaceBelow >= maxH ? rect.bottom + 4 : Math.max(rect.top - maxH - 4, 8)
    setDropdownPos({ top, left: rect.left })
    setShowAddCueFor(seqId)
    setCueSearch('')
  }

  // ── Sequence helpers ───────────────────────────────────────────────────────

  function commitPlacementEdit(sequenceId: string, placementId: string) {
    if (!editingPlacement || editingPlacement.id !== placementId) return
    const val = parseFloat(editingPlacement.value)
    if (!isNaN(val) && val >= 0) {
      onUpdatePlacement(sequenceId, placementId, { [editingPlacement.field]: val } as { transition_time?: number; hold_duration?: number })
    }
    setEditingPlacement(null)
  }

  function getPlaybackPhaseForSeq(seq: DMXSequence) {
    const s = getStatusForSeq(seq)
    if (s.sequenceId !== seq.id) return null
    if (s.playState === 'stopped') return null
    return { state: s.playState, phase: s.phase, progress: s.progress, holdProgress: s.holdProgress, cueIndex: s.cueIndex, loop: s.loop }
  }

  return (
    <>
    <aside className="w-full md:w-sidebar-dmx md:shrink-0 bg-slate-900 md:border-l border-slate-800 flex flex-col overflow-hidden">

      {/* ── Art-Net Nodes section ───────────────────────────────────── */}
      <div className="flex flex-col shrink-0" style={{ transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)' }}>
        <div
          onClick={() => setActiveSection('nodes')}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 cursor-pointer select-none ${
            active === 'nodes' ? 'border-b border-slate-800' : 'hover:bg-slate-800/40'
          }`}
        >
          <Network className={`w-3.5 h-3.5 transition-colors ${active === 'nodes' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'nodes' ? 'text-slate-400' : 'text-slate-600'}`}>
            Art-Net Nodes
          </span>
          <span className={`text-[10px] transition-colors ${active === 'nodes' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({nodes.length})
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onAddNode() }}
            className="ml-auto text-slate-600 hover:text-blue-400 transition-colors cursor-pointer p-0.5"
            title="Add Node"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${active === 'nodes' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`} />
        </div>

        <div
          className="overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'nodes' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            <div className="px-4 py-3">
              {nodes.length === 0 ? (
                <p className="text-xs text-slate-600">No nodes configured</p>
              ) : (
                <div className="space-y-1.5">
                  {nodes.map((node) => {
                    const nodeFixtures = fixtures.filter((f) => f.node_id === node.id)
                    const isDraggedOver = dragOverNodeId === node.id && draggedNodeId !== node.id
                    return (
                      <div
                        key={node.id}
                        draggable
                        onDragStart={(e) => { setDraggedNodeId(node.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDraggedNodeId(null); setDragOverNodeId(null); dragNodeCounter.current = 0 }}
                        onDragEnter={() => { dragNodeCounter.current++; setDragOverNodeId(node.id) }}
                        onDragLeave={() => { dragNodeCounter.current--; if (dragNodeCounter.current === 0) setDragOverNodeId(null) }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          dragNodeCounter.current = 0; setDragOverNodeId(null)
                          if (draggedNodeId && draggedNodeId !== node.id) onReorderNodes(draggedNodeId, node.id)
                          setDraggedNodeId(null)
                        }}
                        className={`rounded-lg px-3 py-2 border transition-colors ${
                          isDraggedOver
                            ? 'bg-slate-700/50 border-slate-500 border-dashed'
                            : draggedNodeId === node.id
                            ? 'opacity-40 border-transparent bg-slate-800/50'
                            : 'bg-slate-800/50 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <GripVertical className="w-3 h-3 text-slate-700 hover:text-slate-500 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />
                          <div className="text-xs font-medium text-slate-200 truncate flex-1">{node.name}</div>
                          <button onClick={() => onEditNode(node)} className="text-slate-600 hover:text-slate-300 transition-colors shrink-0">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5 pl-4">{node.ip_address}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5 pl-4">
                          {nodeFixtures.length} fixture{nodeFixtures.length !== 1 ? 's' : ''} · {node.universe_count} universe{node.universe_count !== 1 ? 's' : ''}
                        </div>
                        {node.device_id ? (
                          <a
                            href="/devices"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 flex items-center justify-between w-full px-2 py-1 rounded bg-blue-900/20 border border-blue-800/40 hover:bg-blue-900/30 transition-colors group"
                          >
                            <div className="min-w-0">
                              <div className="text-[8px] uppercase tracking-wider text-blue-700 font-medium leading-none">Linked Device</div>
                              <div className="text-[9px] font-mono text-blue-500/80 group-hover:text-blue-400 truncate leading-none mt-0.5">{node.device_id.slice(0, 8)}…</div>
                            </div>
                            <ExternalLink className="w-2.5 h-2.5 text-blue-700 group-hover:text-blue-400 shrink-0 ml-1.5" />
                          </a>
                        ) : (
                          <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                            <span className="text-[9px] text-slate-600">No linked device</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixtures section ─────────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0"
        style={{
          flex: active === 'fixtures' ? '1 1 auto' : '0 0 auto',
          transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          onClick={() => setActiveSection('fixtures')}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 border-t border-slate-800 cursor-pointer select-none ${
            active === 'fixtures' ? 'border-b border-slate-800' : 'hover:bg-slate-800/40'
          }`}
        >
          <Layers className={`w-3.5 h-3.5 transition-colors ${active === 'fixtures' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'fixtures' ? 'text-slate-400' : 'text-slate-600'}`}>
            Fixtures
          </span>
          <span className={`text-[10px] transition-colors ${active === 'fixtures' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({fixtures.length})
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onAddFixture() }}
            className="ml-auto text-slate-600 hover:text-blue-400 transition-colors cursor-pointer p-0.5"
            title="Add Fixture"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${active === 'fixtures' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`} />
        </div>

        <div
          className="overflow-hidden flex-1"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'fixtures' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            <div className="px-4 py-3">
              {fixtures.length === 0 ? (
                <p className="text-xs text-slate-600">No fixtures added yet</p>
              ) : (
                <>
                  {/* Universe filter chips — only when multiple universes exist */}
                  {(() => {
                    const universes = [...new Set(fixtures.map(f => f.universe))].sort((a, b) => a - b)
                    if (universes.length <= 1) return null
                    return (
                      <div className="flex flex-wrap gap-1 mb-2">
                        <button
                          onClick={() => setFilterUniverse(null)}
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                            filterUniverse === null
                              ? 'bg-slate-600 text-slate-200'
                              : 'bg-slate-800 text-slate-500 hover:text-slate-400'
                          }`}
                        >
                          All
                        </button>
                        {universes.map(u => {
                          const rep = fixtures.find(f => f.universe === u)!
                          const uColor = getUniverseColor(nodes, rep)
                          const isActive = filterUniverse === u
                          return (
                            <button
                              key={u}
                              onClick={() => setFilterUniverse(isActive ? null : u)}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
                              style={{
                                background: isActive ? `${uColor}33` : `${uColor}11`,
                                color: isActive ? uColor : `${uColor}88`,
                                border: `1px solid ${isActive ? `${uColor}66` : `${uColor}33`}`,
                              }}
                            >
                              U{u}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Fixtures grouped by universe */}
                  {(() => {
                    const allUniverses = [...new Set(fixtures.map(f => f.universe))].sort((a, b) => a - b)
                    const showHeaders = allUniverses.length > 1
                    const visibleUniverses = filterUniverse !== null ? [filterUniverse] : allUniverses

                    return visibleUniverses.map(u => {
                      const universeFixtures = fixtures.filter(f => f.universe === u)
                      if (universeFixtures.length === 0) return null
                      const uColor = getUniverseColor(nodes, universeFixtures[0])

                      return (
                        <div key={u} className="space-y-1 mb-2 last:mb-0">
                          {showHeaders && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="h-px flex-1" style={{ background: `${uColor}33` }} />
                              <span className="text-[9px] font-mono" style={{ color: `${uColor}99` }}>Universe {u}</span>
                              <div className="h-px flex-1" style={{ background: `${uColor}33` }} />
                            </div>
                          )}
                          {universeFixtures.map((fixture) => {
                            const node = nodes.find((n) => n.id === fixture.node_id)
                            const isSelected = selectedIds.has(fixture.id)
                            const isGroupable = multiSelectGroup.has(fixture.id)
                            const isMultiSelectable = isGroupable && !isSelected
                            const isDraggedOver = dragOverFixtureId === fixture.id && draggedFixtureId !== fixture.id

                            return (
                              <div
                                key={fixture.id}
                                draggable
                                onDragStart={(e) => { setDraggedFixtureId(fixture.id); e.dataTransfer.effectAllowed = 'move' }}
                                onDragEnd={() => { setDraggedFixtureId(null); setDragOverFixtureId(null); dragFixtureCounter.current = 0 }}
                                onDragEnter={() => { dragFixtureCounter.current++; setDragOverFixtureId(fixture.id) }}
                                onDragLeave={() => { dragFixtureCounter.current--; if (dragFixtureCounter.current === 0) setDragOverFixtureId(null) }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => {
                                  dragFixtureCounter.current = 0; setDragOverFixtureId(null)
                                  if (draggedFixtureId && draggedFixtureId !== fixture.id) onReorderFixtures(draggedFixtureId, fixture.id)
                                  setDraggedFixtureId(null)
                                }}
                                className={`group relative rounded-lg px-3 py-2 border transition-colors cursor-pointer select-none ${
                                  draggedFixtureId === fixture.id
                                    ? 'opacity-40 border-transparent'
                                    : isDraggedOver
                                    ? 'bg-slate-700/50 border-slate-500 border-dashed'
                                    : isSelected
                                    ? 'bg-slate-700 border-transparent'
                                    : isMultiSelectable
                                    ? 'bg-slate-800/40 border-dashed border-slate-600/60 hover:border-slate-500/80 hover:bg-slate-800/70'
                                    : 'border-transparent hover:bg-slate-800/70'
                                }`}
                                onClick={(e) => onSelect(fixture.id, e.shiftKey)}
                                onDoubleClick={(e) => { e.stopPropagation(); onEdit(fixture) }}
                              >
                                {/* Row 1: grip · name · actions */}
                                <div className="flex items-center gap-1">
                                  <GripVertical className="w-3 h-3 text-slate-700 group-hover:text-slate-500 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />
                                  <div className="text-xs font-medium text-slate-200 truncate flex-1">{fixture.name}</div>
                                  {/* Action buttons: always visible on mobile, hover-only on desktop */}
                                  <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (onAdjustFixture) {
                                          onAdjustFixture(fixture)
                                        } else {
                                          onSelect(fixture.id)
                                          onAdjustDMX()
                                        }
                                      }}
                                      title="Adjust DMX channels"
                                      className="text-slate-600 hover:text-blue-400 transition-colors p-0.5"
                                    >
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onEdit(fixture) }}
                                      title="Edit fixture"
                                      className="text-slate-600 hover:text-slate-300 transition-colors p-0.5"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {/* Row 2: manufacturer · model (combined) */}
                                {(fixture.ofl_manufacturer || fixture.ofl_model) && (
                                  <div className="text-[10px] text-slate-500 truncate mt-0.5 pl-4">
                                    {[fixture.ofl_manufacturer, fixture.ofl_model].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                                {/* Row 3: universe badge · ch · short ID · node name */}
                                <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                                  {(() => {
                                    const uColor = getUniverseColor(nodes, fixture)
                                    return (
                                      <span
                                        className="text-[9px] font-mono font-medium px-1 py-px rounded shrink-0 leading-none"
                                        style={{ background: `${uColor}22`, color: uColor, border: `1px solid ${uColor}55` }}
                                      >
                                        U{fixture.universe}
                                      </span>
                                    )
                                  })()}
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{fixture.start_channel}–{fixture.start_channel + fixture.channel_count - 1}</span>
                                  <span className="text-[9px] font-mono text-slate-700 shrink-0">#{fixture.id.replace(/-/g, '').slice(0, 7)}</span>
                                  {!isMultiSelectable && node && (
                                    <span className="text-[9px] text-slate-700 truncate">{node.name}</span>
                                  )}
                                  {isMultiSelectable && (
                                    <span className="text-[9px] text-slate-600 truncate">shift+click to add</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Groups section ───────────────────────────────────────────── */}
      <div className="flex flex-col shrink-0" style={{ transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)' }}>
        <div
          onClick={() => setActiveSection('groups')}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 cursor-pointer select-none border-t border-slate-800 ${
            active === 'groups' ? 'border-b border-slate-800' : 'hover:bg-slate-800/40'
          }`}
        >
          <FolderOpen className={`w-3.5 h-3.5 transition-colors ${active === 'groups' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'groups' ? 'text-slate-400' : 'text-slate-600'}`}>
            Groups
          </span>
          <span className={`text-[10px] transition-colors ${active === 'groups' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({groups.length})
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowNewGroupForm(true); setActiveSection('groups') }}
            className="ml-auto text-slate-600 hover:text-blue-400 transition-colors cursor-pointer p-0.5"
            title="Add Group"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${active === 'groups' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`} />
        </div>

        <div
          className="overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'groups' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            <div
              className="px-4 py-3 space-y-2 min-h-[48px]"
              onClick={() => { onGroupSelect?.(null); onCueGroupChange?.(null) }}
            >
              {groupError && (
                <p className="text-[10px] text-red-400">{groupError}</p>
              )}

              {/* New group form */}
              {showNewGroupForm && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setShowNewGroupForm(false); setNewGroupName('') }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (!newGroupName.trim() || !onCreateGroup) return
                        setNewGroupLoading(true)
                        setGroupError(null)
                        onCreateGroup(newGroupName.trim(), newGroupColor)
                          .then(() => { setShowNewGroupForm(false); setNewGroupName(''); setNewGroupColor(GROUP_COLORS[0]) })
                          .catch((err: unknown) => setGroupError(err instanceof Error ? err.message : 'Failed'))
                          .finally(() => setNewGroupLoading(false))
                      }
                    }}
                    placeholder="Group name"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {GROUP_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewGroupColor(c)}
                        className="w-5 h-5 rounded-full border-2 transition-all"
                        style={{ background: c, borderColor: newGroupColor === c ? '#ffffff' : 'transparent' }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!newGroupName.trim() || !onCreateGroup) return
                        setNewGroupLoading(true)
                        setGroupError(null)
                        onCreateGroup(newGroupName.trim(), newGroupColor)
                          .then(() => { setShowNewGroupForm(false); setNewGroupName(''); setNewGroupColor(GROUP_COLORS[0]) })
                          .catch((err: unknown) => setGroupError(err instanceof Error ? err.message : 'Failed'))
                          .finally(() => setNewGroupLoading(false))
                      }}
                      disabled={!newGroupName.trim() || newGroupLoading}
                      className="flex-1 py-1 rounded text-[10px] font-medium bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white transition-colors"
                    >
                      {newGroupLoading ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewGroupForm(false); setNewGroupName('') }}
                      className="px-3 py-1 rounded text-[10px] text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {groups.length === 0 && !showNewGroupForm ? (
                <p className="text-xs text-slate-600">No groups yet</p>
              ) : (
                <div className="space-y-1.5">
                  {/* All — clears group selection, shows full canvas */}
                  <div
                    onClick={(e) => { e.stopPropagation(); onGroupSelect?.(null); onCueGroupChange?.(null) }}
                    className={`rounded-lg px-3 py-2 border transition-colors cursor-pointer select-none ${
                      selectedGroupId === null
                        ? 'border-slate-500 bg-slate-700/60'
                        : 'bg-slate-800/50 border-transparent hover:border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-600 border border-slate-500" />
                      <span className={`text-xs flex-1 transition-colors ${selectedGroupId === null ? 'text-white' : 'text-slate-400'}`}>All</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{fixtures.length}fx</span>
                      {selectedGroupId === null && (
                        <span className="text-[9px] text-slate-400 shrink-0 font-mono">all</span>
                      )}
                    </div>
                  </div>

                  {groups.map((group) => {
                    const fixtureCount = fixtures.filter((f) => f.group_id === group.id).length
                    const isRenaming = renamingGroupId === group.id
                    const isSelected = selectedGroupId === group.id
                    return (
                      <div
                        key={group.id}
                        onClick={(e) => { e.stopPropagation(); if (!isRenaming) { const next = isSelected ? null : group.id; onGroupSelect?.(next); onCueGroupChange?.(next) } }}
                        className={`rounded-lg px-3 py-2 border transition-colors cursor-pointer select-none ${
                          isSelected
                            ? 'border-slate-500 bg-slate-700/60'
                            : 'bg-slate-800/50 border-transparent hover:border-slate-700/50'
                        }`}
                        style={isSelected && group.color ? { borderColor: `${group.color}66`, backgroundColor: `${group.color}18` } : undefined}
                      >
                        {isRenaming ? (
                          <div className="space-y-2">
                            <input
                              autoFocus
                              type="text"
                              value={renameGroupValue}
                              onChange={(e) => setRenameGroupValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setRenamingGroupId(null)
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  if (!renameGroupValue.trim() || !onUpdateGroup) { setRenamingGroupId(null); return }
                                  onUpdateGroup(group.id, renameGroupValue.trim(), renamingGroupColor)
                                    .catch((err: unknown) => setGroupError(err instanceof Error ? err.message : 'Failed'))
                                    .finally(() => setRenamingGroupId(null))
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              {GROUP_COLORS.map((c) => (
                                <button
                                  key={c}
                                  onClick={() => setRenamingGroupColor(c)}
                                  className="w-4 h-4 rounded-full border-2 transition-all"
                                  style={{ background: c, borderColor: renamingGroupColor === c ? '#ffffff' : 'transparent' }}
                                />
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  if (!renameGroupValue.trim() || !onUpdateGroup) { setRenamingGroupId(null); return }
                                  onUpdateGroup(group.id, renameGroupValue.trim(), renamingGroupColor)
                                    .catch((err: unknown) => setGroupError(err instanceof Error ? err.message : 'Failed'))
                                    .finally(() => setRenamingGroupId(null))
                                }}
                                className="flex items-center justify-center w-6 h-6 rounded bg-blue-700 hover:bg-blue-600 transition-colors"
                              >
                                <Check className="w-3 h-3 text-white" />
                              </button>
                              <button
                                onClick={() => setRenamingGroupId(null)}
                                className="flex items-center justify-center w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                              >
                                <X className="w-3 h-3 text-slate-300" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 transition-all"
                              style={{
                                background: group.color ?? '#64748b',
                                boxShadow: isSelected && group.color ? `0 0 6px ${group.color}cc` : 'none',
                              }}
                            />
                            <span className={`text-xs truncate flex-1 transition-colors ${isSelected ? 'text-white' : 'text-slate-200'}`}>{group.name}</span>
                            {activeGroupIds.has(group.id) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" title="Sequence playing" />
                            )}
                            <span className="text-[10px] text-slate-500 shrink-0">{fixtureCount}fx</span>
                            {isSelected && (
                              <span className="text-[9px] text-slate-400 shrink-0 font-mono">editing</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setRenamingGroupId(group.id); setRenameGroupValue(group.name); setRenamingGroupColor(group.color ?? GROUP_COLORS[0]) }}
                              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
                              title="Rename"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteGroup?.(group.id).catch((err: unknown) => setGroupError(err instanceof Error ? err.message : 'Failed')) }}
                              className="text-slate-700 hover:text-red-400 transition-colors shrink-0"
                              title="Delete group"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cues section ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0"
        style={{
          flex: active === 'cues' ? '1 1 auto' : '0 0 auto',
          transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <button
          onClick={() => { setActiveSection('cues'); if (active !== 'cues') onOpenCues() }}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 border-t border-slate-800 ${
            active === 'cues' ? 'border-b border-slate-800' : 'hover:bg-slate-800/40'
          }`}
        >
          <BookOpen className={`w-3.5 h-3.5 transition-colors ${active === 'cues' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'cues' ? 'text-slate-400' : 'text-slate-600'}`}>
            Cues
          </span>
          <span className={`text-[10px] transition-colors ${active === 'cues' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({cues.length})
          </span>
          {(activeCueId || editingCueId) && (
            <span className={`ml-1 w-1.5 h-1.5 rounded-full shrink-0 ${editingCueId ? 'bg-indigo-400' : 'bg-amber-400'}`} />
          )}
          <ChevronRight className={`w-3 h-3 ml-auto transition-transform duration-300 ${active === 'cues' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`} />
        </button>

        {/* Group context selector — only shown when expanded and groups exist */}
        {active === 'cues' && groups.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/60 overflow-x-auto scrollbar-none shrink-0">
            <button
              onClick={() => onCueGroupChange?.(null)}
              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                cueGroupId === null ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onCueGroupChange?.(cueGroupId === g.id ? null : g.id)}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  cueGroupId === g.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
                style={cueGroupId === g.id && g.color ? { borderLeft: `2px solid ${g.color}`, paddingLeft: 6 } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: g.color ?? '#64748b' }} />
                {g.name}
                {activeGroupIds.has(g.id) && (
                  <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="overflow-hidden flex-1"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'cues' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            {/* Save Cue / Update Cue */}
            <div className="px-4 pt-3 pb-2 border-b border-slate-800/60">
              {editingCueId ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-indigo-400 truncate flex-1 min-w-0">
                    Editing: {cues.find((c) => c.id === editingCueId)?.name}
                  </span>
                  <button
                    onClick={onUpdateCue}
                    disabled={updateCueLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3 h-3" />
                    {updateCueLoading ? 'Saving…' : 'Update Cue'}
                  </button>
                  <button
                    onClick={onExitEditCue}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 shrink-0"
                    title="Exit edit mode"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : isPaused ? (
                <>
                  {!showSaveCueForm ? (
                    <button
                      onClick={() => { setShowSaveCueForm(true); setSaveCueError(null) }}
                      className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-950/70 hover:bg-blue-900/80 border border-blue-700/30 text-blue-200 transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Save Cue
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        type="text"
                        value={newCueName}
                        onChange={(e) => setNewCueName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitSaveCue()
                          if (e.key === 'Escape') { setShowSaveCueForm(false); setNewCueName('') }
                        }}
                        placeholder="e.g. Opening Scene"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                      {saveCueError && <p className="text-[10px] text-red-400">{saveCueError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowSaveCueForm(false); setNewCueName('') }}
                          className="flex-1 px-2 py-1.5 rounded text-[11px] text-slate-400 bg-slate-700 hover:bg-slate-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={submitSaveCue}
                          disabled={saveCueLoading || !newCueName.trim()}
                          className="flex-1 px-2 py-1.5 rounded text-[11px] font-medium bg-blue-950/70 hover:bg-blue-900/80 border border-blue-700/30 text-blue-200 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {saveCueLoading ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-slate-600">Click a cue to recall it · Pause signals to save</p>
              )}
            </div>
            {/* Fade duration setting */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Fade</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={cueFadeDuration}
                onChange={(e) => setCueFadeDuration(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-14 bg-slate-800 border border-slate-700 focus:border-amber-600 rounded px-1.5 py-0.5 text-xs text-center font-mono text-slate-300 focus:text-amber-300 focus:outline-none transition-colors"
              />
              <span className="text-[10px] text-slate-600">sec</span>
              {cueFadeDuration > 0 && (
                <span className="ml-auto text-[9px] text-amber-600 font-medium uppercase tracking-wide">on</span>
              )}
            </div>
            {(() => {
              const visibleCues = cueGroupId === null ? cues : cues.filter((c) => (c.group_id ?? null) === cueGroupId)
              const cueEmptyMsg = cues.length === 0
                ? 'No cues saved yet. Pause signals and use Save Cue to capture the current state.'
                : `No cues in ${groups.find((g) => g.id === cueGroupId)?.name ?? 'this group'} yet.`
              return (
            <div className="px-4 py-3">
              {visibleCues.length === 0 ? (
                <p className="text-xs text-slate-600">{cueEmptyMsg}</p>
              ) : (
                <div className="space-y-1">
                  {visibleCues.map((cue) => {
                    const isActive = activeCueId === cue.id
                    const isEditing = editingCueId === cue.id
                    const isRenaming = renamingCueId === cue.id
                    const isDraggedOver = dragOverCueId === cue.id && draggedCueId !== cue.id

                    return (
                      <div
                        key={cue.id}
                        draggable
                        onClick={() => { if (!isEditing && !isRenaming) onRecallCue(cue.id, cueFadeDuration) }}
                        onDragStart={(e) => { setDraggedCueId(cue.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDraggedCueId(null); setDragOverCueId(null); dragCounter.current = 0 }}
                        onDragEnter={() => { dragCounter.current++; setDragOverCueId(cue.id) }}
                        onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragOverCueId(null) }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          dragCounter.current = 0; setDragOverCueId(null)
                          if (draggedCueId && draggedCueId !== cue.id) onReorderCues(draggedCueId, cue.id)
                          setDraggedCueId(null)
                        }}
                        className={`group relative rounded-lg border overflow-hidden transition-colors ${!isEditing && !isRenaming ? 'cursor-pointer' : ''} ${
                          isEditing
                            ? 'bg-indigo-950/60 border-indigo-700/60'
                            : isActive
                            ? 'bg-amber-950/40 border-amber-700/50'
                            : isDraggedOver
                            ? 'bg-slate-700/50 border-slate-500 border-dashed'
                            : draggedCueId === cue.id
                            ? 'opacity-40 border-transparent'
                            : 'border-transparent hover:bg-slate-800/70'
                        }`}
                      >
                        {/* Fade progress bar — only on active cue while fading */}
                        {isActive && cueFadeProgress !== null && (
                          <div className="h-0.5 w-full bg-slate-800">
                            <div
                              className="h-full bg-blue-500 transition-none"
                              style={{ width: `${cueFadeProgress * 100}%` }}
                            />
                          </div>
                        )}
                        <div className="px-3 py-2">
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => { if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim()); setRenamingCueId(null) }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim()); setRenamingCueId(null) }
                                if (e.key === 'Escape') setRenamingCueId(null)
                              }}
                              className={`flex-1 min-w-0 bg-slate-900 border rounded px-2 py-0.5 text-xs text-white focus:outline-none ${
                                isEditing ? 'border-indigo-500 focus:border-indigo-400' : 'border-slate-600 focus:border-amber-500'
                              }`}
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim()); setRenamingCueId(null) }}
                              className="text-slate-400 hover:text-white transition-colors shrink-0"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <GripVertical className="w-3 h-3 text-slate-700 group-hover:text-slate-500 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />
                              {isEditing ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRenamingCueId(cue.id); setRenameValue(cue.name) }}
                                  title="Click to rename"
                                  className="flex-1 min-w-0 text-xs font-medium text-indigo-300 hover:text-indigo-200 truncate text-left transition-colors cursor-text"
                                >
                                  {cue.name}
                                </button>
                              ) : (
                                <span className={`flex-1 min-w-0 text-xs font-medium truncate ${isActive ? 'text-amber-300' : 'text-slate-200'}`}>
                                  {cue.name}
                                </span>
                              )}
                              {cue.group_id && (() => {
                                const g = groups.find((gr) => gr.id === cue.group_id)
                                return g?.color ? (
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: g.color }}
                                    title={g.name}
                                  />
                                ) : null
                              })()}
                              <div className={`flex items-center gap-1 shrink-0 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {isEditing ? (
                                  <button onClick={(e) => { e.stopPropagation(); onExitEditCue() }} title="Exit edit mode" className="text-indigo-400 hover:text-indigo-200 transition-colors">
                                    <X className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); onEnterEditCue(cue.id) }} title="Edit cue" className="text-slate-600 hover:text-indigo-400 transition-colors">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteCue(cue.id) }} title="Delete cue" className="text-slate-600 hover:text-red-400 transition-colors">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isEditing ? 'text-indigo-600' : isActive ? 'text-amber-700' : 'text-slate-600'}`}>
                              {isEditing ? 'Edit mode — adjust channels, then Update Cue' : isActive ? 'Active' : formatRelativeTime(cue.created_at)}
                            </div>
                            {!isEditing && cue.nodes && cue.nodes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cue.nodes.map((n) => (
                                  <span
                                    key={n.node_id}
                                    className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                      isActive
                                        ? 'bg-amber-900/30 text-amber-600 border border-amber-800/40'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                                    }`}
                                  >
                                    {n.node_name}
                                    <span className="opacity-60 mx-0.5">·</span>
                                    U{n.universes.join(',')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        </div>{/* end px-3 py-2 */}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── Sequences section ─────────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0"
        style={{
          flex: active === 'sequences' ? '1 1 auto' : '0 0 auto',
          transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          onClick={() => { setActiveSection('sequences'); if (active !== 'sequences') onOpenSequences() }}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 border-t border-slate-800 cursor-pointer select-none ${
            active === 'sequences' ? 'border-b border-slate-800' : 'hover:bg-slate-800/40'
          }`}
        >
          <ListOrdered className={`w-3.5 h-3.5 transition-colors ${active === 'sequences' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'sequences' ? 'text-slate-400' : 'text-slate-600'}`}>
            Sequences
          </span>
          <span className={`text-[10px] transition-colors ${active === 'sequences' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({sequences.length})
          </span>
          {activeGroupIds.size > 0 && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full shrink-0 bg-green-400 animate-pulse" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onCreateSequence(cueGroupId ?? undefined) }}
            className="ml-auto text-slate-600 hover:text-blue-400 transition-colors cursor-pointer p-0.5"
            title="Add Sequence"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${active === 'sequences' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`} />
        </div>

        {/* Group context selector — shared with Cues */}
        {active === 'sequences' && groups.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/60 overflow-x-auto scrollbar-none shrink-0">
            <button
              onClick={() => onCueGroupChange?.(null)}
              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                cueGroupId === null ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onCueGroupChange?.(cueGroupId === g.id ? null : g.id)}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  cueGroupId === g.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
                style={cueGroupId === g.id && g.color ? { borderLeft: `2px solid ${g.color}`, paddingLeft: 6 } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: g.color ?? '#64748b' }} />
                {g.name}
                {activeGroupIds.has(g.id) && (
                  <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="overflow-hidden flex-1"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'sequences' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            {/* Fadeout duration setting */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Fade Out</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={fadeOutDuration}
                onChange={(e) => setFadeOutDuration(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-14 bg-slate-800 border border-slate-700 focus:border-amber-600 rounded px-1.5 py-0.5 text-xs text-center font-mono text-slate-300 focus:text-amber-300 focus:outline-none transition-colors"
              />
              <span className="text-[10px] text-slate-600">sec</span>
              {fadeOutDuration > 0 && (
                <span className="ml-auto text-[9px] text-amber-600 font-medium uppercase tracking-wide">on</span>
              )}
            </div>
            {(() => {
              const visibleSeqs = cueGroupId === null ? sequences : sequences.filter((s) => (s.group_id ?? null) === cueGroupId)
              const seqEmptyMsg = sequences.length === 0
                ? 'No sequences yet. Click + to create one.'
                : `No sequences in ${groups.find((g) => g.id === cueGroupId)?.name ?? 'this group'} yet.`
              return (
            <div className="px-3 py-3">
              {visibleSeqs.length === 0 ? (
                <p className="text-xs text-slate-600 px-1">{seqEmptyMsg}</p>
              ) : (
                <div className="space-y-1.5">
                  {visibleSeqs.map((seq) => {
                    const pb = getPlaybackPhaseForSeq(seq)
                    const isThisPlaying = pb !== null && pb.state === 'playing'
                    const isThisPaused = pb !== null && pb.state === 'paused'
                    const isThisActive = pb !== null
                    const isExpanded = expandedSeqId === seq.id
                    const isRenamingSeq = renamingSeqId === seq.id
                    const isDraggedOver = dragOverSeqId === seq.id && draggedSeqId !== seq.id

                    // Progress bar values
                    const progressPct = pb
                      ? pb.phase === 'transitioning'
                        ? pb.progress * 100
                        : 100
                      : 0
                    const holdPct = pb && pb.phase === 'holding' ? pb.holdProgress * 100 : 0

                    return (
                      <div
                        key={seq.id}
                        draggable={!isRenamingSeq && !isExpanded}
                        onDragStart={(e) => { if (isExpanded) { e.preventDefault(); return }; setDraggedSeqId(seq.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDraggedSeqId(null); setDragOverSeqId(null); dragSeqCounter.current = 0 }}
                        onDragEnter={() => { if (draggedSeqId) { dragSeqCounter.current++; setDragOverSeqId(seq.id) } }}
                        onDragLeave={() => { if (draggedSeqId) { dragSeqCounter.current--; if (dragSeqCounter.current === 0) setDragOverSeqId(null) } }}
                        onDragOver={(e) => { if (draggedSeqId) e.preventDefault() }}
                        onDrop={() => {
                          dragSeqCounter.current = 0; setDragOverSeqId(null)
                          if (draggedSeqId && draggedSeqId !== seq.id) onReorderSequences(draggedSeqId, seq.id)
                          setDraggedSeqId(null)
                        }}
                        className={`group/seq rounded-lg border transition-colors overflow-hidden ${
                          isThisActive
                            ? 'bg-green-950/30 border-green-800/50'
                            : isDraggedOver
                            ? 'bg-slate-700/50 border-slate-500 border-dashed'
                            : draggedSeqId === seq.id
                            ? 'opacity-40 border-transparent'
                            : 'border-transparent bg-slate-800/30 hover:bg-slate-800/60'
                        }`}
                      >
                        {/* Transition progress bar */}
                        {pb && pb.phase === 'transitioning' && (
                          <div className="h-0.5 w-full bg-slate-800">
                            <div
                              className="h-full bg-blue-500 transition-none"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        )}
                        {/* Hold progress bar */}
                        {pb && pb.phase === 'holding' && holdPct < 100 && (
                          <div className="h-0.5 w-full bg-slate-800">
                            <div
                              className="h-full bg-amber-500 transition-none"
                              style={{ width: `${holdPct}%` }}
                            />
                          </div>
                        )}

                        {/* Header row */}
                        <div className="flex items-center gap-1 px-2 py-2">
                          {/* Drag handle — only when not expanded */}
                          {!isExpanded && (
                            <GripVertical className="w-3 h-3 text-slate-700 group-hover/seq:text-slate-500 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />
                          )}

                          {/* Expand toggle */}
                          <button
                            onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                            className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>

                          {/* Name / rename input */}
                          {isRenamingSeq ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                              <input
                                autoFocus
                                type="text"
                                value={renameSeqValue}
                                onChange={(e) => setRenameSeqValue(e.target.value)}
                                onBlur={() => { if (renameSeqValue.trim()) onRenameSequence(seq.id, renameSeqValue.trim()); setRenamingSeqId(null) }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { if (renameSeqValue.trim()) onRenameSequence(seq.id, renameSeqValue.trim()); setRenamingSeqId(null) }
                                  if (e.key === 'Escape') setRenamingSeqId(null)
                                }}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-600 focus:border-slate-400 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                              />
                              <button
                                onMouseDown={(e) => { e.preventDefault(); if (renameSeqValue.trim()) onRenameSequence(seq.id, renameSeqValue.trim()); setRenamingSeqId(null) }}
                                className="text-slate-400 hover:text-white transition-colors shrink-0"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`flex-1 min-w-0 text-xs font-medium truncate ${isThisActive ? 'text-green-300' : 'text-slate-200'}`}
                              title={seq.name}
                            >
                              {seq.name}
                            </span>
                          )}

                          {seq.group_id && (() => {
                            const g = groups.find((gr) => gr.id === seq.group_id)
                            return g?.color ? (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: g.color }}
                                title={g.name}
                              />
                            ) : null
                          })()}

                          {/* Playback controls */}
                          {!isRenamingSeq && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {/* Loop toggle */}
                              <button
                                onClick={(e) => { e.stopPropagation(); onToggleLoop(seq) }}
                                title={pb?.loop ? 'Loop on — click to disable' : 'Enable loop'}
                                className={`p-0.5 rounded transition-colors ${pb?.loop ? 'text-blue-400 hover:text-blue-200' : 'text-slate-600 hover:text-blue-400'}`}
                              >
                                <Repeat className="w-3 h-3" />
                              </button>

                              {/* Play / Pause toggle */}
                              <button
                                onClick={(e) => { e.stopPropagation(); isThisPlaying ? onPauseSequence(seq) : onPlaySequence(seq) }}
                                title={isThisPlaying ? 'Pause sequence' : isThisPaused ? 'Resume sequence' : 'Play sequence'}
                                className={`p-0.5 rounded transition-colors ${isThisPlaying ? 'text-green-400 hover:text-green-200' : 'text-slate-500 hover:text-green-400'}`}
                              >
                                {isThisPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              </button>

                              {/* Blackout */}
                              <button
                                onClick={(e) => { e.stopPropagation(); onBlackout() }}
                                title="Blackout — zero all fixture channels"
                                className="p-0.5 rounded text-slate-500 hover:text-yellow-400 transition-colors"
                              >
                                <ZapOff className="w-3 h-3" />
                              </button>

                              {/* Stop / Stop with fadeout — only when active */}
                              {isThisActive && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onStopSequence(seq) }}
                                    title="Stop sequence"
                                    className="p-0.5 rounded text-slate-500 hover:text-red-400 transition-colors"
                                  >
                                    <Square className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onFadeOut(fadeOutDuration, seq) }}
                                    title="Stop with 3s dimmer fadeout"
                                    className="p-0.5 rounded text-slate-500 hover:text-amber-400 transition-colors"
                                  >
                                    <Sunset className="w-3 h-3" />
                                  </button>
                                </>
                              )}

                              {/* Edit / rename */}
                              <button
                                onClick={(e) => { e.stopPropagation(); setRenamingSeqId(seq.id); setRenameSeqValue(seq.name) }}
                                title="Rename sequence"
                                className="p-0.5 rounded text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover/seq:opacity-100"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteSequence(seq) }}
                                title="Delete sequence"
                                className="p-0.5 rounded text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover/seq:opacity-100"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Cue placements — expanded view */}
                        {isExpanded && (
                          <div className="px-2 pb-2">
                            {seq.cue_placements.length === 0 ? (
                              <p className="text-[10px] text-slate-600 pl-4 pb-1">No cues added yet.</p>
                            ) : (
                              <div className="relative ml-3 border-l border-slate-700 space-y-0.5">
                                {seq.cue_placements.map((p: DMXCuePlacement, idx: number) => {
                                  const isActiveCue = pb !== null && pb.cueIndex === idx
                                  const isTransitioningHere = isActiveCue && pb?.phase === 'transitioning'
                                  const isDragOverPlacement = dragOverPlacementId === p.id && draggedPlacement?.placementId !== p.id
                                  const isThisDragged = draggedPlacement?.placementId === p.id

                                  const editingTransition = editingPlacement?.id === p.id && editingPlacement.field === 'transition_time'
                                  const editingHold = editingPlacement?.id === p.id && editingPlacement.field === 'hold_duration'

                                  return (
                                    <div
                                      key={p.id}
                                      draggable
                                      onDragStart={(e) => { e.stopPropagation(); setDraggedPlacement({ seqId: seq.id, placementId: p.id }); e.dataTransfer.effectAllowed = 'move' }}
                                      onDragEnd={() => { setDraggedPlacement(null); setDragOverPlacementId(null) }}
                                      onDragEnter={(e) => { e.preventDefault(); setDragOverPlacementId(p.id) }}
                                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPlacementId(null) }}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => {
                                        e.preventDefault(); setDragOverPlacementId(null)
                                        if (draggedPlacement && draggedPlacement.seqId === seq.id && draggedPlacement.placementId !== p.id) {
                                          onReorderSequenceCues(seq.id, draggedPlacement.placementId, p.id)
                                        }
                                        setDraggedPlacement(null)
                                      }}
                                      className={`group/placement flex items-center gap-1 pl-2 pr-1 py-1 rounded-r transition-colors ${
                                        isActiveCue
                                          ? isTransitioningHere
                                            ? 'bg-blue-950/50'
                                            : 'bg-green-950/40'
                                          : isDragOverPlacement
                                          ? 'bg-slate-700/50 border-dashed border border-slate-500'
                                          : isThisDragged
                                          ? 'opacity-40'
                                          : 'hover:bg-slate-800/50'
                                      }`}
                                    >
                                      {/* Drag handle */}
                                      <GripVertical className="w-2.5 h-2.5 text-slate-700 group-hover/placement:text-slate-500 shrink-0 cursor-grab active:cursor-grabbing" />

                                      {/* Transition time */}
                                      <div className="shrink-0 flex flex-col items-center" title="Fade-in transition time (seconds)">
                                        <span className="text-[8px] leading-none text-blue-800 font-medium tracking-wide">fade</span>
                                        {editingTransition ? (
                                          <input
                                            autoFocus
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={editingPlacement!.value}
                                            onChange={(e) => setEditingPlacement({ id: p.id, field: 'transition_time', value: e.target.value })}
                                            onBlur={() => commitPlacementEdit(seq.id, p.id)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') commitPlacementEdit(seq.id, p.id) }}
                                            className="w-9 bg-slate-900 border border-blue-600 rounded text-[11px] text-center text-blue-300 focus:outline-none px-0.5 py-px"
                                          />
                                        ) : (
                                          <button
                                            onClick={() => setEditingPlacement({ id: p.id, field: 'transition_time', value: String(p.transition_time) })}
                                            className="w-9 text-[11px] text-center font-mono text-blue-700 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors px-0.5 py-px"
                                          >
                                            {p.transition_time}s
                                          </button>
                                        )}
                                      </div>

                                      {/* Cue name */}
                                      <span className={`flex-1 min-w-0 text-xs truncate ${
                                        isActiveCue
                                          ? isTransitioningHere ? 'text-blue-300' : 'text-green-300'
                                          : 'text-slate-300'
                                      }`}>
                                        {p.cue_name}
                                      </span>

                                      {/* Hold duration */}
                                      <div className="shrink-0 flex flex-col items-center" title="Hold duration (seconds)">
                                        <span className="text-[8px] leading-none text-amber-800 font-medium tracking-wide">hold</span>
                                        {editingHold ? (
                                          <input
                                            autoFocus
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={editingPlacement!.value}
                                            onChange={(e) => setEditingPlacement({ id: p.id, field: 'hold_duration', value: e.target.value })}
                                            onBlur={() => commitPlacementEdit(seq.id, p.id)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') commitPlacementEdit(seq.id, p.id) }}
                                            className="w-9 bg-slate-900 border border-amber-600 rounded text-[11px] text-center text-amber-300 focus:outline-none px-0.5 py-px"
                                          />
                                        ) : (
                                          <button
                                            onClick={() => setEditingPlacement({ id: p.id, field: 'hold_duration', value: String(p.hold_duration) })}
                                            className="w-9 text-[11px] text-center font-mono text-amber-700 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors px-0.5 py-px"
                                          >
                                            {p.hold_duration}s
                                          </button>
                                        )}
                                      </div>

                                      {/* Active indicator */}
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                                        isActiveCue
                                          ? isTransitioningHere ? 'bg-blue-400 animate-pulse' : 'bg-green-400'
                                          : 'bg-transparent'
                                      }`} />

                                      {/* Remove button */}
                                      <button
                                        onClick={() => onRemoveCueFromSequence(seq.id, p.id)}
                                        title="Remove from sequence"
                                        className="text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover/placement:opacity-100 shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Add Cue button — dropdown rendered via portal */}
                            <div className="mt-1.5 ml-3">
                              <button
                                onClick={(e) => openAddCueDropdown(e, seq.id)}
                                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-300 transition-colors px-1 py-0.5 rounded hover:bg-slate-800/50"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                Add Cue
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
              )
            })()}
          </div>
        </div>
      </div>

    </aside>

    {/* Add Cue dropdown portal — renders above all overflow:hidden containers */}
    {showAddCueFor && dropdownPos && typeof document !== 'undefined' && createPortal(
      <div
        ref={addCueDropdownRef}
        style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: 200, zIndex: 9999 }}
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="p-1.5 border-b border-slate-700">
          <input
            autoFocus
            type="text"
            placeholder="Search cues…"
            value={cueSearch}
            onChange={(e) => setCueSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {(() => {
            // Only show cues whose group matches the sequence being added to
            const targetSeq = sequences.find((s) => s.id === showAddCueFor)
            const targetGroupId = targetSeq?.group_id ?? null
            const filtered = availableCues.filter((c) => {
              const matchesGroup = (c.group_id ?? null) === targetGroupId
              const matchesSearch = c.name.toLowerCase().includes(cueSearch.toLowerCase())
              return matchesGroup && matchesSearch
            })
            return filtered.length === 0 ? (
              <p className="text-[10px] text-slate-500 px-3 py-2">
                {targetGroupId
                  ? `No cues in ${groups.find((g) => g.id === targetGroupId)?.name ?? 'this group'}`
                  : 'No ungrouped cues found'}
              </p>
            ) : filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onAddCueToSequence(showAddCueFor!, c.id); setShowAddCueFor(null); setDropdownPos(null); setCueSearch('') }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors truncate"
              >
                {c.name}
              </button>
            ))
          })()}
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
