'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { StreamInfo, SensorPreviewData } from '@/lib/types'
import { useStreamPreview } from '@/hooks/useStreamPreview'

interface SensorPreviewProps {
  stream: StreamInfo
}

export function SensorPreview({ stream }: SensorPreviewProps) {
  const { status, data, info, error } = useStreamPreview(stream.id)
  const sensorData = data?.type === 'sensor' ? (data as SensorPreviewData) : null

  // Build chart data from the latest spectrum
  const chartData = useMemo(() => {
    if (!sensorData) return []

    const { power_db, center_freq, sample_rate, fft_size } = sensorData
    const freqStart = center_freq - sample_rate / 2
    const freqStep = sample_rate / fft_size

    // Downsample to ~256 points for smooth rendering
    const step = Math.max(1, Math.floor(power_db.length / 256))
    const points = []
    for (let i = 0; i < power_db.length; i += step) {
      const freq = freqStart + i * freqStep
      points.push({
        freq: freq / 1e6,  // MHz
        power: power_db[i],
      })
    }
    return points
  }, [sensorData])

  // Compute summary metrics
  const metrics = useMemo(() => {
    if (!sensorData) return null
    const { power_db, center_freq, sample_rate } = sensorData
    const peak = Math.max(...power_db)
    const sorted = [...power_db].sort((a, b) => a - b)
    const noise = sorted[Math.floor(sorted.length * 0.5)]
    const snr = peak - noise
    return {
      centerMHz: (center_freq / 1e6).toFixed(3),
      bandwidthMHz: (sample_rate / 1e6).toFixed(1),
      peakDb: peak.toFixed(1),
      noiseDb: noise.toFixed(1),
      snrDb: snr.toFixed(1),
      bins: sensorData.fft_size,
    }
  }, [sensorData])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Spectrum Preview</h3>
          <StatusBadge status={status} />
        </div>
        {metrics && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>
              <span className="text-slate-500">Center:</span>{' '}
              <span className="text-cyan-300 font-mono">{metrics.centerMHz} MHz</span>
            </span>
            <span>
              <span className="text-slate-500">BW:</span>{' '}
              <span className="font-mono">{metrics.bandwidthMHz} MHz</span>
            </span>
            <span>
              <span className="text-slate-500">Peak:</span>{' '}
              <span className="text-yellow-300 font-mono">{metrics.peakDb} dB</span>
            </span>
            <span>
              <span className="text-slate-500">SNR:</span>{' '}
              <span className="text-green-300 font-mono">{metrics.snrDb} dB</span>
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="p-4">
        {status === 'connecting' && (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Connecting to stream...
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center h-64 text-red-400 text-sm">
            {error || 'Connection failed'}
          </div>
        )}

        {(status === 'connected' || chartData.length > 0) && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="spectrumGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="freq"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${v.toFixed(1)}`}
                label={{ value: 'MHz', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                domain={[-80, 0]}
                label={{ value: 'dB', position: 'insideTopLeft', offset: 10, fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: 11,
                }}
                labelFormatter={(v) => `${Number(v).toFixed(3)} MHz`}
                formatter={(v: number) => [`${v.toFixed(1)} dB`, 'Power']}
              />
              <Area
                type="monotone"
                dataKey="power"
                stroke="#06b6d4"
                strokeWidth={1.5}
                fill="url(#spectrumGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {status === 'idle' && chartData.length === 0 && (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Click &ldquo;Start Preview&rdquo; to view live spectrum data
          </div>
        )}
      </div>

      {/* Footer metrics */}
      {metrics && (
        <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
          <span>FFT: {metrics.bins} bins</span>
          <span>Noise floor: {metrics.noiseDb} dB</span>
        </div>
      )}
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
