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
}

// Device Types (from existing API)
export interface Device {
  id: string
  name: string
  device_type: string
  hardware_id: string
  firmware_version?: string
  ip_address?: string
  location?: Record<string, unknown>
  metadata?: Record<string, unknown>
  status: string
  last_seen?: string
  created_at: string
  updated_at: string
}
