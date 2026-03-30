/**
 * Show Control convenience methods for Maestra SDK.
 * Manages show lifecycle phases: idle, pre_show, active, paused, post_show, shutdown
 */

export type ShowPhase = 'idle' | 'pre_show' | 'active' | 'paused' | 'post_show' | 'shutdown'

export interface ShowState {
  phase: ShowPhase
  previous_phase: ShowPhase | null
  transition_time: string
  source: string | null
  context: Record<string, unknown>
}

export interface ShowTransitionResponse {
  phase: ShowPhase
  previous_phase: ShowPhase | null
  transition_time: string
  source: string | null
  context: Record<string, unknown>
}

export interface ShowHistoryEntry {
  from_phase: ShowPhase
  to_phase: ShowPhase
  source: string | null
  transition_time: string
  context: Record<string, unknown>
}

export type ShowStateCallback = (state: ShowState) => void

/**
 * Show Control
 * Provides convenience methods for managing show lifecycle phases.
 *
 * Usage:
 *   import { ShowControl } from '@maestra/sdk'
 *
 *   const show = new ShowControl('http://localhost:8080')
 *
 *   // Check current state
 *   const state = await show.getState()
 *   console.log(`Phase: ${state.phase}`)
 *
 *   // Run through show lifecycle
 *   await show.warmup()   // idle -> pre_show
 *   await show.go()       // pre_show -> active
 *   await show.pause()    // active -> paused
 *   await show.resume()   // paused -> active
 *   await show.stop()     // active -> post_show
 *   await show.reset()    // any -> idle
 *
 *   // Or transition directly
 *   await show.transition('active', 'stage-manager')
 *
 *   // View history
 *   const history = await show.getHistory(10)
 *
 *   // Subscribe to state changes (polling)
 *   const unsub = show.onChange((state) => {
 *     console.log(`Phase changed: ${state.phase}`)
 *   })
 *   // ... later ...
 *   unsub()
 */
export class ShowControl {
  private baseUrl: string
  private _callbacks: ShowStateCallback[] = []
  private _pollInterval: ReturnType<typeof setInterval> | null = null
  private _lastPhase: ShowPhase | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }
    return response.json()
  }

  /** Get current show state */
  async getState(): Promise<ShowState> {
    return this.request('GET', '/show/state')
  }

  /** Transition to pre_show phase (warmup) */
  async warmup(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/warmup')
  }

  /** Transition to active phase (go live) */
  async go(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/go')
  }

  /** Pause the active show */
  async pause(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/pause')
  }

  /** Resume a paused show */
  async resume(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/resume')
  }

  /** Stop the show (transition to post_show) */
  async stop(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/stop')
  }

  /** Shutdown the show (transition to shutdown phase) */
  async shutdown(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/shutdown')
  }

  /** Reset the show back to idle */
  async reset(): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/reset')
  }

  /** Transition to an arbitrary phase */
  async transition(to: string, source = 'js-sdk'): Promise<ShowTransitionResponse> {
    return this.request('POST', '/show/transition', { to, source })
  }

  /** Get show transition history */
  async getHistory(limit = 20): Promise<ShowHistoryEntry[]> {
    return this.request('GET', `/show/history?limit=${limit}`)
  }

  /**
   * Subscribe to show state changes via polling.
   * The callback fires whenever the phase changes.
   *
   * @param callback - Called with the new ShowState when the phase changes
   * @param intervalMs - Polling interval in milliseconds (default: 1000)
   * @returns Unsubscribe function that stops polling when no callbacks remain
   */
  onChange(callback: ShowStateCallback, intervalMs = 1000): () => void {
    this._callbacks.push(callback)

    // Start polling if not already running
    if (!this._pollInterval) {
      this._pollInterval = setInterval(async () => {
        try {
          const state = await this.getState()
          if (this._lastPhase !== null && state.phase !== this._lastPhase) {
            this._callbacks.forEach((cb) => {
              try {
                cb(state)
              } catch (e) {
                console.error('Error in show state change callback:', e)
              }
            })
          }
          this._lastPhase = state.phase
        } catch (e) {
          // Silently ignore poll errors to avoid flooding the console
        }
      }, intervalMs)
    }

    // Return unsubscribe function
    return () => {
      const index = this._callbacks.indexOf(callback)
      if (index > -1) {
        this._callbacks.splice(index, 1)
      }
      // Stop polling when no callbacks remain
      if (this._callbacks.length === 0 && this._pollInterval) {
        clearInterval(this._pollInterval)
        this._pollInterval = null
        this._lastPhase = null
      }
    }
  }

  /** Stop all polling and clear callbacks */
  dispose(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval)
      this._pollInterval = null
    }
    this._callbacks = []
    this._lastPhase = null
  }
}
