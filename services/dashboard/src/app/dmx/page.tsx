'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useDMX } from '@/hooks/useDMX'
import { DMXCanvas } from '@/components/dmx/DMXCanvas'
import { DMXSidebar } from '@/components/dmx/DMXSidebar'
import { NodeSetupForm } from '@/components/dmx/NodeSetupForm'
import { AddFixtureModal } from '@/components/dmx/AddFixtureModal'
import { DMXFixture, DMXNode, DMXNodeCreate, OFLSyncStatus, DMXCue, DMXSequence, DMXCuePlacement } from '@/lib/types'
import { DMXChannelModal } from '@/components/dmx/DMXChannelModal'
import { Zap, Network, X, Trash2, Pause, Play, AlertTriangle, ZapOff } from '@/components/icons'
import { oflApi, entitiesApi, devicesApi, dmxApi, playbackApi } from '@/lib/api'
import { DeleteFixtureDialog } from '@/components/dmx/DeleteFixtureDialog'
import { useSequencePlayback } from '@/hooks/useSequencePlayback'
import { useCueFade } from '@/hooks/useCueFade'
import { useWebSocket } from '@/hooks/useWebSocket'

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

const NODE_SCALES: { label: string; diameter: number }[] = [
  { label: 'S', diameter: 32 },
  { label: 'M', diameter: 58 },
  { label: 'L', diameter: 88 },
]

function getInitialScale(): number {
  if (typeof window === 'undefined') return 58
  const stored = localStorage.getItem('dmx-node-scale')
  if (stored) {
    const n = Number(stored)
    if (NODE_SCALES.some((s) => s.diameter === n)) return n
  }
  return 58
}

export default function DMXPage() {
  const { nodes, fixtures, loading, error, createNode, updateNode, deleteNode, createFixture, updateFixture, deleteFixture, bulkUpdatePositions, reorderNodes, reorderFixtures } = useDMX()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDMXAdjust, setShowDMXAdjust] = useState(false)
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddFixture, setShowAddFixture] = useState(false)
  const [editingFixture, setEditingFixture] = useState<DMXFixture | null>(null)
  const [nodeDiameter, setNodeDiameter] = useState<number>(getInitialScale)
  const [editingNode, setEditingNode] = useState<DMXNode | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<OFLSyncStatus | null>(null)
  const [deletingFixture, setDeletingFixture] = useState<DMXFixture | null>(null)
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(false)
  const [deleteNodeDevice, setDeleteNodeDevice] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)
  const [cues, setCues] = useState<DMXCue[]>([])
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  const [editingCueId, setEditingCueId] = useState<string | null>(null)
  const [updateCueLoading, setUpdateCueLoading] = useState(false)
  const [sequences, setSequences] = useState<DMXSequence[]>([])
  const [deleteSequenceTarget, setDeleteSequenceTarget] = useState<DMXSequence | null>(null)
  const [openSequencesSignal, setOpenSequencesSignal] = useState(0)
  const { status: playbackStatus, play: playSequence, pause: pauseSequence, resume: resumeSequence, stop: stopSequence, toggleLoop, fadeOut, startPolling: startPlaybackPolling } = useSequencePlayback()
  const { fadeProgress: cueFadeProgress, fadeTo: fadeCueTo, cancelFade: cancelCueFade, trackExternalFade } = useCueFade()

  // Real-time sync: subscribe to dmx-lighting entity state changes for external control
  const { lastMessage: wsMessage, subscribe: wsSubscribe, isConnected: wsConnected } = useWebSocket()
  useEffect(() => {
    if (wsConnected) wsSubscribe('maestra.entity.state.dmx_controller.dmx-lighting')
  }, [wsConnected, wsSubscribe])
  useEffect(() => {
    if (!wsMessage) return
    const event = (wsMessage.data ?? {}) as Record<string, unknown>
    if (event.type !== 'state_changed') return
    const state = (event.current_state ?? {}) as Record<string, unknown>
    const externalSequenceId = (state.active_sequence_id as string | null) ?? null
    const externalCueId = (state.active_cue_id as string | null) ?? null

    if (externalSequenceId) {
      // A sequence is active — start polling so the sidebar reflects backend playback state
      startPlaybackPolling()
      return
    }

    // No active sequence — only sync cue highlight for non-engine events
    // (engine events during sequence playback would otherwise flicker the cue selection)
    if (event.source !== 'dmx-engine') {
      setActiveCueId(externalCueId)
      if (externalCueId) {
        // Track any ongoing fade progress without re-triggering the API
        trackExternalFade()
      }
    }
  }, [wsMessage, startPlaybackPolling, trackExternalFade])

  // Multi-select group: fixtures with same OFL profile + universe as primary selection
  const primaryId = selectedIds.size > 0 ? [...selectedIds][0] : null
  const multiSelectGroup = useMemo(() => {
    if (!primaryId) return new Set<string>()
    const primary = fixtures.find((f) => f.id === primaryId)
    if (!primary?.ofl_fixture_id) return new Set<string>()
    return new Set(
      fixtures
        .filter((f) => f.ofl_fixture_id === primary.ofl_fixture_id && f.universe === primary.universe)
        .map((f) => f.id)
    )
  }, [primaryId, fixtures])

  const handleSelect = useCallback((id: string | null, shiftKey = false) => {
    if (!id) { setSelectedIds(new Set()); return }
    const clicked = fixtures.find((f) => f.id === id)
    if (!clicked) return

    if (!shiftKey) {
      // Plain click → select only this fixture
      setSelectedIds(new Set([id]))
      return
    }

    // Shift-click → add/remove from multi-select if same OFL profile + universe
    setSelectedIds((prev) => {
      if (prev.size === 0) return new Set([id])
      const primaryFixture = fixtures.find((f) => f.id === [...prev][0])
      if (
        primaryFixture?.ofl_fixture_id &&
        clicked.ofl_fixture_id === primaryFixture.ofl_fixture_id &&
        clicked.universe === primaryFixture.universe
      ) {
        const next = new Set(prev)
        if (next.has(id) && next.size > 1) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      }
      // Different group → select only this one
      return new Set([id])
    })
  }, [fixtures])

  // Selected fixture objects (for the DMX adjust modal)
  const selectedFixtures = fixtures.filter((f) => selectedIds.has(f.id))

  useEffect(() => {
    oflApi.getSyncStatus().then(setSyncStatus).catch(() => {})
    dmxApi.getPauseState().then((r) => setIsPaused(r.paused)).catch(() => {})
    dmxApi.listCues().then(setCues).catch(() => {})
    dmxApi.listSequences().then(setSequences).catch(() => {})

    // Restore live playback state on mount — covers the case where the page loads
    // while a sequence or cue is already running (WebSocket events may not fire
    // during the hold phase between cue transitions)
    Promise.all([
      playbackApi.getStatus().catch(() => null),
      entitiesApi.getBySlug('dmx-lighting').catch(() => null),
    ]).then(([status, entity]) => {
      if (status && (status.play_state !== 'stopped' || status.phase !== 'idle')) {
        startPlaybackPolling()
      }
      if (entity?.state) {
        const s = entity.state as Record<string, unknown>
        const cueId = (s.active_cue_id as string | null) ?? null
        if (cueId && (!status || status.play_state === 'stopped')) {
          setActiveCueId(cueId)
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setScale = (diameter: number) => {
    setNodeDiameter(diameter)
    localStorage.setItem('dmx-node-scale', String(diameter))
  }

  const handleTogglePause = async () => {
    setPauseLoading(true)
    try {
      const result = isPaused ? await dmxApi.resumeOutput() : await dmxApi.pauseOutput()
      setIsPaused(result.paused)
    } catch {
      // silently ignore — state remains unchanged
    } finally {
      setPauseLoading(false)
    }
  }

  const handleBlackoutAndPause = async () => {
    setPauseLoading(true)
    try {
      if (!isPaused) {
        const result = await dmxApi.pauseOutput()
        setIsPaused(result.paused)
      }
      await playbackApi.blackout()
    } catch {
      // silently ignore
    } finally {
      setPauseLoading(false)
    }
  }

  const handleRecallCue = async (id: string, fadeDuration: number = 0) => {
    // Toggle: clicking an already-active cue deselects it
    if (activeCueId === id) {
      setActiveCueId(null)
      cancelCueFade()
      return
    }
    // If we're editing a different cue, exit that edit mode
    if (editingCueId && editingCueId !== id) setEditingCueId(null)
    setActiveCueId(id)
    try {
      await fadeCueTo(activeCueId, id, fadeDuration * 1000)
    } catch {
      // silently ignore — partial recall is acceptable
    }
  }

  const handleEnterEditCue = async (id: string) => {
    // Recall the cue so DMX state matches, then enter edit mode
    try {
      await dmxApi.recallCue(id)
    } catch { /* silently ignore */ }
    setEditingCueId(id)
    setActiveCueId(null)
  }

  const handleExitEditCue = () => {
    setEditingCueId(null)
  }

  const handleUpdateCue = async () => {
    if (!editingCueId) return
    setUpdateCueLoading(true)
    try {
      const updated = await dmxApi.updateCueSnapshot(editingCueId)
      setCues((prev) => prev.map((c) => (c.id === editingCueId ? updated : c)))
      setActiveCueId(editingCueId)
      setEditingCueId(null)
    } catch {
      // silently ignore
    } finally {
      setUpdateCueLoading(false)
    }
  }

  const handleDMXChannelChange = useCallback(() => {
    // Clear active cue highlight on any slider change (unless in edit mode)
    if (editingCueId === null) setActiveCueId(null)
  }, [editingCueId])

  const handleRenameCue = async (id: string, name: string) => {
    try {
      const updated = await dmxApi.renameCue(id, name)
      setCues((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch {
      // silently ignore
    }
  }

  const handleDeleteCue = async (id: string) => {
    try {
      await dmxApi.deleteCue(id)
      setCues((prev) => prev.filter((c) => c.id !== id))
      if (activeCueId === id) setActiveCueId(null)
      if (editingCueId === id) setEditingCueId(null)
    } catch {
      // silently ignore
    }
  }

  // ── Sequence handlers ──────────────────────────────────────────────────────

  const handleCreateSequence = async () => {
    const names = sequences.map((s) => s.name)
    let base = 'New Sequence'; let n = 1
    while (names.includes(n === 1 ? base : `${base} ${n}`)) n++
    const name = n === 1 ? base : `${base} ${n}`
    try {
      const seq = await dmxApi.createSequence(name)
      setSequences((prev) => [...prev, seq])
      setOpenSequencesSignal((s) => s + 1)
    } catch (err) { console.error('Failed to create sequence:', err) }
  }

  const handleRenameSequence = async (id: string, name: string) => {
    try {
      const updated = await dmxApi.renameSequence(id, name)
      setSequences((prev) => prev.map((s) => (s.id === id ? updated : s)))
    } catch { /* silently ignore */ }
  }

  const handleDeleteSequence = async (id: string) => {
    try {
      await dmxApi.deleteSequence(id)
      setSequences((prev) => prev.filter((s) => s.id !== id))
      if (playbackStatus.sequenceId === id) stopSequence()
      setDeleteSequenceTarget(null)
    } catch { /* silently ignore */ }
  }

  const handleRequestDeleteSequence = (seq: DMXSequence) => {
    if (seq.cue_placements.length > 0) {
      setDeleteSequenceTarget(seq)
    } else {
      handleDeleteSequence(seq.id)
    }
  }

  const handleReorderSequences = async (draggedId: string, targetId: string) => {
    const di = sequences.findIndex((s) => s.id === draggedId)
    const ti = sequences.findIndex((s) => s.id === targetId)
    if (di === ti || di === -1 || ti === -1) return
    const next = [...sequences]
    const [removed] = next.splice(di, 1)
    next.splice(ti, 0, removed)
    setSequences(next)
    await dmxApi.reorderSequences(next.map((s) => s.id)).catch(() => {})
  }

  const handleAddCueToSequence = async (sequenceId: string, cueId: string) => {
    try {
      const placements = await dmxApi.addCueToSequence(sequenceId, cueId)
      setSequences((prev) => prev.map((s) => (s.id === sequenceId ? { ...s, cue_placements: placements } : s)))
    } catch { /* silently ignore */ }
  }

  const handleReorderSequenceCues = async (sequenceId: string, draggedId: string, targetId: string) => {
    const seq = sequences.find((s) => s.id === sequenceId)
    if (!seq) return
    const di = seq.cue_placements.findIndex((p) => p.id === draggedId)
    const ti = seq.cue_placements.findIndex((p) => p.id === targetId)
    if (di === ti || di === -1 || ti === -1) return
    const next = [...seq.cue_placements]
    const [removed] = next.splice(di, 1)
    next.splice(ti, 0, removed)
    setSequences((prev) => prev.map((s) => (s.id === sequenceId ? { ...s, cue_placements: next } : s)))
    await dmxApi.reorderSequenceCues(sequenceId, next.map((p) => p.id)).catch(() => {})
  }

  const handleUpdatePlacement = async (sequenceId: string, placementId: string, data: { transition_time?: number; hold_duration?: number }) => {
    try {
      const placements = await dmxApi.updateCuePlacement(sequenceId, placementId, data)
      setSequences((prev) => prev.map((s) => (s.id === sequenceId ? { ...s, cue_placements: placements } : s)))
    } catch { /* silently ignore */ }
  }

  const handleRemoveCueFromSequence = async (sequenceId: string, placementId: string) => {
    try {
      const placements = await dmxApi.removeCueFromSequence(sequenceId, placementId)
      setSequences((prev) => prev.map((s) => (s.id === sequenceId ? { ...s, cue_placements: placements } : s)))
    } catch { /* silently ignore */ }
  }

  const handlePlaySequence = (seq: DMXSequence) => {
    if (playbackStatus.sequenceId === seq.id && playbackStatus.playState === 'paused') {
      resumeSequence()
    } else {
      playSequence(seq)
    }
  }

  const handleReorderCues = async (draggedId: string, targetId: string) => {
    const draggedIdx = cues.findIndex((c) => c.id === draggedId)
    const targetIdx = cues.findIndex((c) => c.id === targetId)
    if (draggedIdx === targetIdx || draggedIdx === -1 || targetIdx === -1) return
    const next = [...cues]
    const [removed] = next.splice(draggedIdx, 1)
    next.splice(targetIdx, 0, removed)
    setCues(next)
    await dmxApi.reorderCues(next.map((c) => c.id)).catch(() => {})
  }

  const handleClearDMX = async () => {
    setClearLoading(true)
    try {
      await dmxApi.clearOutput()
    } catch {
      // silently ignore — zeros were best-effort
    } finally {
      setClearLoading(false)
      setShowClearConfirm(false)
    }
  }


  const handleDeleteRequest = (id: string) => {
    const fixture = fixtures.find((f) => f.id === id)
    if (fixture) setDeletingFixture(fixture)
  }

  const handleDeleteConfirm = async (deleteEntity: boolean) => {
    if (!deletingFixture) return
    try {
      setActionError(null)
      await deleteFixture(deletingFixture.id)
      if (deleteEntity && deletingFixture.entity_id) {
        await entitiesApi.delete(deletingFixture.entity_id)
      }
      if (selectedIds.has(deletingFixture.id)) {
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(deletingFixture.id); return next })
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingFixture(null)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-slate-500 text-sm">Loading DMX configuration…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  // ── First-run gate: no Art-Net nodes configured ────────────────────────────
  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-900/30 border border-amber-800/50 flex items-center justify-center">
            <Zap className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Set Up DMX Lighting</h1>
          <p className="text-slate-400 text-sm max-w-md">
            Configure an Art-Net node (hardware DMX converter) to get started. Maestra will send DMX universe data
            to this device over your local network.
          </p>
        </div>

        <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Network className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Add Your First Art-Net Node</h2>
          </div>
          <NodeSetupForm
            onSubmit={async (data: DMXNodeCreate) => { await createNode(data) }}
            submitLabel="Add Node & Continue"
          />
        </div>
      </div>
      </div>
    )
  }

  // ── Main canvas view ───────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">DMX Lighting</span>
          <span className="text-xs text-slate-600">
            {fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} · {nodes.length} node{nodes.length !== 1 ? 's' : ''}
          </span>
          {syncStatus && (
            <span className="text-xs text-slate-600 ml-2 pl-2 border-l border-slate-800">
              OFL synced {formatRelativeTime(syncStatus.ran_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actionError && (
            <span className="text-xs text-red-400">{actionError}</span>
          )}

          {/* DMX Pause / Resume / Clear */}
          <div className="flex items-center rounded-lg overflow-hidden border border-slate-700">
            <button
              onClick={handleTogglePause}
              disabled={pauseLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                isPaused
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isPaused
                ? <><Play className="w-3 h-3" /> Resume Listening</>
                : <><Pause className="w-3 h-3" /> Pause</>
              }
            </button>
            {isPaused && (
              <>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={clearLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-slate-800 hover:bg-red-900/30 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </>
            )}
          </div>
          {isPaused && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              External signals paused
            </span>
          )}

          {/* Global Blackout */}
          <button
            onClick={() => playbackApi.blackout().catch(() => {})}
            onDoubleClick={(e) => { e.preventDefault(); handleBlackoutAndPause() }}
            title="Blackout — double-click to blackout and pause"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-yellow-300 hover:border-yellow-700/50 hover:bg-yellow-900/20 transition-colors"
          >
            <ZapOff className="w-3 h-3" />
            Blackout
          </button>

          {/* Node scale picker */}
          <div className="flex items-center rounded-lg overflow-hidden border border-slate-700">
            {NODE_SCALES.map((scale) => (
              <button
                key={scale.label}
                onClick={() => setScale(scale.diameter)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  nodeDiameter === scale.diameter
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {scale.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0">
          <DMXCanvas
            fixtures={fixtures}
            nodes={nodes}
            nodeSize={nodeDiameter}
            selectedIds={selectedIds}
            multiSelectGroup={multiSelectGroup}
            onSelect={handleSelect}
            onEdit={(fixture) => setEditingFixture(fixture)}
            onDelete={handleDeleteRequest}
            onAdjustDMX={() => setShowDMXAdjust(true)}
            onPositionsChange={async (positions) => {
              try {
                await bulkUpdatePositions(positions)
              } catch {
                // position save failure is non-critical, ignore silently
              }
            }}
          />
        </div>
        <DMXSidebar
          nodes={nodes}
          fixtures={fixtures}
          selectedIds={selectedIds}
          multiSelectGroup={multiSelectGroup}
          onSelect={handleSelect}
          onEdit={(fixture) => setEditingFixture(fixture)}
          onDelete={handleDeleteRequest}
          onEditNode={(node) => { setEditingNode(node); setConfirmDeleteNode(false) }}
          onAdjustDMX={() => setShowDMXAdjust(true)}
          isPaused={isPaused}
          onAddNode={() => setShowAddNode(true)}
          onAddFixture={() => setShowAddFixture(true)}
          onReorderNodes={reorderNodes}
          onReorderFixtures={reorderFixtures}
          cues={cues}
          activeCueId={activeCueId}
          editingCueId={editingCueId}
          cueFadeProgress={cueFadeProgress}
          onRecallCue={handleRecallCue}
          onEnterEditCue={handleEnterEditCue}
          onExitEditCue={handleExitEditCue}
          onRenameCue={handleRenameCue}
          onDeleteCue={handleDeleteCue}
          onReorderCues={handleReorderCues}
          onOpenCues={() => dmxApi.listCues().then(setCues).catch(() => {})}
          onSaveCue={async (name) => { const cue = await dmxApi.saveCue(name); setCues((prev) => [cue, ...prev]) }}
          onUpdateCue={handleUpdateCue}
          updateCueLoading={updateCueLoading}
          sequences={sequences}
          playbackStatus={playbackStatus}
          onPlaySequence={handlePlaySequence}
          onPauseSequence={pauseSequence}
          onStopSequence={stopSequence}
          onToggleLoop={toggleLoop}
          onFadeOut={(durationSec) => fadeOut(durationSec * 1000)}
          onBlackout={() => playbackApi.blackout().catch(() => {})}
          onRenameSequence={handleRenameSequence}
          onDeleteSequence={handleRequestDeleteSequence}
          onReorderSequences={handleReorderSequences}
          onAddCueToSequence={handleAddCueToSequence}
          onReorderSequenceCues={handleReorderSequenceCues}
          onUpdatePlacement={handleUpdatePlacement}
          onRemoveCueFromSequence={handleRemoveCueFromSequence}
          onOpenSequences={() => dmxApi.listSequences().then(setSequences).catch(() => {})}
          openSequencesSignal={openSequencesSignal}
          availableCues={cues}
          onCreateSequence={handleCreateSequence}
        />
      </div>

      {/* Add Node Modal */}
      {showAddNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Add Art-Net Node</h2>
              </div>
              <button onClick={() => setShowAddNode(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <NodeSetupForm
                onSubmit={async (data: DMXNodeCreate) => {
                  await createNode(data)
                  setShowAddNode(false)
                }}
                onCancel={() => setShowAddNode(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Node Modal */}
      {editingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Edit Art-Net Node</h2>
              </div>
              <button
                onClick={() => { setEditingNode(null); setConfirmDeleteNode(false); setDeleteNodeDevice(false) }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 max-h-[80vh] overflow-y-auto">
              <NodeSetupForm
                node={editingNode}
                onSubmit={async (data) => {
                  await updateNode(editingNode.id, data)
                  setEditingNode(null)
                }}
                onCancel={() => { setEditingNode(null); setConfirmDeleteNode(false); setDeleteNodeDevice(false) }}
              />

              {/* Linked device badge */}
              {editingNode.device_id && (
                <a
                  href={`/devices/${editingNode.device_id}`}
                  className="mt-4 flex items-center justify-between w-full px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800/40 hover:bg-blue-900/30 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-blue-600 font-medium">Linked Device</div>
                    <div className="text-[10px] text-blue-400 font-mono truncate">{editingNode.device_id.slice(0, 8)}…</div>
                  </div>
                  <Network className="w-3 h-3 text-blue-600 group-hover:text-blue-400 shrink-0 ml-2" />
                </a>
              )}

              {/* Delete node */}
              <div className="mt-5 pt-4 border-t border-slate-800">
                {!confirmDeleteNode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteNode(true)
                      setDeleteNodeDevice(!!editingNode.device_id)
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-900/20 border border-slate-800 hover:border-red-900/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Node
                  </button>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const nodeFixtureCount = fixtures.filter((f) => f.node_id === editingNode.id).length
                      if (nodeFixtureCount > 0) {
                        return (
                          <p className="text-xs text-amber-400 text-center">
                            This node has {nodeFixtureCount} fixture{nodeFixtureCount !== 1 ? 's' : ''} assigned. Delete all fixtures before removing this node.
                          </p>
                        )
                      }
                      return (
                        <>
                          <p className="text-xs text-red-400 text-center">
                            Delete <span className="font-medium">{editingNode.name}</span>? This cannot be undone.
                          </p>
                          {editingNode.device_id && (
                            <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                              <input
                                type="checkbox"
                                checked={deleteNodeDevice}
                                onChange={(e) => setDeleteNodeDevice(e.target.checked)}
                                className="w-3.5 h-3.5 rounded accent-red-500 shrink-0"
                              />
                              <span className="text-xs text-slate-400">Also delete the linked device</span>
                            </label>
                          )}
                        </>
                      )
                    })()}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteNode(false); setDeleteNodeDevice(false) }}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={fixtures.some((f) => f.node_id === editingNode.id)}
                        onClick={async () => {
                          const deviceId = editingNode.device_id
                          try {
                            await deleteNode(editingNode.id)
                            if (deleteNodeDevice && deviceId) {
                              await devicesApi.delete(deviceId)
                            }
                            setEditingNode(null)
                            setConfirmDeleteNode(false)
                            setDeleteNodeDevice(false)
                          } catch (e) {
                            setActionError(e instanceof Error ? e.message : 'Delete failed')
                            setConfirmDeleteNode(false)
                          }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete Node
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Fixture Modal */}
      {showAddFixture && (
        <AddFixtureModal
          nodes={nodes}
          fixtures={fixtures}
          defaultPosition={{ x: 300 + fixtures.length * 30, y: 200 + fixtures.length * 20 }}
          onSubmit={createFixture}
          onClose={() => setShowAddFixture(false)}
        />
      )}

      {/* Edit Fixture Modal */}
      {editingFixture && (
        <AddFixtureModal
          nodes={nodes}
          fixtures={fixtures}
          fixture={editingFixture}
          onSubmit={async (data) => {
            await updateFixture(editingFixture.id, data)
            setEditingFixture(null)
          }}
          onClose={() => setEditingFixture(null)}
        />
      )}


      {/* Delete Fixture Confirmation */}
      {deletingFixture && (
        <DeleteFixtureDialog
          fixture={deletingFixture}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingFixture(null)}
        />
      )}

      {/* DMX Channel Adjust Modal */}
      {showDMXAdjust && selectedFixtures.length > 0 && (
        <DMXChannelModal
          fixtures={selectedFixtures}
          onClose={() => setShowDMXAdjust(false)}
          onDMXChannelChange={handleDMXChannelChange}
        />
      )}

      {/* Delete Sequence Confirmation */}
      {deleteSequenceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-red-900/40 border border-red-800/50 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Delete Sequence</h2>
                <p className="text-xs text-slate-400 mt-0.5">Contains {deleteSequenceTarget.cue_placements.length} cue{deleteSequenceTarget.cue_placements.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-300">
                Delete <span className="font-medium text-white">{deleteSequenceTarget.name}</span>? The cues inside will not be deleted, only removed from this sequence.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setDeleteSequenceTarget(null)} className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={() => handleDeleteSequence(deleteSequenceTarget.id)} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white transition-colors">Delete Sequence</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear DMX Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-red-900/40 border border-red-800/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Clear All DMX Output</h2>
                <p className="text-xs text-slate-400 mt-0.5">This will zero all channels</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-300">
                All DMX channel values for every configured fixture and universe will be set to <span className="font-medium text-white">0</span>.
                This affects live hardware immediately.
              </p>
              <p className="text-xs text-slate-500">
                You can restore values by using the Adjust DMX sliders or resuming external signals.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDMX}
                disabled={clearLoading}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {clearLoading ? 'Clearing…' : 'Clear All Channels'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
