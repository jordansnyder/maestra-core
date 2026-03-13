'use client'

import { useMemo } from 'react'
import type { StreamInfo, AudioPreviewData } from '@/lib/types'
import { useStreamPreview } from '@/hooks/useStreamPreview'

interface AudioPreviewProps {
  stream: StreamInfo
}

export function AudioPreview({ stream }: AudioPreviewProps) {
  const { status, data, history, info, error } = useStreamPreview(stream.id)
  const audioData = data?.type === 'audio' ? (data as AudioPreviewData) : null

  // Build level history for the meter trail (last 50 readings)
  const levelHistory = useMemo(() => {
    return history
      .filter((d): d is AudioPreviewData => d.type === 'audio')
      .slice(-50)
      .map((d) => d.rms_level)
  }, [history])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Audio Preview</h3>
          <StatusBadge status={status} />
        </div>
        {stream.config && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {'sample_rate' in stream.config && (
              <span>
                <span className="text-slate-500">Rate:</span>{' '}
                <span className="font-mono">{String(stream.config.sample_rate)} Hz</span>
              </span>
            )}
            {'channels' in stream.config && (
              <span>
                <span className="text-slate-500">Ch:</span>{' '}
                <span className="font-mono">{String(stream.config.channels)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-6">
        {status === 'connecting' && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Connecting to audio stream...
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            {error || 'Connection failed'}
          </div>
        )}

        {(status === 'connected' || audioData) && (
          <div className="space-y-6">
            {/* Level Meters */}
            <div className="space-y-3">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Level</div>
              <LevelMeter
                label="RMS"
                level={audioData?.rms_level ?? 0}
                db={audioData?.rms_db ?? -96}
                color="cyan"
              />
              <LevelMeter
                label="Peak"
                level={audioData?.peak_level ?? 0}
                db={audioData?.peak_db ?? -96}
                color="yellow"
              />
            </div>

            {/* Level History Waveform */}
            {levelHistory.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Level History</div>
                <div className="flex items-end gap-px h-16 bg-slate-950 rounded-lg p-2">
                  {levelHistory.map((level, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm transition-all"
                      style={{
                        height: `${Math.max(2, level * 100)}%`,
                        backgroundColor: level > 0.8 ? '#ef4444' : level > 0.5 ? '#eab308' : '#06b6d4',
                        opacity: 0.4 + (i / levelHistory.length) * 0.6,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Numeric readout */}
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-slate-950 rounded-lg p-3">
                <div className="text-2xl font-mono text-cyan-300">
                  {audioData ? audioData.rms_db.toFixed(1) : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-1">RMS (dB)</div>
              </div>
              <div className="bg-slate-950 rounded-lg p-3">
                <div className="text-2xl font-mono text-yellow-300">
                  {audioData ? audioData.peak_db.toFixed(1) : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-1">Peak (dB)</div>
              </div>
            </div>
          </div>
        )}

        {status === 'idle' && !audioData && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            Click to preview live audio levels
          </div>
        )}
      </div>
    </div>
  )
}

function LevelMeter({
  label,
  level,
  db,
  color,
}: {
  label: string
  level: number
  db: number
  color: 'cyan' | 'yellow'
}) {
  const barColor = level > 0.8 ? 'bg-red-500' : color === 'cyan' ? 'bg-cyan-500' : 'bg-yellow-500'
  const width = Math.max(0, Math.min(100, level * 100))

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-8 font-mono">{label}</span>
      <div className="flex-1 h-4 bg-slate-950 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-75 ${barColor}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 font-mono w-16 text-right">{db.toFixed(1)} dB</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    idle: 'bg-slate-500/20 text-slate-400',
    connecting: 'bg-yellow-500/20 text-yellow-300',
    connected: 'bg-green-500/20 text-green-300',
    error: 'bg-red-500/20 text-red-400',
  }
  const labels: Record<string, string> = {
    idle: 'Idle',
    connecting: 'Connecting...',
    connected: 'Live',
    error: 'Error',
  }
  return (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${styles[status] || styles.idle}`}>
      {status === 'connected' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />}
      {labels[status] || status}
    </span>
  )
}
