'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ConsoleProvider, useConsole } from './ConsoleProvider'
import { ConsoleToolbar } from './ConsoleToolbar'
import { MessageFeed } from './MessageFeed'
import { NetworkGraph } from './NetworkGraph'
import { AmbientCanvas } from './AmbientCanvas'

// Error boundary for each panel
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode; name: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; name: string }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 p-4">
          <span className="text-sm">Something went wrong in {this.props.name}</span>
          <span className="text-xs text-slate-600 font-mono">{this.state.error?.message}</span>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-3 py-1 text-xs bg-slate-800 rounded hover:bg-slate-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Mode Transition State Machine ---
type TransitionState = 'idle' | 'fading-out' | 'switching' | 'fading-in' | 'glow-ramp'

function ConsoleContent() {
  const { mode } = useConsole()
  const [displayMode, setDisplayMode] = useState(mode)
  const [transition, setTransition] = useState<TransitionState>('idle')
  const [opacity, setOpacity] = useState(1)

  const handleModeChange = useCallback(() => {
    if (mode === displayMode) return
    // Start transition
    setTransition('fading-out')
    setOpacity(0)
  }, [mode, displayMode])

  useEffect(() => {
    handleModeChange()
  }, [mode, handleModeChange])

  useEffect(() => {
    if (transition === 'fading-out') {
      const timer = setTimeout(() => {
        setTransition('switching')
        setDisplayMode(mode)
      }, 200)
      return () => clearTimeout(timer)
    }
    if (transition === 'switching') {
      // Next frame: start fading in
      requestAnimationFrame(() => {
        setTransition('fading-in')
        setOpacity(1)
      })
    }
    if (transition === 'fading-in') {
      const timer = setTimeout(() => {
        if (mode === 'ambient') {
          setTransition('glow-ramp')
        } else {
          setTransition('idle')
        }
      }, 200)
      return () => clearTimeout(timer)
    }
    if (transition === 'glow-ramp') {
      const timer = setTimeout(() => {
        setTransition('idle')
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [transition, mode])

  return (
    <div className="flex flex-col h-full">
      <ConsoleToolbar />

      <div
        className="flex-1 flex min-h-0 relative"
        style={{
          opacity,
          transition: transition === 'fading-out' || transition === 'fading-in' ? 'opacity 200ms ease-in-out' : 'none',
        }}
      >
        {displayMode === 'debug' ? (
          <>
            <PanelErrorBoundary name="Message Feed">
              <MessageFeed />
            </PanelErrorBoundary>
            <PanelErrorBoundary name="Network Graph">
              <NetworkGraph />
            </PanelErrorBoundary>
          </>
        ) : (
          <PanelErrorBoundary name="Ambient Canvas">
            <AmbientCanvas />
          </PanelErrorBoundary>
        )}
      </div>
    </div>
  )
}

export function DataConsole() {
  return (
    <ConsoleProvider>
      <ConsoleContent />
    </ConsoleProvider>
  )
}
