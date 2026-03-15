'use client'

import { useState, useRef } from 'react'
import { DMXFixture, DMXNode, DMXCue } from '@/lib/types'
import { Pencil, Network, Layers, SlidersHorizontal, ChevronRight, BookOpen, Trash2, GripVertical, X, Check } from '@/components/icons'

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
  selectedIds: Set<string>
  multiSelectGroup: Set<string>
  onSelect: (id: string | null, shiftKey?: boolean) => void
  onEdit: (fixture: DMXFixture) => void
  onDelete: (id: string) => void
  onEditNode: (node: DMXNode) => void
  onAdjustDMX: () => void
  cues: DMXCue[]
  activeCueId: string | null
  editingCueId: string | null
  onRecallCue: (id: string) => void
  onEnterEditCue: (id: string) => void
  onExitEditCue: () => void
  onRenameCue: (id: string, name: string) => Promise<void>
  onDeleteCue: (id: string) => void
  onReorderCues: (draggedId: string, targetId: string) => void
  onOpenCues: () => void
}

type ActiveSection = 'nodes' | 'fixtures' | 'cues'

export function DMXSidebar({
  nodes, fixtures, selectedIds, multiSelectGroup, onSelect, onEdit, onDelete, onEditNode, onAdjustDMX,
  cues, activeCueId, editingCueId, onRecallCue, onEnterEditCue, onExitEditCue, onRenameCue, onDeleteCue, onReorderCues, onOpenCues,
}: DMXSidebarProps) {
  const [active, setActive] = useState<ActiveSection>('fixtures')
  const [renamingCueId, setRenamingCueId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [draggedCueId, setDraggedCueId] = useState<string | null>(null)
  const [dragOverCueId, setDragOverCueId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  return (
    <aside className="w-64 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">

      {/* ── Art-Net Nodes section ───────────────────────────────────── */}
      <div className="flex flex-col shrink-0" style={{ transition: 'flex 350ms cubic-bezier(0.4,0,0.2,1)' }}>
        {/* Header — always visible, clickable */}
        <button
          onClick={() => setActive('nodes')}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 ${
            active === 'nodes'
              ? 'border-b border-slate-800'
              : 'hover:bg-slate-800/40'
          }`}
        >
          <Network className={`w-3.5 h-3.5 transition-colors ${active === 'nodes' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'nodes' ? 'text-slate-400' : 'text-slate-600'}`}>
            Art-Net Nodes
          </span>
          {active !== 'nodes' && nodes.length > 0 && (
            <span className="ml-auto text-[10px] text-slate-700">{nodes.length}</span>
          )}
          <ChevronRight
            className={`w-3 h-3 ml-auto transition-transform duration-300 ${active === 'nodes' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`}
          />
        </button>

        {/* Body — expands/collapses */}
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
                    return (
                      <div key={node.id} className="rounded-lg bg-slate-800/50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-slate-200 truncate">{node.name}</div>
                          <button
                            onClick={() => onEditNode(node)}
                            className="text-slate-600 hover:text-slate-300 transition-colors shrink-0 ml-2"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">{node.ip_address}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {nodeFixtures.length} fixture{nodeFixtures.length !== 1 ? 's' : ''} · {node.universe_count} universe{node.universe_count !== 1 ? 's' : ''}
                        </div>
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
        {/* Header — always visible, clickable */}
        <button
          onClick={() => setActive('fixtures')}
          className={`flex items-center gap-2 px-4 py-3 text-left w-full transition-colors shrink-0 border-t border-slate-800 ${
            active === 'fixtures'
              ? 'border-b border-slate-800'
              : 'hover:bg-slate-800/40'
          }`}
        >
          <Layers className={`w-3.5 h-3.5 transition-colors ${active === 'fixtures' ? 'text-slate-400' : 'text-slate-600'}`} />
          <span className={`text-[10px] uppercase tracking-wider font-medium transition-colors ${active === 'fixtures' ? 'text-slate-400' : 'text-slate-600'}`}>
            Fixtures
          </span>
          <span className={`text-[10px] transition-colors ${active === 'fixtures' ? 'text-slate-600' : 'text-slate-700'}`}>
            ({fixtures.length})
          </span>
          <ChevronRight
            className={`w-3 h-3 ml-auto transition-transform duration-300 ${active === 'fixtures' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`}
          />
        </button>

        {/* Body — expands to fill remaining space */}
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
                <div className="space-y-1">
                  {fixtures.map((fixture) => {
                    const node = nodes.find((n) => n.id === fixture.node_id)
                    const isSelected = selectedIds.has(fixture.id)
                    const isGroupable = multiSelectGroup.has(fixture.id)
                    const isMultiSelectable = isGroupable && !isSelected

                    return (
                      <div
                        key={fixture.id}
                        className={`group relative rounded-lg px-3 py-2 border transition-colors cursor-pointer select-none ${
                          isSelected
                            ? 'bg-slate-700 border-transparent'
                            : isMultiSelectable
                            ? 'bg-slate-800/40 border-dashed border-slate-600/60 hover:border-slate-500/80 hover:bg-slate-800/70'
                            : 'border-transparent hover:bg-slate-800/70'
                        }`}
                        onClick={(e) => onSelect(fixture.id, e.shiftKey)}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="text-xs font-medium text-slate-200 truncate">
                            {fixture.label || fixture.name}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-px">
                            <button
                              onClick={(e) => { e.stopPropagation(); onAdjustDMX(); onSelect(fixture.id) }}
                              title="Adjust DMX channels"
                              className="text-slate-600 hover:text-blue-400 transition-colors"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(fixture) }}
                              title="Edit fixture"
                              className="text-slate-600 hover:text-slate-300 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {fixture.ofl_manufacturer && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {fixture.ofl_manufacturer}
                          </div>
                        )}
                        {fixture.ofl_model && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {fixture.ofl_model}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-slate-500">
                          U{fixture.universe} · Ch {fixture.start_channel}–{fixture.start_channel + fixture.channel_count - 1}
                        </div>
                        <div className="text-[9px] mt-0.5 truncate" style={{ visibility: node || isMultiSelectable ? 'visible' : 'hidden' }}>
                          {isMultiSelectable
                            ? <span className="text-slate-600">shift+click to add to selection</span>
                            : <span className="text-slate-700">{node?.name ?? '\u00a0'}</span>
                          }
                        </div>
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
          onClick={() => { setActive('cues'); if (active !== 'cues') onOpenCues() }}
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
          <ChevronRight
            className={`w-3 h-3 ml-auto transition-transform duration-300 ${active === 'cues' ? 'text-slate-500 rotate-90' : 'text-slate-700'}`}
          />
        </button>

        <div
          className="overflow-hidden flex-1"
          style={{
            display: 'grid',
            gridTemplateRows: active === 'cues' ? '1fr' : '0fr',
            transition: 'grid-template-rows 350ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="min-h-0 overflow-y-auto">
            <div className="px-4 py-3">
              {cues.length === 0 ? (
                <p className="text-xs text-slate-600">No cues saved yet. Pause signals and use "Save Cue" to capture the current state.</p>
              ) : (
                <div className="space-y-1">
                  {cues.map((cue) => {
                    const isActive = activeCueId === cue.id
                    const isEditing = editingCueId === cue.id
                    const isRenaming = renamingCueId === cue.id
                    const isDraggedOver = dragOverCueId === cue.id && draggedCueId !== cue.id

                    return (
                      <div
                        key={cue.id}
                        draggable
                        onClick={() => { if (!isEditing && !isRenaming) onRecallCue(cue.id) }}
                        onDragStart={(e) => {
                          setDraggedCueId(cue.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => {
                          setDraggedCueId(null)
                          setDragOverCueId(null)
                          dragCounter.current = 0
                        }}
                        onDragEnter={() => {
                          dragCounter.current++
                          setDragOverCueId(cue.id)
                        }}
                        onDragLeave={() => {
                          dragCounter.current--
                          if (dragCounter.current === 0) setDragOverCueId(null)
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          dragCounter.current = 0
                          setDragOverCueId(null)
                          if (draggedCueId && draggedCueId !== cue.id) {
                            onReorderCues(draggedCueId, cue.id)
                          }
                          setDraggedCueId(null)
                        }}
                        className={`group relative rounded-lg px-3 py-2 border transition-colors ${!isEditing && !isRenaming ? 'cursor-pointer' : ''} ${
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
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => {
                                if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim())
                                setRenamingCueId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim())
                                  setRenamingCueId(null)
                                }
                                if (e.key === 'Escape') setRenamingCueId(null)
                              }}
                              className={`flex-1 min-w-0 bg-slate-900 border rounded px-2 py-0.5 text-xs text-white focus:outline-none ${
                                isEditing ? 'border-indigo-500 focus:border-indigo-400' : 'border-slate-600 focus:border-amber-500'
                              }`}
                            />
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault()
                                if (renameValue.trim()) onRenameCue(cue.id, renameValue.trim())
                                setRenamingCueId(null)
                              }}
                              className="text-slate-400 hover:text-white transition-colors shrink-0"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              {/* Drag handle */}
                              <GripVertical className="w-3 h-3 text-slate-700 group-hover:text-slate-500 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />

                              {/* Name — clickable to rename only in edit mode */}
                              {isEditing ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRenamingCueId(cue.id); setRenameValue(cue.name) }}
                                  title="Click to rename"
                                  className="flex-1 min-w-0 text-xs font-medium text-indigo-300 hover:text-indigo-200 truncate text-left transition-colors cursor-text"
                                >
                                  {cue.name}
                                </button>
                              ) : (
                                <span className={`flex-1 min-w-0 text-xs font-medium truncate ${
                                  isActive ? 'text-amber-300' : 'text-slate-200'
                                }`}>
                                  {cue.name}
                                </span>
                              )}

                              {/* Actions */}
                              <div className={`flex items-center gap-1 shrink-0 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {isEditing ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onExitEditCue() }}
                                    title="Exit edit mode"
                                    className="text-indigo-400 hover:text-indigo-200 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onEnterEditCue(cue.id) }}
                                      title="Edit cue"
                                      className="text-slate-600 hover:text-indigo-400 transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onDeleteCue(cue.id) }}
                                      title="Delete cue"
                                      className="text-slate-600 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className={`text-[10px] mt-0.5 ${isEditing ? 'text-indigo-600' : isActive ? 'text-amber-700' : 'text-slate-600'}`}>
                              {isEditing ? 'Edit mode — adjust channels, then Update Cue' : isActive ? 'Active' : formatRelativeTime(cue.created_at)}
                            </div>
                          </>
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

    </aside>
  )
}
