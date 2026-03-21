import { useRef, useState, useCallback, useEffect } from 'react'
import { playbackApi } from '@/lib/api'

export function useCueFade() {
  const [fadeProgress, setFadeProgress] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cancel = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
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
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    await playbackApi.recallCueFade(fromCueId, toCueId, durationMs)

    if (durationMs <= 0) {
      setFadeProgress(null)
      return
    }

    setFadeProgress(0)
    return new Promise<void>((resolve) => {
      pollRef.current = setInterval(async () => {
        try {
          const s = await playbackApi.getStatus()
          const p = s.fade_progress
          if (p === null || p === undefined) {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setFadeProgress(null)
            resolve()
          } else {
            setFadeProgress(p)
          }
        } catch {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setFadeProgress(null)
          resolve()
        }
      }, 150)
    })
  }, [])

  // Track an externally-triggered fade without calling the API — just poll status
  const trackExternalFade = useCallback(() => {
    if (pollRef.current !== null) return
    setFadeProgress(0)
    pollRef.current = setInterval(async () => {
      try {
        const s = await playbackApi.getStatus()
        const p = s.fade_progress
        if (p === null || p === undefined) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setFadeProgress(null)
        } else {
          setFadeProgress(p)
        }
      } catch {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setFadeProgress(null)
      }
    }, 150)
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current !== null) clearInterval(pollRef.current) }
  }, [])

  return { fadeProgress, fadeTo, cancelFade: cancel, trackExternalFade }
}
