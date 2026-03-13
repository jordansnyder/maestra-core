'use client'

import Link from 'next/link'
import { DMXFixture, DMXNode } from '@/lib/types'
import { Pencil, Trash2, Network, Layers, ExternalLink } from '@/components/icons'

interface DMXSidebarProps {
  nodes: DMXNode[]
  fixtures: DMXFixture[]
  selectedFixtureId: string | null
  onSelect: (id: string | null) => void
  onEdit: (fixture: DMXFixture) => void
  onDelete: (id: string) => void
}

export function DMXSidebar({ nodes, fixtures, selectedFixtureId, onSelect, onEdit, onDelete }: DMXSidebarProps) {
  const selectedFixture = fixtures.find((f) => f.id === selectedFixtureId) ?? null
  const selectedNode = selectedFixture ? nodes.find((n) => n.id === selectedFixture.node_id) : null

  return (
    <aside className="w-64 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto">
      {/* Nodes section */}
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Art-Net Nodes</span>
        </div>
        {nodes.length === 0 ? (
          <p className="text-xs text-slate-600">No nodes configured</p>
        ) : (
          <div className="space-y-1.5">
            {nodes.map((node) => {
              const nodeFixtures = fixtures.filter((f) => f.node_id === node.id)
              return (
                <div key={node.id} className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-200 truncate">{node.name}</div>
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

      {/* Fixtures list */}
      <div className="px-4 py-3 border-b border-slate-800 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
            Fixtures ({fixtures.length})
          </span>
        </div>
        {fixtures.length === 0 ? (
          <p className="text-xs text-slate-600">No fixtures added yet</p>
        ) : (
          <div className="space-y-1">
            {fixtures.map((fixture) => {
              const node = nodes.find((n) => n.id === fixture.node_id)
              const isSelected = fixture.id === selectedFixtureId
              return (
                <button
                  key={fixture.id}
                  className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                    isSelected ? 'bg-slate-700' : 'hover:bg-slate-800/70'
                  }`}
                  onClick={() => onSelect(fixture.id)}
                >
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {fixture.label || fixture.name}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    U{fixture.universe} · Ch {fixture.start_channel}–{fixture.start_channel + fixture.channel_count - 1}
                  </div>
                  {node && (
                    <div className="text-[9px] text-slate-700 truncate">{node.name}</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected fixture detail */}
      {selectedFixture && (
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-3">
            Selected Fixture
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Name</span>
              <span className="text-slate-200 font-medium">{selectedFixture.name}</span>
            </div>
            {selectedFixture.label && (
              <div className="flex justify-between">
                <span className="text-slate-500">Label</span>
                <span className="text-slate-200">{selectedFixture.label}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Universe</span>
              <span className="text-slate-200 font-mono">{selectedFixture.universe}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Start Ch</span>
              <span className="text-slate-200 font-mono">{selectedFixture.start_channel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Channels</span>
              <span className="text-slate-200 font-mono">{selectedFixture.channel_count}</span>
            </div>
            {selectedFixture.fixture_mode && (
              <div className="flex justify-between">
                <span className="text-slate-500">Mode</span>
                <span className="text-slate-200">{selectedFixture.fixture_mode}</span>
              </div>
            )}
            {selectedNode && (
              <div className="flex justify-between">
                <span className="text-slate-500">Node</span>
                <span className="text-slate-200 truncate ml-2">{selectedNode.name}</span>
              </div>
            )}
            {(selectedFixture.manufacturer || selectedFixture.model) && (
              <div className="flex justify-between">
                <span className="text-slate-500">Device</span>
                <span className="text-slate-200 truncate ml-2">
                  {[selectedFixture.manufacturer, selectedFixture.model].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
          </div>

          {/* Entity link shortcut */}
          {selectedFixture.entity_id ? (
            <Link
              href={`/entities/${selectedFixture.entity_id}`}
              className="mt-3 flex items-center justify-between w-full px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 hover:bg-amber-900/30 transition-colors group"
            >
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-amber-600 font-medium">Linked Entity</div>
                <div className="text-[10px] text-amber-400 font-mono truncate">{selectedFixture.entity_id.slice(0, 8)}…</div>
              </div>
              <ExternalLink className="w-3 h-3 text-amber-600 group-hover:text-amber-400 shrink-0 ml-2" />
            </Link>
          ) : (
            <div className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              <span className="text-[10px] text-slate-600">No entity linked</span>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onEdit(selectedFixture)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={() => onDelete(selectedFixture.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
