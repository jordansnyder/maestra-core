'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useOnboarding } from '@/hooks/useOnboarding'
import { X, ExternalLink } from '@/components/icons'
import { getServiceLinks } from '@/lib/hosts'

export function WelcomeBanner() {
  const { state, dismissWelcome } = useOnboarding()
  const [visible, setVisible] = useState(true)
  const [animating, setAnimating] = useState(false)
  const serviceUrls = getServiceLinks()

  // Sync visibility with state
  useEffect(() => {
    if (state.dismissed) {
      setVisible(false)
    }
  }, [state.dismissed])

  if (!visible) return null

  const handleDismiss = () => {
    setAnimating(true)
    // Let the collapse animation play before fully removing
    setTimeout(() => {
      dismissWelcome()
      setVisible(false)
    }, 300)
  }

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        animating ? 'max-h-0 opacity-0 mb-0' : 'max-h-96 opacity-100 mb-6'
      }`}
    >
      <div className="relative bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-xl p-6">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          aria-label="Dismiss welcome banner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="pr-8">
          <h2 className="text-2xl font-bold">Welcome to Maestra</h2>
          <p className="text-slate-300 text-sm mt-2 max-w-2xl">
            Your infrastructure for immersive experiences is ready. Explore the dashboard to see
            your connected devices, entity states, and live data streams.
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-5">
            <Link
              href="/devices"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              Explore Devices
            </Link>
            <a
              href={serviceUrls.nodeRed}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-600 hover:border-slate-500 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Open Node-RED
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={serviceUrls.docs}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-blue-400 transition-colors"
            >
              Read the Docs
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
