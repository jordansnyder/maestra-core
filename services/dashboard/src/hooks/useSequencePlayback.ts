import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { DMXSequence } from '@/lib/types'
import { playbackApi } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SequencePlayState = 'stopped' | 'playing' | 'paused'
export type SequencePhase = 'transitioning' | 'holding' | 'idle'

export interface SequencePlaybackStatus {
  sequenceId: string | null
  playState: SequencePlayState
  phase: SequencePhase
  cueIndex: number
  progress: number
  holdProgress: number
  loop: boolean
}

export const INITIAL_STATUS: SequencePlaybackStatus = {
  sequenceId: null,
  playState: 'stopped',
  phase: 'idle',
  cueIndex: 0,
  progress: 0,
  holdProgress: 0,
  loop: false,
}

type RawEngineStatus = {
  group_id: string | null
  sequence_id: string | null
  play_state: string
  phase: string
  cue_index: number
  progress: number
  hold_progress: number
  loop: boolean
}

function parseStatus(s: RawEngineStatus): SequencePlaybackStatus {
  return {
    sequenceId: s.sequence_id,
    playState: s.play_state as SequencePlayState,
    phase: s.phase as SequencePhase,
    cueIndex: s.cue_index,
    progress: s.progress,
    holdProgress: s.hold_progress,
    loop: s.loop,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSequencePlayback() {
  // Key: group_id string | null (null = ungrouped/legacy engine)
  const [statusMap, setStatusMap] = useState<Map<string | null, SequencePlaybackStatus>>(new Map())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Set of group IDs (including null for ungrouped) that have non-stopped playback. */
  const activeGroupIds = useMemo<Set<string | null>>(() => {
    const ids = new Set<string | null>()
    for (const [gid, s] of statusMap.entries()) {
      if (s.playState !== 'stopped') ids.add(gid)
    }
    return ids
  }, [statusMap])

  /** Get status for a specific group engine. Returns INITIAL_STATUS when no data. */
  const getGroupStatus = useCallback(
    (groupId: string | null): SequencePlaybackStatus =>
      statusMap.get(groupId) ?? INITIAL_STATUS,
    [statusMap],
  )

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return
    pollRef.current = setInterval(async () => {
      try {
        const result = await playbackApi.getAllStatuses()
        const next = new Map<string | null, SequencePlaybackStatus>()
        for (const engine of result.engines) {
          next.set(engine.group_id ?? null, parseStatus(engine))
        }
        setStatusMap(next)
        const allIdle = result.engines.every(
          (e) => e.play_state === 'stopped' && e.phase === 'idle',
        )
        if (allIdle) stopPolling()
      } catch {
        // silently ignore transient poll errors
      }
    }, 150)
  }, [stopPolling])

  const play = useCallback(
    async (sequence: DMXSequence) => {
      const groupId = sequence.group_id ?? null
      await playbackApi.play(sequence.id, groupId ?? undefined)
      setStatusMap((prev) => {
        const next = new Map(prev)
        next.set(groupId, {
          sequenceId: sequence.id,
          playState: 'playing',
          phase: 'transitioning',
          cueIndex: 0,
          progress: 0,
          holdProgress: 0,
          loop: prev.get(groupId)?.loop ?? false,
        })
        return next
      })
      startPolling()
    },
    [startPolling],
  )

  const pause = useCallback(async (groupId: string | null) => {
    await playbackApi.pause(groupId ?? undefined)
    setStatusMap((prev) => {
      const next = new Map(prev)
      const cur = prev.get(groupId) ?? INITIAL_STATUS
      next.set(groupId, { ...cur, playState: 'paused' })
      return next
    })
  }, [])

  const resume = useCallback(
    async (groupId: string | null) => {
      await playbackApi.resume(groupId ?? undefined)
      setStatusMap((prev) => {
        const next = new Map(prev)
        const cur = prev.get(groupId) ?? INITIAL_STATUS
        next.set(groupId, { ...cur, playState: 'playing' })
        return next
      })
      startPolling()
    },
    [startPolling],
  )

  const stop = useCallback(async (groupId: string | null) => {
    await playbackApi.stop(groupId ?? undefined)
    setStatusMap((prev) => {
      const next = new Map(prev)
      next.set(groupId, { ...INITIAL_STATUS })
      return next
    })
    // Polling will naturally stop once all engines report idle
  }, [])

  const toggleLoop = useCallback(async (groupId: string | null) => {
    const result = await playbackApi.toggleLoop(groupId ?? undefined)
    setStatusMap((prev) => {
      const next = new Map(prev)
      const cur = prev.get(groupId) ?? INITIAL_STATUS
      next.set(groupId, { ...cur, loop: result.loop })
      return next
    })
  }, [])

  const fadeOut = useCallback(async (durationMs: number = 3000, groupId: string | null) => {
    await playbackApi.fadeOut(durationMs, groupId ?? undefined)
    setStatusMap((prev) => {
      const next = new Map(prev)
      next.set(groupId, { ...INITIAL_STATUS })
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  return {
    statusMap,
    getGroupStatus,
    activeGroupIds,
    play,
    pause,
    resume,
    stop,
    toggleLoop,
    fadeOut,
    startPolling,
  }
}
