import { useRef, useState, useCallback, useEffect } from 'react'
import { DMXCueFixtureSnapshot } from '@/lib/types'
import { dmxApi, entitiesApi } from '@/lib/api'

const DMX_SEND_INTERVAL_MS = 80

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function interpolateState(
  from: Record<string, number>,
  to: Record<string, number>,
  t: number,
): Record<string, number> {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)])
  const result: Record<string, number> = {}
  for (const k of keys) {
    result[k] = Math.round((from[k] ?? 0) + ((to[k] ?? 0) - (from[k] ?? 0)) * t)
  }
  return result
}

export function useCueFade() {
  const [fadeProgress, setFadeProgress] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastSendRef = useRef(0)

  const cancel = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setFadeProgress(null)
  }, [])

  /**
   * Fade from `fromCueId` snapshot to `toCueId` snapshot over `durationMs`.
   * If `fromCueId` is null, fades from black.
   * Returns a promise that resolves when the fade completes (or immediately if duration=0).
   */
  const fadeTo = useCallback(async (
    fromCueId: string | null,
    toCueId: string,
    durationMs: number,
  ): Promise<void> => {
    // Cancel any running fade
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }

    if (durationMs <= 0) {
      // Hard recall — let the API handle it
      setFadeProgress(null)
      await dmxApi.recallCue(toCueId)
      return
    }

    // Load snapshots for both cues in parallel
    const [fromFixtures, toFixtures] = await Promise.all([
      fromCueId
        ? dmxApi.getCueFixtures(fromCueId).catch(() => [] as DMXCueFixtureSnapshot[])
        : Promise.resolve([] as DMXCueFixtureSnapshot[]),
      dmxApi.getCueFixtures(toCueId).catch(() => [] as DMXCueFixtureSnapshot[]),
    ])

    if (toFixtures.length === 0) {
      setFadeProgress(null)
      return
    }

    const toMap = Object.fromEntries(toFixtures.map((f) => [f.entity_id, f]))
    const fromMap = Object.fromEntries(fromFixtures.map((f) => [f.entity_id, f]))
    const entityIds = [...new Set([...Object.keys(fromMap), ...Object.keys(toMap)])]

    const startTime = performance.now()
    lastSendRef.current = 0
    setFadeProgress(0)

    return new Promise<void>((resolve) => {
      function tick() {
        const now = performance.now()
        const elapsed = now - startTime
        const t = Math.min(elapsed / durationMs, 1)
        const eased = easeInOut(t)

        setFadeProgress(t)

        if (now - lastSendRef.current >= DMX_SEND_INTERVAL_MS) {
          lastSendRef.current = now
          entityIds.forEach((eid) => {
            const fromState = fromMap[eid]?.state ?? {}
            const toState = toMap[eid]?.state ?? {}
            const interp = interpolateState(fromState, toState, eased)
            entitiesApi.updateState(eid, { state: interp, source: 'dashboard-dmx' }).catch(() => {})
          })
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          rafRef.current = null
          // Apply exact final state
          toFixtures.forEach((f) => {
            entitiesApi.updateState(f.entity_id, { state: f.state, source: 'dashboard-dmx' }).catch(() => {})
          })
          setFadeProgress(null)
          resolve()
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    })
  }, [])

  useEffect(() => {
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

  return { fadeProgress, fadeTo, cancelFade: cancel }
}
