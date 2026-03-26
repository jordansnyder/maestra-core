'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useConsole, type ConsoleMessage, type Protocol } from './ConsoleProvider'
import { Copy, ChevronDown } from 'lucide-react'
import Link from 'next/link'

// --- Protocol badge colors ---
const BADGE_STYLES: Record<Protocol, string> = {
  osc: 'bg-cyan-500/20 text-cyan-400',
  mqtt: 'bg-emerald-500/20 text-emerald-400',
  ws: 'bg-violet-500/20 text-violet-400',
  internal: 'bg-slate-500/20 text-slate-400',
}

const BADGE_LABELS: Record<Protocol, string> = {
  osc: 'OSC',
  mqtt: 'MQTT',
  ws: 'WS',
  internal: 'INT',
}

// --- JSON Syntax Colorizer (React elements, no dangerouslySetInnerHTML) ---
function JsonColorized({ data }: { data: unknown }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }, [data])

  const elements = useMemo(() => {
    const result: React.ReactNode[] = []
    // Simple tokenizer for JSON display
    const lines = formatted.split('\n')
    lines.forEach((line, lineIdx) => {
      const parts: React.ReactNode[] = []
      let remaining = line
      let partIdx = 0

      // Try key: value pattern
      const keyMatch = remaining.match(/^(\s*)"((?:[^"\\]|\\.)*)"(\s*:\s*)/)
      if (keyMatch) {
        parts.push(<span key={partIdx++}>{keyMatch[1]}</span>)
        parts.push(<span key={partIdx++} className="text-slate-400">&quot;{keyMatch[2]}&quot;</span>)
        parts.push(<span key={partIdx++}>{keyMatch[3]}</span>)
        remaining = remaining.slice(keyMatch[0].length)

        // Color the value
        const valMatch = remaining.match(/^("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(.*)/)
        if (valMatch) {
          const val = valMatch[1]
          if (val.startsWith('"')) {
            parts.push(<span key={partIdx++} className="text-emerald-400">{val}</span>)
          } else if (val === 'true' || val === 'false') {
            parts.push(<span key={partIdx++} className="text-violet-400">{val}</span>)
          } else if (val === 'null') {
            parts.push(<span key={partIdx++} className="text-slate-500">{val}</span>)
          } else {
            parts.push(<span key={partIdx++} className="text-cyan-400">{val}</span>)
          }
          parts.push(<span key={partIdx++}>{valMatch[2]}</span>)
        } else {
          parts.push(<span key={partIdx++}>{remaining}</span>)
        }
      } else {
        // Standalone value line (in arrays)
        const svMatch = remaining.match(/^(\s*)((?:"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))(.*)/)
        if (svMatch) {
          parts.push(<span key={partIdx++}>{svMatch[1]}</span>)
          const val = svMatch[2]
          if (val.startsWith('"')) {
            parts.push(<span key={partIdx++} className="text-emerald-400">{val}</span>)
          } else if (val === 'true' || val === 'false') {
            parts.push(<span key={partIdx++} className="text-violet-400">{val}</span>)
          } else if (val === 'null') {
            parts.push(<span key={partIdx++} className="text-slate-500">{val}</span>)
          } else {
            parts.push(<span key={partIdx++} className="text-cyan-400">{val}</span>)
          }
          parts.push(<span key={partIdx++}>{svMatch[3]}</span>)
        } else {
          parts.push(<span key={partIdx++}>{remaining}</span>)
        }
      }

      result.push(
        <div key={lineIdx}>
          {parts}
        </div>
      )
    })
    return result
  }, [formatted])

  return <>{elements}</>
}

// --- Timestamp formatting ---
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${h}:${m}:${s}.${ms}`
  } catch {
    return iso
  }
}

// --- Payload preview ---
function payloadPreview(payload: unknown): string {
  if (payload === null || payload === undefined) return ''
  try {
    const str = JSON.stringify(payload)
    return str.length > 120 ? str.slice(0, 120) + '...' : str
  } catch {
    return String(payload)
  }
}

// --- Filter matching ---
function matchesFilter(msg: ConsoleMessage, filters: { subjectPattern: string; protocols: Set<Protocol>; textSearch: string }): boolean {
  if (msg.isDivider || msg.isPauseSummary) return true
  if (!filters.protocols.has(msg.protocol)) return false
  if (filters.subjectPattern) {
    try {
      const regex = new RegExp(filters.subjectPattern.replace(/\*/g, '.*'), 'i')
      if (!regex.test(msg.subject)) return false
    } catch {
      if (!msg.subject.toLowerCase().includes(filters.subjectPattern.toLowerCase())) return false
    }
  }
  if (filters.textSearch) {
    const search = filters.textSearch.toLowerCase()
    const payloadStr = JSON.stringify(msg.payload || '').toLowerCase()
    if (!msg.subject.toLowerCase().includes(search) && !payloadStr.includes(search)) return false
  }
  return true
}

export function MessageFeed() {
  const { messages, filters, subscribe } = useConsole()
  const [, forceUpdate] = useState(0)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const parentRef = useRef<HTMLDivElement>(null)

  // Subscribe to buffer changes
  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [subscribe])

  // Filter messages
  const filtered = useMemo(() => {
    return messages.current.filter(msg => matchesFilter(msg, filters))
  }, [messages.current.length, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        setAutoScroll(false) // Expanding disables auto-scroll
      }
      return next
    })
  }, [])

  const copyPayload = useCallback((payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
  }, [])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const msg = filtered[index]
      if (msg?.isDivider || msg?.isPauseSummary) return 32
      return expandedIds.has(msg?.id) ? 240 : 40
    },
    overscan: 10,
  })

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && filtered.length > 0 && parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll])

  // Detect user scroll up to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    if (!atBottom && autoScroll) setAutoScroll(false)
    if (atBottom && !autoScroll) setAutoScroll(true)
  }, [autoScroll])

  // Empty state
  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
          <span className="text-sm">Listening for messages...</span>
        </div>
        <span className="text-xs text-slate-600 font-mono">
          Run <code className="px-1 py-0.5 bg-slate-800 rounded">make test-mqtt</code> to generate traffic
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map(virtualRow => {
            const msg = filtered[virtualRow.index]
            if (!msg) return null

            // Divider row
            if (msg.isDivider) {
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center gap-2 px-4 h-8 border-t border-dashed border-slate-600"
                >
                  <span className="text-xs font-mono text-slate-500">{formatTimestamp(msg.timestamp)}</span>
                  <span className={`text-xs font-mono ${msg.dividerText === 'Connection lost' ? 'text-yellow-400' : 'text-green-400'}`}>
                    [{msg.dividerText}]
                  </span>
                </div>
              )
            }

            // Pause summary row
            if (msg.isPauseSummary) {
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center gap-2 px-4 h-8 border-t border-dashed border-slate-600"
                >
                  <span className="text-xs font-mono text-slate-500">
                    {msg.pauseCount} messages received while paused
                  </span>
                </div>
              )
            }

            const isExpanded = expandedIds.has(msg.id)

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Message row */}
                <button
                  onClick={() => toggleExpand(msg.id)}
                  className="flex items-center gap-2 px-4 w-full h-10 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <span className="text-xs font-mono text-slate-500 shrink-0 w-20">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${BADGE_STYLES[msg.protocol]}`}>
                    {BADGE_LABELS[msg.protocol]}
                  </span>
                  <span className="text-xs font-mono text-slate-300 truncate max-w-[300px]" title={msg.subject}>
                    {msg.subject}
                  </span>
                  <span className="text-xs font-mono text-slate-600 truncate flex-1">
                    {payloadPreview(msg.payload)}
                  </span>
                  {msg.truncated && (
                    <span className="text-xs text-orange-400 shrink-0">truncated</span>
                  )}
                </button>

                {/* Expanded payload */}
                {isExpanded && (
                  <div className="mx-4 mb-2 p-3 bg-slate-900 rounded border border-slate-700 max-h-[400px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500 font-mono">{msg.subject}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyPayload(msg.payload) }}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                      <JsonColorized data={msg.payload} />
                    </pre>
                    {/* Entity/device links */}
                    {msg.sourceNode && (
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <span className="text-xs text-slate-500">Source: </span>
                        <Link href={`/entities/${msg.sourceNode}`} className="text-xs text-blue-400 hover:underline">
                          {msg.sourceNode}
                        </Link>
                      </div>
                    )}
                    {msg.targetNode && (
                      <div className="mt-1">
                        <span className="text-xs text-slate-500">Target: </span>
                        <Link href={`/entities/${msg.targetNode}`} className="text-xs text-blue-400 hover:underline">
                          {msg.targetNode}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Jump to latest button */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            if (parentRef.current) parentRef.current.scrollTop = parentRef.current.scrollHeight
          }}
          className="absolute bottom-4 right-4 flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-full shadow-lg hover:bg-blue-500 transition-colors z-10"
        >
          <ChevronDown className="w-3 h-3" />
          Jump to latest
        </button>
      )}
    </div>
  )
}
