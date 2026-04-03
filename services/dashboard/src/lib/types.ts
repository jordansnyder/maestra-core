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
  configuration: Record<string, unknown>
  status: 'online' | 'offline' | 'error' | 'maintenance' | 'pending'
  last_seen?: string
  created_at: string
  updated_at: string
}

// =============================================================================
// Discovery & Provisioning Types
// =============================================================================

export interface BlockedDevice {
  id: string
  hardware_id: string
  reason?: string
  blocked_at: string
}

export interface DeviceProvision {
  device_id: string
  provision_status: 'pending' | 'approved' | 'provisioned'
  api_url: string
  nats_url: string
  mqtt_broker: string
  mqtt_port: number
  ws_url?: string
  entity_id?: string
  env_vars: Record<string, string>
}

export interface DeviceUpdate {
  name?: string
  device_type?: string
  firmware_version?: string
  ip_address?: string
  location?: Record<string, unknown>
  metadata?: Record<string, unknown>
  configuration?: Record<string, unknown>
}

export interface DeviceApproval {
  name?: string
  entity_id?: string
  env_vars?: Record<string, string>
  device_type?: string
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
  multicast_group?: string
  multicast_port?: number
  delivery_mode: string
  active_subscribers: number
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

export interface StreamSubscriber {
  subscriber_id: string
  stream_id: string
  stream_name: string
  stream_type: string
  consumer_id: string
  consumer_address: string
  joined_at: string
  metadata: Record<string, unknown>
}

export interface StreamRegistryState {
  streams: StreamInfo[]
  sessions: StreamSession[]
  stream_types: StreamTypeInfo[]
  subscribers: StreamSubscriber[]
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

// =============================================================================
// DMX / Art-Net Types
// =============================================================================

export interface UniverseConfig {
  id: number
  artnet_universe: number
  port_label: string
  description: string
  color?: string
}

export interface DMXGroup {
  id: string
  name: string
  color?: string
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // populated by GET /dmx/groups/{id}
  fixture_count?: number
  cue_count?: number
  sequence_count?: number
}

export interface DMXGroupCreate {
  name: string
  color?: string
  sort_order?: number
  metadata?: Record<string, unknown>
}

export interface DMXGroupUpdate {
  name?: string
  color?: string
  sort_order?: number
  metadata?: Record<string, unknown>
}

export interface DMXNode {
  id: string
  name: string
  slug?: string
  manufacturer?: string
  model?: string
  ip_address: string
  mac_address?: string
  artnet_port: number
  universe_count: number
  universes: UniverseConfig[]
  poe_powered: boolean
  firmware_version?: string
  notes?: string
  device_id?: string
  last_seen?: string
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DMXNodeCreate {
  name: string
  slug?: string
  manufacturer?: string
  model?: string
  ip_address: string
  mac_address?: string
  artnet_port?: number
  universe_count?: number
  universes?: UniverseConfig[]
  poe_powered?: boolean
  firmware_version?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface DMXNodeUpdate {
  name?: string
  manufacturer?: string
  model?: string
  ip_address?: string
  mac_address?: string
  artnet_port?: number
  universe_count?: number
  universes?: UniverseConfig[]
  poe_powered?: boolean
  firmware_version?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface ChannelMapping {
  offset: number
  type: 'range' | 'number' | 'boolean' | 'enum' | 'color'
  label?: string
  enum_dmx_values?: Record<string, number>
}

export interface DMXFixture {
  id: string
  name: string
  label?: string
  ofl_manufacturer?: string
  ofl_model?: string
  node_id: string
  universe: number
  start_channel: number
  channel_count: number
  fixture_mode?: string
  channel_map: Record<string, ChannelMapping>
  entity_id?: string
  /** Slug of the linked entity — read-only on the fixture, derived via JOIN. */
  entity_slug?: string
  ofl_fixture_id?: string
  group_id?: string
  position_x: number
  position_y: number
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DMXFixtureCreate {
  name: string
  label?: string
  node_id: string
  universe: number
  start_channel: number
  channel_count?: number
  fixture_mode?: string
  channel_map?: Record<string, ChannelMapping>
  entity_id?: string
  /** Desired slug for the auto-created linked entity. Returns 409 if already in use. */
  entity_slug?: string
  ofl_fixture_id?: string
  group_id?: string
  position_x?: number
  position_y?: number
  metadata?: Record<string, unknown>
}

export interface DMXFixtureUpdate {
  name?: string
  label?: string
  node_id?: string
  universe?: number
  start_channel?: number
  channel_count?: number
  fixture_mode?: string
  channel_map?: Record<string, ChannelMapping>
  /** Pass null explicitly to unlink from an entity; omit to leave unchanged. */
  entity_id?: string | null
  /** New slug for the linked entity. Returns 409 if already in use. */
  entity_slug?: string
  /** Pass null explicitly to remove from a group; omit to leave unchanged. */
  group_id?: string | null
  position_x?: number
  position_y?: number
  metadata?: Record<string, unknown>
}

export interface FixturePositionUpdate {
  id: string
  position_x: number
  position_y: number
}

export interface DMXCueNode {
  node_id: string
  node_name: string
  universes: number[]
}

export interface DMXCue {
  id: string
  name: string
  fade_duration: number
  sort_order: number
  group_id?: string
  created_at: string
  updated_at: string
  /** Art-Net nodes and universes used by fixtures snapshotted in this cue. */
  nodes: DMXCueNode[]
}

export interface DMXCueRecallResult {
  recalled: number
  skipped: number
  cue_id: string
  cue_name: string
}

export interface DMXCuePlacement {
  id: string
  sequence_id: string
  cue_id: string
  cue_name: string
  position: number
  transition_time: number // seconds; 0 = hard cut
  hold_duration: number   // seconds to hold before advancing
}

export interface DMXSequence {
  id: string
  name: string
  fade_out_duration: number
  sort_order: number
  group_id?: string
  cue_placements: DMXCuePlacement[]
  created_at: string
  updated_at: string
}

export interface DMXCueFixtureSnapshot {
  fixture_id: string
  entity_id: string
  state: Record<string, number>
}

export interface DataPreviewData {
  type: string
  _seq: number
  [key: string]: unknown
}

export type PreviewData = SensorPreviewData | AudioPreviewData | DataPreviewData

// =============================================================================
// OSC Mapping Types
// =============================================================================

export interface OscMapping {
  id: string
  osc_address: string
  entity_slug: string
  state_key: string | null
  state_keys: string[] | null
  operation: 'update' | 'set'
  enabled: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export interface OscMappingImportResult {
  created: number
  updated: number
  failed: number
  errors: string[]
}

// =============================================================================
// OFL Fixture Library Types
// =============================================================================

export interface OFLManufacturer {
  id: string
  key: string
  name: string
  website?: string
  fixture_count?: number
  synced_at?: string
}

export interface OFLChannelDef {
  name: string
  type: string
  defaultValue?: number
}

export interface OFLFixtureMode {
  shortName: string
  name: string
  channels: OFLChannelDef[]
  channel_count: number
}

export interface OFLFixture {
  id: string
  manufacturer_key: string
  fixture_key: string
  name: string
  source: 'ofl' | 'custom'
  categories: string[]
  channel_count_min?: number
  channel_count_max?: number
  physical?: Record<string, unknown>
  modes: OFLFixtureMode[]
  ofl_last_modified?: string
  synced_at?: string
}

export interface OFLSyncStatus {
  ran_at: string
  ofl_commit_sha?: string
  ofl_schema_version?: string
  fixtures_added: number
  fixtures_updated: number
  fixtures_skipped: number
  fixtures_errored: number
  status: 'success' | 'partial' | 'failed'
  errors: unknown[]
}

// =============================================================================
// Show Control
// =============================================================================

export type ShowPhase = 'idle' | 'pre_show' | 'active' | 'paused' | 'post_show' | 'shutdown'

export interface ShowState {
  phase: ShowPhase
  previous_phase: ShowPhase | null
  transition_time: string | null
  source: string | null
  context: Record<string, unknown>
}

export interface ShowTransitionResponse {
  status: string
  state: ShowState
}

export interface ShowValidTransitions {
  current_phase: ShowPhase
  valid_transitions: ShowPhase[]
}

export interface ShowHistoryEntry {
  time: string
  state: ShowState
  source: string | null
}

export interface ShowScheduleEntry {
  cron: string
  transition: string
}

export interface ShowSchedule {
  id: string
  name: string
  enabled: boolean
  timezone: string
  entries: ShowScheduleEntry[]
  created_at: string
  updated_at: string
}

export interface ShowScheduleCreate {
  name: string
  enabled?: boolean
  timezone?: string
  entries: ShowScheduleEntry[]
}

export interface ShowSideEffect {
  id: string
  from_phase: string
  to_phase: string
  action_type: 'entity_state_update' | 'nats_publish' | 'internal_call'
  action_config: Record<string, unknown>
  enabled: boolean
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}
