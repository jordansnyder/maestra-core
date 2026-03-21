import { useRef, useState, useCallback, useEffect } from 'react'
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

const INITIAL_STATUS: SequencePlaybackStatus = {
  sequenceId: null,
  playState: 'stopped',
  phase: 'idle',
  cueIndex: 0,
  progress: 0,
  holdProgress: 0,
  loop: false,
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSequencePlayback() {
  const [status, setStatus] = useState<SequencePlaybackStatus>(INITIAL_STATUS)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loopRef = useRef(false)

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
        const s = await playbackApi.getStatus()
        setStatus({
          sequenceId: s.sequence_id,
          playState: s.play_state as SequencePlayState,
          phase: s.phase as SequencePhase,
          cueIndex: s.cue_index,
          progress: s.progress,
          holdProgress: s.hold_progress,
          loop: s.loop,
        })
        if (s.play_state === 'stopped' && s.phase === 'idle') {
          stopPolling()
        }
      } catch {
        // silently ignore transient poll errors
      }
    }, 150)
  }, [stopPolling])

  const play = useCallback(async (sequence: DMXSequence) => {
    await playbackApi.play(sequence.id)
    setStatus({
      sequenceId: sequence.id,
      playState: 'playing',
      phase: 'transitioning',
      cueIndex: 0,
      progress: 0,
      holdProgress: 0,
      loop: loopRef.current,
    })
    startPolling()
  }, [startPolling])

  const pause = useCallback(async () => {
    await playbackApi.pause()
    setStatus((prev) => ({ ...prev, playState: 'paused' }))
  }, [])

  const resume = useCallback(async () => {
    await playbackApi.resume()
    setStatus((prev) => ({ ...prev, playState: 'playing' }))
    startPolling()
  }, [startPolling])

  const stop = useCallback(async () => {
    await playbackApi.stop()
    stopPolling()
    setStatus({ ...INITIAL_STATUS, loop: loopRef.current })
  }, [stopPolling])

  const toggleLoop = useCallback(async () => {
    const result = await playbackApi.toggleLoop()
    loopRef.current = result.loop
    setStatus((prev) => ({ ...prev, loop: result.loop }))
  }, [])

  const fadeOut = useCallback(async (durationMs: number = 3000) => {
    await playbackApi.fadeOut(durationMs)
    stopPolling()
    setStatus({ ...INITIAL_STATUS, loop: loopRef.current })
  }, [stopPolling])

  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  return { status, play, pause, resume, stop, toggleLoop, fadeOut, startPolling }
}
