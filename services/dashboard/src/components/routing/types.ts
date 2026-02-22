export interface DevicePort {
  name: string
}

export interface RoutingDevice {
  id: string
  name: string
  type: string
  icon: string
  color: string
  inputs: string[]
  outputs: string[]
}

export interface Route {
  id?: string
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface SignalTypeInfo {
  label: string
  color: string
}

export interface RoutePresetInfo {
  id: string
  name: string
  description?: string
  is_active: boolean
  route_count: number
}

export const SIGNAL_TYPES: Record<string, SignalTypeInfo> = {
  sdi: { label: 'SDI', color: '#3185FC' },
  hdmi: { label: 'HDMI', color: '#35CE8D' },
  audio: { label: 'Audio', color: '#F9A620' },
  data: { label: 'Data', color: '#B56CED' },
  tc: { label: 'Timecode', color: '#ADB5BD' },
  stream: { label: 'Stream', color: '#FF6B6B' },
}

export function getSignalType(portName: string): string {
  if (portName.includes('sdi')) return 'sdi'
  if (portName.includes('hdmi')) return 'hdmi'
  if (portName.includes('ch-') || portName.includes('mix') || portName.includes('iso') || portName.includes('audio')) return 'audio'
  if (portName.includes('tc') || portName.includes('genlock')) return 'tc'
  if (portName.includes('stream') || portName.includes('pgm') || portName.includes('aux')) return 'sdi'
  if (portName.includes('data') || portName.includes('metadata') || portName.includes('llm') || portName.includes('processed') || portName.includes('ingest') || portName.includes('playback') || portName.includes('video')) return 'data'
  return 'data'
}
