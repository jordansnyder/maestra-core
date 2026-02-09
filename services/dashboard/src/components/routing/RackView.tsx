'use client'

import { Route, RoutingDevice, DEVICES, SIGNAL_TYPES, getSignalType } from './types'

interface RackViewProps {
  routes: Route[]
}

const GROUP_LABELS: Record<string, string> = {
  camera: 'CAMERAS',
  audio: 'AUDIO',
  sync: 'SYNC',
  switcher: 'SWITCHING',
  ai: 'AI PROCESSING',
  recorder: 'RECORDERS',
  monitor: 'MONITORS',
  storage: 'STORAGE',
  output: 'OUTPUT',
}

export function RackView({ routes }: RackViewProps) {
  const typeGroups: Record<string, RoutingDevice[]> = {}
  DEVICES.forEach((d) => {
    if (!typeGroups[d.type]) typeGroups[d.type] = []
    typeGroups[d.type].push(d)
  })

  return (
    <div className="w-full h-full overflow-auto p-6">
      <div className="flex flex-wrap gap-5 justify-center">
        {Object.entries(typeGroups).map(([type, devices]) => (
          <div
            key={type}
            className="bg-[#0d0d18] border border-slate-800 rounded-xl p-4 min-w-[200px] flex-[0_1_280px]"
          >
            <div
              className="text-[11px] font-mono tracking-[1.5px] mb-3 font-semibold"
              style={{ color: devices[0].color }}
            >
              {GROUP_LABELS[type] || type.toUpperCase()}
            </div>

            {devices.map((device) => {
              const outRoutes = routes.filter((r) => r.from === device.id)
              const inRoutes = routes.filter((r) => r.to === device.id)

              return (
                <div
                  key={device.id}
                  className="bg-[#12121f] rounded-lg p-3 mb-2"
                  style={{
                    border: `1px solid ${device.color}20`,
                    borderLeft: `3px solid ${device.color}`,
                  }}
                >
                  {/* Device header */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm mr-2">{device.icon}</span>
                      <span className="text-xs font-semibold text-slate-200 font-mono">{device.name}</span>
                    </div>
                    <div className="flex gap-1">
                      {outRoutes.length > 0 && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-px font-mono">
                          {outRoutes.length} out
                        </span>
                      )}
                      {inRoutes.length > 0 && (
                        <span className="text-[9px] text-blue-400 bg-blue-400/10 rounded px-1.5 py-px font-mono">
                          {inRoutes.length} in
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Output ports */}
                  {device.outputs.length > 0 && (
                    <div className="mb-1">
                      {device.outputs.map((port) => {
                        const routed = routes.filter((r) => r.from === device.id && r.fromPort === port)
                        const sig = getSignalType(port)
                        const sc = SIGNAL_TYPES[sig]?.color || '#555'
                        return (
                          <div key={port} className="flex items-center gap-1.5 py-0.5 text-[10px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc }} />
                            <span className="text-slate-500 min-w-[60px]">{port}</span>
                            {routed.map((r, i) => {
                              const target = DEVICES.find((d) => d.id === r.to)
                              return (
                                <span
                                  key={i}
                                  className="text-[9px] rounded px-1"
                                  style={{ color: target?.color || '#666', background: `${target?.color || '#666'}15` }}
                                >
                                  &rarr; {target?.name.split(' ').pop()}/{r.toPort}
                                </span>
                              )
                            })}
                            {routed.length === 0 && <span className="text-slate-700 text-[9px]">unpatched</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Input ports */}
                  {device.inputs.length > 0 && (
                    <div>
                      {device.inputs.map((port) => {
                        const routed = routes.filter((r) => r.to === device.id && r.toPort === port)
                        const sig = getSignalType(port)
                        const sc = SIGNAL_TYPES[sig]?.color || '#555'
                        return (
                          <div key={port} className="flex items-center gap-1.5 py-0.5 text-[10px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-sm" style={{ background: sc }} />
                            <span className="text-slate-500 min-w-[60px]">{port}</span>
                            {routed.map((r, i) => {
                              const source = DEVICES.find((d) => d.id === r.from)
                              return (
                                <span
                                  key={i}
                                  className="text-[9px] rounded px-1"
                                  style={{ color: source?.color || '#666', background: `${source?.color || '#666'}15` }}
                                >
                                  &larr; {source?.name.split(' ').pop()}/{r.fromPort}
                                </span>
                              )
                            })}
                            {routed.length === 0 && <span className="text-slate-700 text-[9px]">unpatched</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
