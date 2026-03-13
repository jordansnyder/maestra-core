'use client'

import { useState } from 'react'
import { useDMX } from '@/hooks/useDMX'
import { DMXCanvas } from '@/components/dmx/DMXCanvas'
import { DMXSidebar } from '@/components/dmx/DMXSidebar'
import { NodeSetupForm } from '@/components/dmx/NodeSetupForm'
import { AddFixtureModal } from '@/components/dmx/AddFixtureModal'
import { DMXFixture, DMXNodeCreate } from '@/lib/types'
import { Zap, Plus, Network, Settings } from '@/components/icons'

type View = 'canvas' | 'add-node' | 'manage-nodes'

export default function DMXPage() {
  const { nodes, fixtures, loading, error, createNode, deleteNode, createFixture, updateFixture, deleteFixture, bulkUpdatePositions } = useDMX()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddFixture, setShowAddFixture] = useState(false)
  const [editingFixture, setEditingFixture] = useState<DMXFixture | null>(null)
  const [copyingFixture, setCopyingFixture] = useState<{ fixture: DMXFixture; name: string } | null>(null)
  const [view, setView] = useState<View>('canvas')
  const [actionError, setActionError] = useState<string | null>(null)

  const handleCopy = (fixture: DMXFixture) => {
    const existingNames = fixtures.map((f) => f.name)
    const base = fixture.name.replace(/ \d+$/, '')
    let n = 2
    while (existingNames.includes(`${base} ${n}`)) n++
    setCopyingFixture({ fixture, name: `${base} ${n}` })
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
  if (nodes.length === 0 && view !== 'add-node') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-8 p-8">
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
            onSubmit={async (data: DMXNodeCreate) => {
              await createNode(data)
              setView('canvas')
            }}
            submitLabel="Add Node & Continue"
          />
        </div>
      </div>
    )
  }

  // ── Add node view ──────────────────────────────────────────────────────────
  if (view === 'add-node') {
    return (
      <div className="flex-1 flex flex-col items-center justify-start bg-slate-950 p-8 overflow-y-auto">
        <div className="w-full max-w-xl">
          <button
            onClick={() => setView('canvas')}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4"
          >
            ← Back to canvas
          </button>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Network className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Add Art-Net Node</h2>
            </div>
            <NodeSetupForm
              onSubmit={async (data: DMXNodeCreate) => {
                await createNode(data)
                setView('canvas')
              }}
              onCancel={() => setView('canvas')}
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
        </div>
        <div className="flex items-center gap-2">
          {actionError && (
            <span className="text-xs text-red-400">{actionError}</span>
          )}
          <button
            onClick={() => setView('add-node')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Nodes
          </button>
          <button
            onClick={() => setShowAddFixture(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Fixture
          </button>
        </div>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0">
          <DMXCanvas
            fixtures={fixtures}
            nodes={nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={(fixture) => setEditingFixture(fixture)}
            onCopy={handleCopy}
            onDelete={async (id) => {
              try {
                setActionError(null)
                await deleteFixture(id)
                if (selectedId === id) setSelectedId(null)
              } catch (e) {
                setActionError(e instanceof Error ? e.message : 'Delete failed')
              }
            }}
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
          selectedFixtureId={selectedId}
          onSelect={setSelectedId}
          onEdit={(fixture) => setEditingFixture(fixture)}
          onDelete={async (id) => {
            try {
              setActionError(null)
              await deleteFixture(id)
              if (selectedId === id) setSelectedId(null)
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Delete failed')
            }
          }}
        />
      </div>

      {/* Add Fixture Modal */}
      {showAddFixture && (
        <AddFixtureModal
          nodes={nodes}
          defaultPosition={{ x: 300 + fixtures.length * 30, y: 200 + fixtures.length * 20 }}
          onSubmit={createFixture}
          onClose={() => setShowAddFixture(false)}
        />
      )}

      {/* Edit Fixture Modal */}
      {editingFixture && (
        <AddFixtureModal
          nodes={nodes}
          fixture={editingFixture}
          onSubmit={async (data) => {
            await updateFixture(editingFixture.id, data)
            setEditingFixture(null)
          }}
          onClose={() => setEditingFixture(null)}
        />
      )}

      {/* Copy Fixture Modal */}
      {copyingFixture && (
        <AddFixtureModal
          nodes={nodes}
          copyOf={copyingFixture.fixture}
          initialName={copyingFixture.name}
          onSubmit={async (data) => {
            await createFixture(data)
            setCopyingFixture(null)
          }}
          onClose={() => setCopyingFixture(null)}
        />
      )}
    </div>
  )
}
