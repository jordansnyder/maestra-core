'use client'

import { useState, useCallback, useMemo } from 'react'
import { Route, RoutingDevice } from './types'
import { NodeGraphView } from './NodeGraphView'
import { MatrixView } from './MatrixView'
import { RackView } from './RackView'
import { useRouting } from '@/hooks/useRouting'
import { checkSignalCompatibility, detectLoop, checkPortCapacity } from './validation'
import { useToast } from '@/components/Toast'
import type { RouteCreate } from '@/lib/types'

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
  const { confirm } = useToast()
  const [view, setView] = useState<ViewId>('nodes')
  const [showPresets, setShowPresets] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [warnings, setWarnings] = useState<{ id: number; message: string; level: 'warn' | 'info' }[]>([])
  let warningId = 0

  const addWarning = (message: string, level: 'warn' | 'info' = 'warn') => {
    const id = ++warningId
    setWarnings((prev) => [...prev, { id, message, level }])
    setTimeout(() => setWarnings((prev) => prev.filter((w) => w.id !== id)), 4000)
  }

  const {
    devices: apiDevices,
    routes: apiRoutes,
    presets,
    loading,
    error,
    addRoute,
    removeRoute,
    clearRoutes,
    createPreset,
    deletePreset,
    saveToPreset,
    recallPreset,
    savePositions,
  } = useRouting()

  // Map API devices to component RoutingDevice shape (device_type -> type)
  const devices: RoutingDevice[] = useMemo(() =>
    apiDevices.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.device_type,
      icon: d.icon,
      color: d.color,
      inputs: d.inputs,
      outputs: d.outputs,
    })),
    [apiDevices]
  )

  // Map API routes to component Route shape
  const routes: Route[] = useMemo(() =>
    apiRoutes.map((r) => ({
      id: r.id,
      from: r.from,
      fromPort: r.fromPort,
      to: r.to,
      toPort: r.toPort,
    })),
    [apiRoutes]
  )

  // Build initial positions from API device data
  const initialPositions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    apiDevices.forEach((d) => {
      if (d.position_x !== 0 || d.position_y !== 0) {
        pos[d.id] = { x: d.position_x, y: d.position_y }
      }
    })
    return Object.keys(pos).length > 0 ? pos : undefined
  }, [apiDevices])

  const handleAddRoute = useCallback((route: Route) => {
    // Signal compatibility check
    const compat = checkSignalCompatibility(route.fromPort, route.toPort)
    if (compat.level === 'incompatible') {
      addWarning(compat.message || 'Incompatible signal types')
      return // hard block on incompatible
    }
    if (compat.level === 'convertible') {
      addWarning(compat.message || 'Converter required', 'info')
      // allow through — soft warn only
    }

    // Loop detection
    const loop = detectLoop(routes, { from: route.from, to: route.to }, devices)
    if (loop.hasLoop) {
      addWarning(`Routing loop detected: ${loop.path?.join(' \u2192 ')}`)
      return // hard block on loops
    }

    // Port capacity check
    const capacity = checkPortCapacity(routes, route)
    if (capacity) {
      const portLabel = capacity.port
      if (capacity.allowed === 1) {
        addWarning(`Port "${portLabel}" already has a connection (1:1 limit for physical signals)`)
        return // hard block: physical port already occupied
      }
    }

    const create: RouteCreate = {
      from: route.from,
      fromPort: route.fromPort,
      to: route.to,
      toPort: route.toPort,
    }
    addRoute(create)
  }, [addRoute, routes, devices])

  const handleRemoveRoute = useCallback((route: Route) => {
    const create: RouteCreate = {
      from: route.from,
      fromPort: route.fromPort,
      to: route.to,
      toPort: route.toPort,
    }
    removeRoute(create)
  }, [removeRoute])

  const handleClearRoutes = async () => {
    if (routes.length === 0) return
    const ok = await confirm({
      title: 'Clear All Routes',
      message: `Remove all ${routes.length} route${routes.length === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Clear All',
      destructive: true,
    })
    if (ok) clearRoutes()
  }

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return
    const preset = await createPreset(newPresetName.trim())
    if (preset) {
      await saveToPreset(preset.id)
      setNewPresetName('')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full font-mono text-slate-200 items-center justify-center bg-[#09090f]">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mb-4" />
        <span className="text-slate-500 text-sm">Loading routing state...</span>
      </div>
    )
  }

  if (error && devices.length === 0) {
    return (
      <div className="flex flex-col h-full font-mono text-slate-200 items-center justify-center bg-[#09090f]">
        <div className="text-red-400 mb-2">Failed to load routing state</div>
        <div className="text-slate-500 text-sm">{error}</div>
      </div>
    )
  }

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

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-600">
            {routes.length} routes &middot; {devices.length} devices
          </span>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className={`rounded-md px-3 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
              showPresets
                ? 'bg-purple-900/40 border border-purple-800/40 text-purple-300'
                : 'bg-[#12121f] border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Presets
          </button>
          <button
            onClick={handleClearRoutes}
            className="bg-red-950/50 border border-red-900/40 text-red-400 rounded-md px-3 py-1 text-[10px] font-mono cursor-pointer hover:bg-red-900/30 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Preset Panel (slide-down) */}
      {showPresets && (
        <div className="px-5 py-3 border-b border-slate-800 bg-[#0c0c16] flex items-center gap-4 flex-wrap">
          {/* Existing presets */}
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-mono border ${
                preset.is_active
                  ? 'bg-purple-900/30 border-purple-700/40 text-purple-300'
                  : 'bg-[#12121f] border-slate-800 text-slate-400'
              }`}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-slate-600">{preset.route_count}r</span>
              <button
                onClick={() => recallPreset(preset.id)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
                title="Recall this preset"
              >
                Load
              </button>
              <button
                onClick={() => saveToPreset(preset.id)}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Save current routes to this preset"
              >
                Save
              </button>
              <button
                onClick={() => deletePreset(preset.id)}
                className="text-red-400 hover:text-red-300 transition-colors"
                title="Delete this preset"
              >
                &times;
              </button>
            </div>
          ))}

          {/* New preset */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              className="bg-[#12121f] border border-slate-800 rounded-md px-2 py-1 text-[11px] font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-700 w-40"
            />
            <button
              onClick={handleSavePreset}
              disabled={!newPresetName.trim()}
              className="bg-purple-900/40 border border-purple-800/40 text-purple-300 rounded-md px-2 py-1 text-[10px] font-mono cursor-pointer hover:bg-purple-800/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              + Save As
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-5 py-2 bg-red-950/30 border-b border-red-900/30 text-red-400 text-[11px] font-mono">
          {error}
        </div>
      )}

      {/* View content */}
      <div className="flex-1 overflow-hidden relative bg-[#09090f]">
        {view === 'nodes' && (
          <NodeGraphView
            devices={devices}
            routes={routes}
            onAddRoute={handleAddRoute}
            onRemoveRoute={handleRemoveRoute}
            initialPositions={initialPositions}
            onPositionsChange={savePositions}
          />
        )}
        {view === 'matrix' && (
          <MatrixView
            devices={devices}
            routes={routes}
            onAddRoute={handleAddRoute}
            onRemoveRoute={handleRemoveRoute}
          />
        )}
        {view === 'rack' && <RackView devices={devices} routes={routes} />}
      </div>

      {/* Warning toasts */}
      {warnings.length > 0 && (
        <div className="absolute bottom-12 right-5 z-50 flex flex-col gap-2">
          {warnings.map((w) => (
            <div
              key={w.id}
              className={`px-4 py-2 rounded-lg text-[11px] font-mono shadow-lg border animate-[fadeIn_0.2s_ease-out] ${
                w.level === 'warn'
                  ? 'bg-red-950/90 border-red-800/40 text-red-300'
                  : 'bg-amber-950/90 border-amber-800/40 text-amber-300'
              }`}
            >
              {w.level === 'warn' ? '\u26A0' : '\u2139'} {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-slate-800 bg-[#0c0c16] text-[10px] text-slate-600">
        <span>{STATUS_HINTS[view]}</span>
        <span>Maestra v0.1 &middot; Device Ecosystem Router</span>
      </div>
    </div>
  )
}
