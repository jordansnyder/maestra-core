import { useRef, useState, useCallback, useEffect } from 'react'
import { DMXSequence, DMXCuePlacement, DMXCueFixtureSnapshot } from '@/lib/types'
import { dmxApi, entitiesApi } from '@/lib/api'

// ─── Easing ──────────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SequencePlayState = 'stopped' | 'playing' | 'paused'
export type SequencePhase = 'transitioning' | 'holding' | 'idle'

export interface SequencePlaybackStatus {
  sequenceId: string | null
  playState: SequencePlayState
  phase: SequencePhase
  cueIndex: number       // which placement we're at / transitioning TO
  progress: number       // 0–1, meaningful during 'transitioning'
  holdProgress: number   // 0–1, fraction of hold_duration elapsed
  loop: boolean
}

interface LoadedPlacement {
  placement: DMXCuePlacement
  fixtures: DMXCueFixtureSnapshot[]
}

interface PlaybackRef {
  playState: SequencePlayState
  sequence: DMXSequence | null
  loaded: LoadedPlacement[]
  cueIndex: number
  phase: SequencePhase
  phaseStart: number    // performance.now() at phase start
  pausedElapsed: number // elapsed ms saved when paused
  rafId: number | null
  lastDMXSend: number
  loop: boolean
}

const INITIAL_STATUS: SequencePlaybackStatus = {
  sequenceId: null,
  playState: 'stopped',
  phase: 'idle',
  cueIndex: 0,
  progress: 0,
  holdProgress: 0,
  loop: false,
}

const DMX_SEND_INTERVAL_MS = 80 // ~12fps for DMX updates during transitions

// Channels matching these patterns are treated as dimmers for fadeout
const DIMMER_PATTERN = /dimmer|intensity|master|brightness/i

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSequencePlayback() {
  const [status, setStatus] = useState<SequencePlaybackStatus>(INITIAL_STATUS)
  const pb = useRef<PlaybackRef>({
    playState: 'stopped',
    sequence: null,
    loaded: [],
    cueIndex: 0,
    phase: 'idle',
    phaseStart: 0,
    pausedElapsed: 0,
    rafId: null,
    lastDMXSend: 0,
    loop: false,
  })
  const lastStatusRef = useRef<SequencePlaybackStatus>(INITIAL_STATUS)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function interpolateState(
    from: Record<string, number>,
    to: Record<string, number>,
    t: number,
  ): Record<string, number> {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)])
    const result: Record<string, number> = {}
    for (const k of keys) {
      const a = from[k] ?? 0
      const b = to[k] ?? 0
      result[k] = Math.round(a + (b - a) * t)
    }
    return result
  }

  async function sendFixtureState(fixtures: DMXCueFixtureSnapshot[], state: Record<string, number>) {
    await Promise.all(
      fixtures
        .filter((f) => f.entity_id)
        .map((f) =>
          entitiesApi.updateState(f.entity_id, { state, source: 'dashboard-dmx' }).catch(() => {}),
        ),
    )
  }

  async function applyFixtureInterpolated(
    fromFixtures: DMXCueFixtureSnapshot[],
    toFixtures: DMXCueFixtureSnapshot[],
    t: number,
  ) {
    const toMap = Object.fromEntries(toFixtures.map((f) => [f.entity_id, f]))
    const fromMap = Object.fromEntries(fromFixtures.map((f) => [f.entity_id, f]))

    const entityIds = new Set([...Object.keys(fromMap), ...Object.keys(toMap)])
    await Promise.all(
      [...entityIds].map((entityId) => {
        const fromState = fromMap[entityId]?.state ?? {}
        const toState = toMap[entityId]?.state ?? {}
        const interpolated = interpolateState(fromState, toState, t)
        return entitiesApi.updateState(entityId, { state: interpolated, source: 'dashboard-dmx' }).catch(() => {})
      }),
    )
  }

  async function applyBlackToFixtures(toFixtures: DMXCueFixtureSnapshot[], t: number) {
    await Promise.all(
      toFixtures.map((f) => {
        const zeros: Record<string, number> = Object.fromEntries(Object.keys(f.state).map((k) => [k, 0]))
        const interpolated = interpolateState(zeros, f.state, t)
        return entitiesApi.updateState(f.entity_id, { state: interpolated, source: 'dashboard-dmx' }).catch(() => {})
      }),
    )
  }

  // ── Animation loop ─────────────────────────────────────────────────────────

  function tick() {
    const r = pb.current
    if (r.playState !== 'playing' || !r.sequence) return

    const now = performance.now()
    const elapsed = now - r.phaseStart + r.pausedElapsed

    const current = r.loaded[r.cueIndex]
    if (!current) { stopPlayback(); return }

    let newStatus: SequencePlaybackStatus

    if (r.phase === 'transitioning') {
      const duration = current.placement.transition_time * 1000
      const t = duration > 0 ? Math.min(elapsed / duration, 1) : 1
      const eased = easeInOut(t)

      // Send DMX at throttled rate
      if (now - r.lastDMXSend >= DMX_SEND_INTERVAL_MS) {
        r.lastDMXSend = now
        const prev = r.loaded[r.cueIndex - 1]
        if (current.placement.transition_time === 0) {
          current.fixtures.forEach((f) => {
            entitiesApi.updateState(f.entity_id, { state: f.state, source: 'dashboard-dmx' }).catch(() => {})
          })
        } else if (r.cueIndex === 0) {
          applyBlackToFixtures(current.fixtures, eased)
        } else if (prev) {
          applyFixtureInterpolated(prev.fixtures, current.fixtures, eased)
        }
      }

      newStatus = {
        sequenceId: r.sequence.id,
        playState: 'playing',
        phase: 'transitioning',
        cueIndex: r.cueIndex,
        progress: t,
        holdProgress: 0,
        loop: r.loop,
      }

      if (t >= 1) {
        current.fixtures.forEach((f) => {
          entitiesApi.updateState(f.entity_id, { state: f.state, source: 'dashboard-dmx' }).catch(() => {})
        })
        r.phase = 'holding'
        r.phaseStart = now
        r.pausedElapsed = 0
      }
    } else {
      // HOLDING
      const holdMs = current.placement.hold_duration * 1000
      const holdProgress = holdMs > 0 ? Math.min(elapsed / holdMs, 1) : 1

      newStatus = {
        sequenceId: r.sequence.id,
        playState: 'playing',
        phase: 'holding',
        cueIndex: r.cueIndex,
        progress: 1,
        holdProgress,
        loop: r.loop,
      }

      if (holdProgress >= 1) {
        const nextIndex = r.cueIndex + 1
        if (nextIndex >= r.loaded.length) {
          if (r.loop) {
            // Loop back to the first cue
            r.cueIndex = 0
            r.phase = 'transitioning'
            r.phaseStart = now
            r.pausedElapsed = 0
            r.lastDMXSend = 0
          } else {
            // Last cue — hold indefinitely
            newStatus = { ...newStatus, holdProgress: 1 }
          }
        } else {
          r.cueIndex = nextIndex
          r.phase = 'transitioning'
          r.phaseStart = now
          r.pausedElapsed = 0
          r.lastDMXSend = 0
        }
      }
    }

    // Update React state at a throttled rate
    const statusChanged =
      newStatus.phase !== lastStatusRef.current.phase ||
      newStatus.cueIndex !== lastStatusRef.current.cueIndex ||
      Math.abs(newStatus.progress - lastStatusRef.current.progress) > 0.01 ||
      Math.abs(newStatus.holdProgress - lastStatusRef.current.holdProgress) > 0.01

    if (statusChanged) {
      lastStatusRef.current = newStatus
      setStatus(newStatus)
    }

    r.rafId = requestAnimationFrame(tick)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const play = useCallback(async (sequence: DMXSequence) => {
    const r = pb.current

    if (r.rafId !== null) cancelAnimationFrame(r.rafId)

    const placements = sequence.cue_placements
    const loaded: LoadedPlacement[] = await Promise.all(
      placements.map(async (p) => {
        const fixtures = await dmxApi.getCueFixtures(p.cue_id).catch(() => [] as DMXCueFixtureSnapshot[])
        return { placement: p, fixtures }
      }),
    )

    if (loaded.length === 0) return

    const first = loaded[0]
    const firstTransition = first.placement.transition_time

    if (firstTransition > 0) {
      first.fixtures.forEach((f) => {
        const zeros = Object.fromEntries(Object.keys(f.state).map((k) => [k, 0]))
        entitiesApi.updateState(f.entity_id, { state: zeros, source: 'dashboard-dmx' }).catch(() => {})
      })
    }

    r.sequence = sequence
    r.loaded = loaded
    r.cueIndex = 0
    r.phase = firstTransition > 0 ? 'transitioning' : 'holding'
    r.playState = 'playing'
    r.phaseStart = performance.now()
    r.pausedElapsed = 0
    r.lastDMXSend = 0

    if (firstTransition === 0) {
      first.fixtures.forEach((f) => {
        entitiesApi.updateState(f.entity_id, { state: f.state, source: 'dashboard-dmx' }).catch(() => {})
      })
    }

    const initialStatus: SequencePlaybackStatus = {
      sequenceId: sequence.id,
      playState: 'playing',
      phase: r.phase,
      cueIndex: 0,
      progress: firstTransition > 0 ? 0 : 1,
      holdProgress: 0,
      loop: r.loop,
    }
    lastStatusRef.current = initialStatus
    setStatus(initialStatus)
    r.rafId = requestAnimationFrame(tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pause = useCallback(() => {
    const r = pb.current
    if (r.playState !== 'playing') return
    if (r.rafId !== null) { cancelAnimationFrame(r.rafId); r.rafId = null }
    r.pausedElapsed += performance.now() - r.phaseStart
    r.playState = 'paused'
    setStatus((prev) => ({ ...prev, playState: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    const r = pb.current
    if (r.playState !== 'paused') return
    r.playState = 'playing'
    r.phaseStart = performance.now()
    setStatus((prev) => ({ ...prev, playState: 'playing' }))
    r.rafId = requestAnimationFrame(tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopPlayback = useCallback(() => {
    const r = pb.current
    if (r.rafId !== null) { cancelAnimationFrame(r.rafId); r.rafId = null }
    r.playState = 'stopped'
    r.cueIndex = 0
    r.phase = 'idle'
    r.pausedElapsed = 0
    const stopped = { ...INITIAL_STATUS, loop: r.loop }
    lastStatusRef.current = stopped
    setStatus(stopped)
  }, [])

  const toggleLoop = useCallback(() => {
    const r = pb.current
    r.loop = !r.loop
    setStatus((prev) => ({ ...prev, loop: r.loop }))
  }, [])

  const fadeOut = useCallback((durationMs: number = 3000) => {
    const r = pb.current
    if (r.rafId !== null) { cancelAnimationFrame(r.rafId); r.rafId = null }

    // Collect all unique fixtures from the current cue
    const fixtures = r.loaded[r.cueIndex]?.fixtures ?? []
    if (!fixtures.length) { stopPlayback(); return }

    // Immediately mark as stopped in React state so UI updates
    r.playState = 'stopped'
    r.lastDMXSend = 0
    const stopped = { ...INITIAL_STATUS, loop: r.loop }
    lastStatusRef.current = stopped
    setStatus(stopped)

    const startTime = performance.now()

    function fadeTick() {
      const now = performance.now()
      const elapsed = now - startTime
      const t = Math.min(elapsed / durationMs, 1)
      const dimFactor = 1 - easeInOut(t) // 1 → 0

      if (now - r.lastDMXSend >= DMX_SEND_INTERVAL_MS) {
        r.lastDMXSend = now
        fixtures.forEach((f) => {
          const state: Record<string, number> = {}
          for (const [key, val] of Object.entries(f.state)) {
            // Only fade channels identified as dimmers; leave others unchanged
            state[key] = DIMMER_PATTERN.test(key) ? Math.round(val * dimFactor) : val
          }
          entitiesApi.updateState(f.entity_id, { state, source: 'dashboard-dmx' }).catch(() => {})
        })
      }

      if (t < 1) {
        r.rafId = requestAnimationFrame(fadeTick)
      } else {
        r.rafId = null
        r.sequence = null
        r.loaded = []
        r.cueIndex = 0
        r.phase = 'idle'
      }
    }

    r.rafId = requestAnimationFrame(fadeTick)
  }, [stopPlayback])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const r = pb.current
      if (r.rafId !== null) cancelAnimationFrame(r.rafId)
    }
  }, [])

  return { status, play, pause, resume, stop: stopPlayback, toggleLoop, fadeOut }
}
