'use client'

import { DMXFixture, DMXNode } from '@/lib/types'
import { Pencil, Network, Layers, SlidersHorizontal } from '@/components/icons'

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
}

export function DMXSidebar({ nodes, fixtures, selectedIds, multiSelectGroup, onSelect, onEdit, onDelete, onEditNode, onAdjustDMX }: DMXSidebarProps) {
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

      {/* Fixtures list */}
      <div className="px-4 py-3 flex-1">
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
    </aside>
  )
}
