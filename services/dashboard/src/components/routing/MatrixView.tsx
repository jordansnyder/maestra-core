'use client'

import { Route, DEVICES, SIGNAL_TYPES, getSignalType } from './types'

interface MatrixViewProps {
  routes: Route[]
  onAddRoute: (route: Route) => void
  onRemoveRoute: (route: Route) => void
}

export function MatrixView({ routes, onAddRoute, onRemoveRoute }: MatrixViewProps) {
  const outputs = DEVICES.flatMap((d) => d.outputs.map((p) => ({ deviceId: d.id, port: p, device: d })))
  const inputs = DEVICES.flatMap((d) => d.inputs.map((p) => ({ deviceId: d.id, port: p, device: d })))

  const isRouted = (out: typeof outputs[0], inp: typeof inputs[0]) =>
    routes.some((r) => r.from === out.deviceId && r.fromPort === out.port && r.to === inp.deviceId && r.toPort === inp.port)

  const toggleRoute = (out: typeof outputs[0], inp: typeof inputs[0]) => {
    if (isRouted(out, inp)) {
      onRemoveRoute({ from: out.deviceId, fromPort: out.port, to: inp.deviceId, toPort: inp.port })
    } else {
      onAddRoute({ from: out.deviceId, fromPort: out.port, to: inp.deviceId, toPort: inp.port })
    }
  }

  return (
    <div className="w-full h-full overflow-auto p-5">
      <div className="inline-block min-w-fit">
        {/* Column headers */}
        <div className="flex mb-0.5">
          <div className="w-40 min-w-[160px] h-[120px] flex items-end justify-end pr-3 pb-2">
            <div className="text-[10px] text-slate-600 font-mono text-right">
              <div>OUTPUTS &rarr;</div>
              <div>&darr; INPUTS</div>
            </div>
          </div>
          {outputs.map((out, i) => (
            <div key={`h-${i}`} className="w-9 min-w-[36px] h-[120px] flex items-end justify-center pb-1.5">
              <div
                className="origin-bottom-center whitespace-nowrap text-[9px] font-mono"
                style={{ transform: 'rotate(-65deg)', transformOrigin: 'bottom center', color: out.device.color }}
              >
                {out.device.name.split(' ').pop()} / {out.port}
              </div>
            </div>
          ))}
        </div>

        {/* Row entries */}
        {inputs.map((inp, row) => (
          <div key={`r-${row}`} className="flex mb-px">
            <div className="w-40 min-w-[160px] h-9 flex items-center justify-end pr-3 gap-1.5">
              <span className="text-[9px] text-slate-500 font-mono text-right overflow-hidden text-ellipsis whitespace-nowrap">
                {inp.device.name.split(' ').pop()} / {inp.port}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0 opacity-60"
                style={{ background: inp.device.color }}
              />
            </div>
            {outputs.map((out, col) => {
              const active = isRouted(out, inp)
              const outSig = getSignalType(out.port)
              const inSig = getSignalType(inp.port)
              const compatible = outSig === inSig || outSig === 'data' || inSig === 'data'
              const sigColor = SIGNAL_TYPES[outSig]?.color || '#555'

              return (
                <div
                  key={`c-${row}-${col}`}
                  onClick={() => compatible && toggleRoute(out, inp)}
                  className="w-9 min-w-[36px] h-9 flex items-center justify-center rounded-[3px] mr-px transition-all duration-150"
                  style={{
                    background: active ? `${sigColor}20` : compatible ? '#14141f' : '#0a0a12',
                    border: `1px solid ${active ? sigColor : compatible ? '#1e1e30' : '#111118'}`,
                    cursor: compatible ? 'pointer' : 'not-allowed',
                  }}
                  onMouseEnter={(e) => { if (compatible && !active) (e.currentTarget as HTMLElement).style.background = `${sigColor}10` }}
                  onMouseLeave={(e) => { if (compatible && !active) (e.currentTarget as HTMLElement).style.background = '#14141f' }}
                >
                  {active && (
                    <div
                      className="w-3.5 h-3.5 rounded-full transition-all duration-200"
                      style={{ background: sigColor, boxShadow: `0 0 8px ${sigColor}80` }}
                    />
                  )}
                  {!active && compatible && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
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
