'use client'

import { useState, useCallback } from 'react'
import { Route, DEVICES, DEFAULT_ROUTES } from './types'
import { NodeGraphView } from './NodeGraphView'
import { MatrixView } from './MatrixView'
import { RackView } from './RackView'

type ViewId = 'nodes' | 'matrix' | 'rack'

const VIEWS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'nodes', label: 'Node Graph', icon: '\u25C7' },
  { id: 'matrix', label: 'Matrix Router', icon: '\u25A6' },
  { id: 'rack', label: 'Rack View', icon: '\u25A4' },
]

const STATUS_HINTS: Record<ViewId, string> = {
  nodes: 'Drag outputs \u2192 inputs to create routes \u00B7 Drag nodes to reposition',
  matrix: 'Click crosspoints to toggle routes \u00B7 Lit = active',
  rack: 'Read-only topology overview \u00B7 Route in Node or Matrix view',
}

export function MaestraRouter() {
  const [view, setView] = useState<ViewId>('nodes')
  const [routes, setRoutes] = useState<Route[]>(DEFAULT_ROUTES)

  const addRoute = useCallback((route: Route) => {
    setRoutes((r) => [...r, route])
  }, [])

  const removeRoute = useCallback((route: Route) => {
    setRoutes((r) => r.filter((x) => !(x.from === route.from && x.fromPort === route.fromPort && x.to === route.to && x.toPort === route.toPort)))
  }, [])

  return (
    <div className="flex flex-col h-full font-mono text-slate-200">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0c0c16]">
        <div className="flex items-center gap-3">
          <span className="text-xl text-purple-400">{'\u2726'}</span>
          <span className="text-base font-bold tracking-tight text-slate-100">MAESTRA</span>
          <span className="text-[11px] text-slate-600 font-normal">/ Device Router</span>
        </div>

        {/* View switcher */}
        <div className="flex gap-0.5 bg-[#12121f] rounded-lg p-[3px]">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[11px] font-mono cursor-pointer transition-all duration-200 ${
                view === v.id
                  ? 'bg-[#1e1e32] border border-slate-700 text-slate-200'
                  : 'bg-transparent border border-transparent text-slate-600 hover:text-slate-400'
              }`}
            >
              <span className="text-sm">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] text-slate-600">
            {routes.length} routes &middot; {DEVICES.length} devices
          </span>
          <button
            onClick={() => setRoutes([])}
            className="bg-red-950/50 border border-red-900/40 text-red-400 rounded-md px-3 py-1 text-[10px] font-mono cursor-pointer hover:bg-red-900/30 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden relative bg-[#09090f]">
        {view === 'nodes' && <NodeGraphView routes={routes} onAddRoute={addRoute} onRemoveRoute={removeRoute} />}
        {view === 'matrix' && <MatrixView routes={routes} onAddRoute={addRoute} onRemoveRoute={removeRoute} />}
        {view === 'rack' && <RackView routes={routes} />}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-slate-800 bg-[#0c0c16] text-[10px] text-slate-600">
        <span>{STATUS_HINTS[view]}</span>
        <span>Maestra v0.1 &middot; Device Ecosystem Router</span>
      </div>
    </div>
  )
}
