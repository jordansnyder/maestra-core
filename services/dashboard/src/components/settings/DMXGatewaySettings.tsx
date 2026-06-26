'use client'

import { useState, useEffect, useCallback } from 'react'
import { dmxApi, playbackApi } from '@/lib/api'
import { DMXFixture, DMXNode } from '@/lib/types'
import { ZapOff, RefreshCw, ExternalLink } from '@/components/icons'
import Link from 'next/link'

interface PlaybackStatus {
  play_state: string
  sequence_id: string | null
  cue_index: number
  phase: string
}

interface DMXGatewayData {
  nodes: DMXNode[]
  fixtures: DMXFixture[]
  playback: PlaybackStatus | null
}

export function DMXGatewaySettings() {
  const [data, setData] = useState<DMXGatewayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blackingOut, setBlackingOut] = useState(false)
  const [blackoutResult, setBlackoutResult] = useState<string | null>(null)
  const [intervalMs, setIntervalMs] = useState<number | null>(null)
  const [intervalSaving, setIntervalSaving] = useState(false)
  const [intervalDraft, setIntervalDraft] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nodes, fixtures, playback, config] = await Promise.all([
        dmxApi.listNodes(),
        dmxApi.listFixtures(),
        playbackApi.getStatus().catch(() => null),
        playbackApi.getConfig().catch(() => null),
      ])
      setData({ nodes, fixtures, playback })
      if (config) {
        setIntervalMs(config.interval_ms)
        setIntervalDraft(String(config.interval_ms))
      }
    } catch (e) {
      setError('Failed to load DMX gateway data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleBlackout = async () => {
    setBlackingOut(true)
    setBlackoutResult(null)
    try {
      const result = await playbackApi.blackout()
      setBlackoutResult(`Blackout sent to ${result.fixtures} fixture${result.fixtures !== 1 ? 's' : ''}`)
    } catch {
      setBlackoutResult('Blackout failed')
    } finally {
      setBlackingOut(false)
      setTimeout(() => setBlackoutResult(null), 4000)
    }
  }

  const handleSaveInterval = async () => {
    const ms = parseFloat(intervalDraft)
    if (isNaN(ms) || ms < 10 || ms > 1000) return
    setIntervalSaving(true)
    try {
      const result = await playbackApi.setConfig(ms)
      setIntervalMs(result.interval_ms)
      setIntervalDraft(String(result.interval_ms))
    } finally {
      setIntervalSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-fg-subtle">
        Loading DMX gateway data...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
        {error ?? 'Unknown error'}
      </div>
    )
  }

  const { nodes, fixtures, playback } = data
  const routableFixtures = fixtures.filter((f) => f.entity_id)
  const totalUniverses = nodes.reduce((sum, n) => sum + (n.universes?.length ?? 0), 0)

  const playStateColor =
    playback?.play_state === 'playing' ? 'text-green-400' :
    playback?.play_state === 'paused'  ? 'text-yellow-400' :
                                          'text-fg-subtle'

  return (
    <div className="space-y-6">

      {/* Overview */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg">Overview</h2>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-2 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Art-Net Nodes" value={nodes.length} />
          <Stat label="Universes" value={totalUniverses} />
          <Stat label="Fixtures" value={fixtures.length} />
          <Stat label="Routable" value={routableFixtures.length} hint="linked to an entity" />
        </div>
        {playback && (
          <div className="mt-4 pt-4 border-t border-edge flex items-center gap-2 text-sm">
            <span className="text-fg-subtle">Playback</span>
            <span className={`font-medium capitalize ${playStateColor}`}>
              {playback.play_state}
            </span>
            {playback.play_state !== 'stopped' && (
              <span className="text-fg-subtle text-xs">
                — cue {playback.cue_index + 1}, {playback.phase}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Art-Net Nodes */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">Art-Net Nodes</h2>
        {nodes.length === 0 ? (
          <p className="text-sm text-fg-subtle">No Art-Net nodes configured. Add one from the DMX page.</p>
        ) : (
          <div className="space-y-3">
            {nodes.map((node) => {
              const nodeFixtures = fixtures.filter((f) => f.node_id === node.id)
              return (
                <div key={node.id} className="rounded-md border border-edge p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-fg">{node.name}</div>
                      <div className="text-xs font-mono text-fg-muted mt-0.5">
                        {node.ip_address}:{node.artnet_port ?? 6454}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-fg-subtle">
                        {nodeFixtures.length} fixture{nodeFixtures.length !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-fg-subtle mt-0.5">
                        {node.universes?.length ?? 0} universe{(node.universes?.length ?? 0) !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  {node.universes && node.universes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {node.universes.map((u) => (
                        <span
                          key={u.id}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface-0 border border-edge text-fg-muted"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: u.color ?? '#64748b' }}
                          />
                          U{u.id}
                          {u.port_label ? ` · ${u.port_label}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fixture summary */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">Fixtures</h2>
        {fixtures.length === 0 ? (
          <p className="text-sm text-fg-subtle">No fixtures configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle border-b border-edge">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Node</th>
                  <th className="pb-2 font-medium text-center">Universe</th>
                  <th className="pb-2 font-medium text-center">Start Ch</th>
                  <th className="pb-2 font-medium text-center">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {fixtures.map((f) => {
                  const node = nodes.find((n) => n.id === f.node_id)
                  return (
                    <tr key={f.id} className="text-fg">
                      <td className="py-2 pr-4 font-medium text-fg">{f.name}</td>
                      <td className="py-2 pr-4 text-fg-muted text-xs">{node?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-center font-mono text-xs text-fg-muted">{f.universe}</td>
                      <td className="py-2 pr-4 text-center font-mono text-xs text-fg-muted">{f.start_channel}</td>
                      <td className="py-2 text-center">
                        {f.entity_id ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800/50">linked</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 text-fg-subtle border border-edge">none</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Playback Engine Configuration */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <h2 className="text-lg font-semibold text-fg mb-1">Playback Engine</h2>
        <p className="text-sm text-fg-muted mb-4">
          Controls how frequently the engine interpolates and sends DMX state updates during cue fades and sequence playback.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-fg-subtle mb-1.5">
              Tick Interval (ms)
              <span className="text-fg-subtle ml-1">— min 10, max 1000</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={1000}
                step={1}
                value={intervalDraft}
                onChange={(e) => setIntervalDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInterval() }}
                className="w-24 bg-surface-0 border border-edge-strong focus:border-accent rounded px-3 py-1.5 text-sm font-mono text-fg focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              />
              <span className="text-xs text-fg-subtle">
                {intervalDraft && !isNaN(parseFloat(intervalDraft))
                  ? `≈ ${Math.round(1000 / parseFloat(intervalDraft))} Hz`
                  : ''}
              </span>
            </div>
          </div>
          <button
            onClick={handleSaveInterval}
            disabled={
              intervalSaving ||
              isNaN(parseFloat(intervalDraft)) ||
              parseFloat(intervalDraft) < 10 ||
              parseFloat(intervalDraft) > 1000 ||
              parseFloat(intervalDraft) === intervalMs
            }
            className="px-4 py-1.5 text-sm font-medium rounded-md bg-accent hover:bg-accent-hover text-fg disabled:opacity-40 transition-colors"
          >
            {intervalSaving ? 'Saving…' : 'Apply'}
          </button>
        </div>
        {intervalMs !== null && (
          <p className="text-xs text-fg-subtle mt-2">
            Current: {intervalMs} ms ({Math.round(1000 / intervalMs)} Hz)
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="bg-surface-1 rounded-lg border border-edge p-6">
        <h2 className="text-lg font-semibold text-fg mb-2">Actions</h2>
        <p className="text-sm text-fg-muted mb-4">
          Global controls that apply across all nodes and fixtures.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleBlackout}
            disabled={blackingOut || fixtures.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-surface-2 hover:bg-yellow-900/40 hover:text-yellow-300 border border-edge-strong hover:border-yellow-700/50 text-fg disabled:opacity-40 transition-colors"
          >
            <ZapOff className="w-4 h-4" />
            {blackingOut ? 'Sending Blackout…' : 'Blackout All Fixtures'}
          </button>
          <Link
            href="/dmx"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-surface-2 hover:bg-surface-2 border border-edge-strong text-fg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open DMX Page
          </Link>
        </div>
        {blackoutResult && (
          <p className="text-xs text-fg-muted mt-3">{blackoutResult}</p>
        )}
      </div>

    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <span className="text-fg-subtle text-xs">{label}</span>
      {hint && <span className="text-fg text-[10px] ml-1">({hint})</span>}
      <p className="text-2xl font-semibold text-fg mt-1">{value}</p>
    </div>
  )
}
