// Entity Types

export interface EntityType {
  id: string
  name: string
  display_name: string
  description?: string
  icon?: string
  state_schema?: Record<string, unknown>
  default_state: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Entity {
  id: string
  name: string
  slug: string
  entity_type_id: string
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
  entity_type?: EntityType
  children?: Entity[]
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

// State Change Event (from message bus)
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
  validation_warnings?: ValidationWarning[]
}

// =============================================================================
// Variable Definition Types
// =============================================================================

export type VariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'color'
  | 'vector2'
  | 'vector3'
  | 'range'
  | 'enum'
  | 'object'

export type VariableDirection = 'input' | 'output'

export interface VariableDefinition {
  name: string
  type: VariableType
  direction: VariableDirection
  description?: string
  defaultValue?: unknown
  required?: boolean
  config?: Record<string, unknown>
}

export interface EntityVariables {
  inputs: VariableDefinition[]
  outputs: VariableDefinition[]
}

export interface EntityVariablesResponse {
  entity_id: string
  entity_slug: string
  variables: EntityVariables
}

export interface ValidationWarning {
  variable_name: string
  expected_type: string
  actual_type: string
  message: string
  severity: 'warning' | 'info'
}

export interface StateValidationResult {
  entity_id: string
  valid: boolean
  warnings: ValidationWarning[]
  missing_required: string[]
  undefined_keys: string[]
}

// Device Types (from existing API)
export interface Device {
  id: string
  name: string
  device_type: 'arduino' | 'raspberry_pi' | 'esp32' | 'touchdesigner' | 'max_msp' | 'unreal_engine' | 'web_client' | 'mobile_client' | (string & {})
  hardware_id: string
  firmware_version?: string
  ip_address?: string
  location?: Record<string, unknown>
  metadata?: Record<string, unknown>
  status: 'online' | 'offline' | 'error' | 'maintenance'
  last_seen?: string
  created_at: string
  updated_at: string
}

// =============================================================================
// Routing Types
// =============================================================================

export interface RoutingDevice {
  id: string
  name: string
  device_type: string
  icon: string
  color: string
  inputs: string[]
  outputs: string[]
  metadata: Record<string, unknown>
  position_x: number
  position_y: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RoutingDeviceCreate {
  name: string
  device_type: string
  icon?: string
  color?: string
  inputs?: string[]
  outputs?: string[]
  metadata?: Record<string, unknown>
  position_x?: number
  position_y?: number
  sort_order?: number
}

export interface RoutingDeviceUpdate {
  name?: string
  device_type?: string
  icon?: string
  color?: string
  inputs?: string[]
  outputs?: string[]
  metadata?: Record<string, unknown>
  position_x?: number
  position_y?: number
  sort_order?: number
}

export interface RouteData {
  id: string
  from: string
  fromPort: string
  to: string
  toPort: string
  preset_id?: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface RouteCreate {
  from: string
  fromPort: string
  to: string
  toPort: string
  metadata?: Record<string, unknown>
}

export interface RoutePreset {
  id: string
  name: string
  description?: string
  metadata: Record<string, unknown>
  is_active: boolean
  route_count: number
  created_at: string
  updated_at: string
}

export interface RoutePresetCreate {
  name: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface RoutePresetUpdate {
  name?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface RoutePresetDetail extends RoutePreset {
  routes: RouteData[]
}

export interface RoutingState {
  devices: RoutingDevice[]
  routes: RouteData[]
  presets: RoutePreset[]
}

// =============================================================================
// Stream Types
// =============================================================================

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

export interface StreamRegistryState {
  streams: StreamInfo[]
  sessions: StreamSession[]
  stream_types: StreamTypeInfo[]
}

// Preview types
export interface PreviewInfo {
  status: 'connected' | 'connection_info'
  name: string
  stream_type: string
  protocol: string
  publisher_id?: string
  publisher_address?: string
  publisher_port?: number
  address?: string
  port?: number
  local_port?: number
  session_id?: string
  config?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface SensorPreviewData {
  type: 'sensor'
  seq: number
  center_freq: number
  sample_rate: number
  fft_size: number
  power_db: number[]
  _seq: number
}

export interface AudioPreviewData {
  type: 'audio'
  samples: number
  rms_db: number
  peak_db: number
  rms_level: number
  peak_level: number
  _seq: number
}

export interface DataPreviewData {
  type: string
  _seq: number
  [key: string]: unknown
}

export type PreviewData = SensorPreviewData | AudioPreviewData | DataPreviewData
