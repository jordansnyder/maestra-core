/**
 * Maestra SDK Type Definitions
 */

export interface ConnectionConfig {
  apiUrl: string
  wsUrl?: string
  mqttUrl?: string
  clientId?: string
}

export interface EntityType {
  id: string
  name: string
  display_name: string
  description?: string
  icon?: string
  default_state: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EntityData {
  id: string
  name: string
  slug: string
  entity_type_id: string
  entity_type?: EntityType
  parent_id?: string
  path?: string
  state: Record<string, unknown>
  state_updated_at: string
  status: string
  description?: string
  tags: string[]
  metadata: Record<string, unknown>
  device_id?: string
  created_at: string
  updated_at: string
  children?: EntityData[]
}

export interface EntityCreate {
  name: string
  entity_type_id: string
  slug?: string
  parent_id?: string
  description?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  state?: Record<string, unknown>
  device_id?: string
}

export interface EntityUpdate {
  name?: string
  parent_id?: string
  description?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  status?: string
  device_id?: string
}

export interface StateUpdate {
  state: Record<string, unknown>
  source?: string
}

export interface StateResponse {
  entity_id: string
  entity_slug: string
  state: Record<string, unknown>
  state_updated_at: string
}

export interface StateChangeEvent {
  type: 'state_changed'
  entity_id: string
  entity_slug: string
  entity_type: string
  path?: string
  previous_state: Record<string, unknown>
  current_state: Record<string, unknown>
  changed_keys: string[]
  source?: string
  timestamp: string
}

export interface EntityTreeNode {
  id: string
  name: string
  slug: string
  entity_type_id: string
  entity_type_name?: string
  status: string
  state: Record<string, unknown>
  children: EntityTreeNode[]
}

export type StateChangeCallback = (event: StateChangeEvent) => void
export type UnsubscribeFunction = () => void

// ===== Stream Types =====

export type StreamType = 'ndi' | 'audio' | 'video' | 'texture' | 'sensor' | 'osc' | 'midi' | 'data' | 'srt' | 'spout' | 'syphon'
export type StreamProtocol = 'tcp' | 'udp' | 'ndi' | 'srt' | 'webrtc' | 'spout' | 'syphon' | 'shared_memory'

export interface StreamTypeInfo {
  id: string
  name: string
  display_name: string
  description?: string
  icon?: string
  default_config: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface StreamTypeCreate {
  name: string
  display_name: string
  description?: string
  icon?: string
  default_config?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface StreamInfo {
  id: string
  name: string
  stream_type: string
  publisher_id: string
  protocol: string
  address: string
  port: number
  entity_id?: string
  device_id?: string
  config: Record<string, unknown>
  metadata: Record<string, unknown>
  advertised_at: string
  last_heartbeat: string
  active_sessions: number
}

export interface StreamAdvertise {
  name: string
  stream_type: StreamType
  publisher_id: string
  protocol: StreamProtocol
  address: string
  port: number
  entity_id?: string
  device_id?: string
  config?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface StreamRequest {
  consumer_id: string
  consumer_address: string
  consumer_port?: number
  config?: Record<string, unknown>
}

export interface StreamOffer {
  session_id: string
  stream_id: string
  stream_name: string
  stream_type: string
  protocol: string
  publisher_address: string
  publisher_port: number
  transport_config: Record<string, unknown>
}

export interface StreamSession {
  session_id: string
  stream_id: string
  stream_name: string
  stream_type: string
  publisher_id: string
  publisher_address: string
  consumer_id: string
  consumer_address: string
  protocol: string
  transport_config: Record<string, unknown>
  started_at: string
  status: string
}

export interface StreamSessionHistory {
  time: string
  session_id: string
  stream_id: string
  stream_name: string
  stream_type: string
  publisher_id: string
  consumer_id: string
  protocol: string
  status: string
  duration_seconds?: number
  bytes_transferred: number
  error_message?: string
}

export interface StreamRegistryState {
  streams: StreamInfo[]
  sessions: StreamSession[]
  stream_types: StreamTypeInfo[]
}

export type StreamEventCallback = (stream: StreamInfo) => void
export type SessionEventCallback = (session: StreamSession) => void
