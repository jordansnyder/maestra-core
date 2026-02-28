'use client'

import type { StreamInfo } from '@/lib/types'
import { SensorPreview } from './SensorPreview'
import { AudioPreview } from './AudioPreview'
import { DataPreview } from './DataPreview'
import { ConnectionPreview } from './ConnectionPreview'

interface StreamPreviewProps {
  stream: StreamInfo
}

/**
 * Dispatches to the appropriate preview component based on stream type.
 *
 * - sensor:  Live Recharts spectrum (SDRF decoded)
 * - audio:   Level meters + waveform
 * - data/osc/midi: JSON log viewer
 * - video/ndi/srt/texture/spout/syphon: Connection info only
 */
export function StreamPreview({ stream }: StreamPreviewProps) {
  switch (stream.stream_type) {
    case 'sensor':
      return <SensorPreview stream={stream} />

    case 'audio':
      return <AudioPreview stream={stream} />

    case 'data':
    case 'osc':
    case 'midi':
      return <DataPreview stream={stream} />

    case 'video':
    case 'ndi':
    case 'srt':
    case 'texture':
    case 'spout':
    case 'syphon':
      return <ConnectionPreview stream={stream} />

    default:
      return <DataPreview stream={stream} />
  }
}

export { SensorPreview, AudioPreview, DataPreview, ConnectionPreview }
