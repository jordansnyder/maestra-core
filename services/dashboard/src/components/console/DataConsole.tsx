'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  const contentRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await contentRef.current?.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, [])

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [])

  const handleModeChange = useCallback(() => {
    if (mode === displayMode) return
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
    // relative: positions ambient toolbar's absolute overlay correctly
    // bg-[#0a0a0f]: correct dark background when browser fullscreens this element
    <div ref={contentRef} className="flex flex-col h-full relative bg-[#0a0a0f]">
      <ConsoleToolbar isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />

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
