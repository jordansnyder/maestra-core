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
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface SignalTypeInfo {
  label: string
  color: string
}

export const SIGNAL_TYPES: Record<string, SignalTypeInfo> = {
  sdi: { label: 'SDI', color: '#3185FC' },
  hdmi: { label: 'HDMI', color: '#35CE8D' },
  audio: { label: 'Audio', color: '#F9A620' },
  data: { label: 'Data', color: '#B56CED' },
  tc: { label: 'Timecode', color: '#ADB5BD' },
  stream: { label: 'Stream', color: '#FF6B6B' },
}

export const DEVICES: RoutingDevice[] = [
  { id: 'cam-a', name: 'RED V-Raptor', type: 'camera', icon: '\uD83C\uDFAC', inputs: [], outputs: ['sdi-out', 'hdmi-out', 'tc-out'], color: '#E84855' },
  { id: 'cam-b', name: 'Sony FX6', type: 'camera', icon: '\uD83C\uDFAC', inputs: [], outputs: ['sdi-out', 'hdmi-out', 'tc-out'], color: '#E84855' },
  { id: 'cam-c', name: 'BMPCC 6K Pro', type: 'camera', icon: '\uD83C\uDFAC', inputs: [], outputs: ['sdi-out', 'hdmi-out'], color: '#E84855' },
  { id: 'mon-a', name: 'SmallHD Cine 13', type: 'monitor', icon: '\uD83D\uDDA5', inputs: ['sdi-in', 'hdmi-in'], outputs: ['sdi-loop'], color: '#3185FC' },
  { id: 'mon-b', name: 'Atomos Ninja V+', type: 'recorder', icon: '\u23FA', inputs: ['hdmi-in', 'sdi-in'], outputs: ['hdmi-out'], color: '#3185FC' },
  { id: 'switch-a', name: 'ATEM Mini Extreme', type: 'switcher', icon: '\uD83D\uDD00', inputs: ['hdmi-1', 'hdmi-2', 'hdmi-3', 'hdmi-4'], outputs: ['pgm-out', 'aux-out', 'stream-out'], color: '#35CE8D' },
  { id: 'audio-a', name: 'Sound Devices 888', type: 'audio', icon: '\uD83C\uDF99', inputs: ['ch-1', 'ch-2', 'ch-3', 'ch-4'], outputs: ['mix-L', 'mix-R', 'iso-1', 'iso-2'], color: '#F9A620' },
  { id: 'audio-b', name: 'Wireless Lav Kit', type: 'audio', icon: '\uD83D\uDCE1', inputs: [], outputs: ['ch-out'], color: '#F9A620' },
  { id: 'ai-node', name: 'Maestra AI Engine', type: 'ai', icon: '\u2726', inputs: ['video-in', 'audio-in', 'data-in'], outputs: ['processed-v', 'processed-a', 'metadata', 'llm-out'], color: '#B56CED' },
  { id: 'storage', name: 'NAS / Frame.io', type: 'storage', icon: '\uD83D\uDCBE', inputs: ['ingest-1', 'ingest-2', 'ingest-3'], outputs: ['playback'], color: '#6C757D' },
  { id: 'stream', name: 'Live Stream Out', type: 'output', icon: '\uD83D\uDCE1', inputs: ['stream-in'], outputs: [], color: '#FF6B6B' },
  { id: 'tc-gen', name: 'Timecode Generator', type: 'sync', icon: '\u23F1', inputs: [], outputs: ['tc-out', 'genlock'], color: '#ADB5BD' },
]

export function getSignalType(portName: string): string {
  if (portName.includes('sdi')) return 'sdi'
  if (portName.includes('hdmi')) return 'hdmi'
  if (portName.includes('ch-') || portName.includes('mix') || portName.includes('iso') || portName.includes('audio')) return 'audio'
  if (portName.includes('tc') || portName.includes('genlock')) return 'tc'
  if (portName.includes('stream') || portName.includes('pgm') || portName.includes('aux')) return 'sdi'
  if (portName.includes('data') || portName.includes('metadata') || portName.includes('llm') || portName.includes('processed') || portName.includes('ingest') || portName.includes('playback') || portName.includes('video')) return 'data'
  return 'data'
}

export const DEFAULT_ROUTES: Route[] = [
  { from: 'cam-a', fromPort: 'sdi-out', to: 'switch-a', toPort: 'hdmi-1' },
  { from: 'cam-b', fromPort: 'sdi-out', to: 'switch-a', toPort: 'hdmi-2' },
  { from: 'cam-c', fromPort: 'hdmi-out', to: 'switch-a', toPort: 'hdmi-3' },
  { from: 'switch-a', fromPort: 'pgm-out', to: 'mon-a', toPort: 'sdi-in' },
  { from: 'switch-a', fromPort: 'aux-out', to: 'ai-node', toPort: 'video-in' },
  { from: 'switch-a', fromPort: 'stream-out', to: 'stream', toPort: 'stream-in' },
  { from: 'audio-b', fromPort: 'ch-out', to: 'audio-a', toPort: 'ch-1' },
  { from: 'audio-a', fromPort: 'mix-L', to: 'ai-node', toPort: 'audio-in' },
  { from: 'ai-node', fromPort: 'processed-v', to: 'mon-b', toPort: 'hdmi-in' },
  { from: 'ai-node', fromPort: 'metadata', to: 'storage', toPort: 'ingest-1' },
  { from: 'cam-a', fromPort: 'hdmi-out', to: 'mon-b', toPort: 'sdi-in' },
  { from: 'tc-gen', fromPort: 'tc-out', to: 'audio-a', toPort: 'ch-4' },
]
