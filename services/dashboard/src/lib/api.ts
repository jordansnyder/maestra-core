// API Client for Fleet Manager

import {
  Entity, EntityCreate, EntityUpdate, EntityType, EntityTreeNode,
  StateUpdate, StateResponse, Device,
  VariableDefinition, EntityVariables, EntityVariablesResponse, StateValidationResult,
  RoutingDevice, RoutingDeviceCreate, RoutingDeviceUpdate,
  RouteData, RouteCreate, RoutePreset, RoutePresetCreate, RoutePresetUpdate,
  RoutePresetDetail, RoutingState,
  StreamInfo, StreamSession, StreamTypeInfo, StreamRegistryState,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, error.detail || 'Request failed')
  }

  return response.json()
}

// Entity Types
export const entityTypesApi = {
  list: () => fetchApi<EntityType[]>('/entities/types'),

  get: (id: string) => fetchApi<EntityType>(`/entities/types/${id}`),

  getByName: (name: string) => fetchApi<EntityType>(`/entities/types/by-name/${name}`),

  create: (data: Partial<EntityType>) =>
    fetchApi<EntityType>('/entities/types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<EntityType>) =>
    fetchApi<EntityType>(`/entities/types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ status: string }>(`/entities/types/${id}`, {
      method: 'DELETE',
    }),
}

// Entities
export const entitiesApi = {
  list: (params?: {
    entity_type?: string
    parent_id?: string
    root_only?: boolean
    status?: string
    tags?: string[]
    search?: string
    limit?: number
    offset?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.entity_type) searchParams.set('entity_type', params.entity_type)
    if (params?.parent_id) searchParams.set('parent_id', params.parent_id)
    if (params?.root_only) searchParams.set('root_only', 'true')
    if (params?.status) searchParams.set('status', params.status)
    if (params?.tags) params.tags.forEach(t => searchParams.append('tags', t))
    if (params?.search) searchParams.set('search', params.search)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())

    const query = searchParams.toString()
    return fetchApi<Entity[]>(`/entities${query ? `?${query}` : ''}`)
  },

  get: (id: string, includeChildren = false) =>
    fetchApi<Entity>(`/entities/${id}${includeChildren ? '?include_children=true' : ''}`),

  getBySlug: (slug: string, includeChildren = false) =>
    fetchApi<Entity>(`/entities/by-slug/${slug}${includeChildren ? '?include_children=true' : ''}`),

  create: (data: EntityCreate) =>
    fetchApi<Entity>('/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: EntityUpdate) =>
    fetchApi<Entity>(`/entities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string, cascade = false) =>
    fetchApi<{ status: string }>(`/entities/${id}?cascade=${cascade}`, {
      method: 'DELETE',
    }),

  // Hierarchy
  getAncestors: (id: string) => fetchApi<Entity[]>(`/entities/${id}/ancestors`),

  getDescendants: (id: string, maxDepth = 10) =>
    fetchApi<Entity[]>(`/entities/${id}/descendants?max_depth=${maxDepth}`),

  getSiblings: (id: string) => fetchApi<Entity[]>(`/entities/${id}/siblings`),

  getTree: (rootId?: string, entityType?: string, maxDepth = 5) => {
    const params = new URLSearchParams()
    if (rootId) params.set('root_id', rootId)
    if (entityType) params.set('entity_type', entityType)
    params.set('max_depth', maxDepth.toString())
    return fetchApi<EntityTreeNode[]>(`/entities/tree?${params}`)
  },

  // State
  getState: (id: string, paths?: string[]) => {
    const params = paths?.length ? `?${paths.map(p => `paths=${p}`).join('&')}` : ''
    return fetchApi<StateResponse>(`/entities/${id}/state${params}`)
  },

  updateState: (id: string, data: StateUpdate) =>
    fetchApi<StateResponse>(`/entities/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  setState: (id: string, data: StateUpdate) =>
    fetchApi<StateResponse>(`/entities/${id}/state`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Bulk operations
  bulkGetState: (slugs: string[]) =>
    fetchApi<Record<string, Record<string, unknown>>>('/entities/state/bulk-get', {
      method: 'POST',
      body: JSON.stringify(slugs),
    }),

  bulkUpdateState: (updates: Record<string, Record<string, unknown>>, source?: string) =>
    fetchApi<{ results: Record<string, { status: string; state?: Record<string, unknown> }> }>(
      `/entities/state/bulk-update${source ? `?source=${source}` : ''}`,
      {
        method: 'POST',
        body: JSON.stringify(updates),
      }
    ),

  // Variable management
  getVariables: (id: string) =>
    fetchApi<EntityVariablesResponse>(`/entities/${id}/variables`),

  setVariables: (id: string, variables: EntityVariables) =>
    fetchApi<EntityVariablesResponse>(`/entities/${id}/variables`, {
      method: 'PUT',
      body: JSON.stringify(variables),
    }),

  addVariable: (id: string, variable: Omit<VariableDefinition, 'name'> & { name: string }) =>
    fetchApi<VariableDefinition>(`/entities/${id}/variables`, {
      method: 'POST',
      body: JSON.stringify(variable),
    }),

  updateVariable: (id: string, variableName: string, update: Partial<VariableDefinition>) =>
    fetchApi<VariableDefinition>(`/entities/${id}/variables/${variableName}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  deleteVariable: (id: string, variableName: string) =>
    fetchApi<{ status: string }>(`/entities/${id}/variables/${variableName}`, {
      method: 'DELETE',
    }),

  validateVariables: (id: string) =>
    fetchApi<StateValidationResult>(`/entities/${id}/variables/validate`, {
      method: 'POST',
    }),
}

// Health check
export const healthApi = {
  check: () => fetchApi<{ status: string; service: string; timestamp: string }>('/health'),

  status: () =>
    fetchApi<{
      service: string
      version: string
      devices: { total: number; online: number; offline: number }
      entities: { total: number }
      message_bus: { connected: boolean }
      timestamp: string
    }>('/status'),
}

// Devices API
export const devicesApi = {
  list: () => fetchApi<Device[]>('/devices'),

  get: (id: string) => fetchApi<Device>(`/devices/${id}`),

  register: (data: {
    name: string
    device_type: string
    hardware_id: string
    firmware_version?: string
    ip_address?: string
    location?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) =>
    fetchApi<Device>('/devices/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ status: string }>(`/devices/${id}`, {
      method: 'DELETE',
    }),

  heartbeat: (data: { hardware_id: string; status: string; metadata?: Record<string, unknown> }) =>
    fetchApi<{ status: string; device_id: string }>('/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// Routing API
export const routingApi = {
  // Full state (single fetch for frontend)
  getState: () => fetchApi<RoutingState>('/routing/state'),

  // Routing Devices
  listDevices: (deviceType?: string) => {
    const params = new URLSearchParams()
    if (deviceType) params.set('device_type', deviceType)
    const query = params.toString()
    return fetchApi<RoutingDevice[]>(`/routing/devices${query ? `?${query}` : ''}`)
  },

  getDevice: (id: string) => fetchApi<RoutingDevice>(`/routing/devices/${id}`),

  createDevice: (data: RoutingDeviceCreate) =>
    fetchApi<RoutingDevice>('/routing/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDevice: (id: string, data: RoutingDeviceUpdate) =>
    fetchApi<RoutingDevice>(`/routing/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteDevice: (id: string) =>
    fetchApi<{ status: string }>(`/routing/devices/${id}`, {
      method: 'DELETE',
    }),

  updatePositions: (positions: Record<string, { x: number; y: number }>) =>
    fetchApi<{ status: string; updated: number }>('/routing/devices/positions', {
      method: 'PUT',
      body: JSON.stringify(positions),
    }),

  // Routes
  listRoutes: (presetId?: string) => {
    const params = new URLSearchParams()
    if (presetId) {
      params.set('preset_id', presetId)
      params.set('active_only', 'false')
    }
    const query = params.toString()
    return fetchApi<RouteData[]>(`/routing/routes${query ? `?${query}` : ''}`)
  },

  createRoute: (data: RouteCreate) =>
    fetchApi<RouteData>('/routing/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteRouteById: (id: string) =>
    fetchApi<{ status: string }>(`/routing/routes/${id}`, {
      method: 'DELETE',
    }),

  deleteRoute: (route: RouteCreate) => {
    const params = new URLSearchParams()
    params.set('from', route.from)
    params.set('fromPort', route.fromPort)
    params.set('to', route.to)
    params.set('toPort', route.toPort)
    return fetchApi<{ status: string }>(`/routing/routes?${params}`, {
      method: 'DELETE',
    })
  },

  replaceRoutes: (routes: RouteCreate[]) =>
    fetchApi<RouteData[]>('/routing/routes', {
      method: 'PUT',
      body: JSON.stringify({ routes }),
    }),

  clearRoutes: () =>
    fetchApi<{ status: string; deleted_count: number }>('/routing/routes/all', {
      method: 'DELETE',
    }),

  // Presets
  listPresets: () => fetchApi<RoutePreset[]>('/routing/presets'),

  getPreset: (id: string) => fetchApi<RoutePresetDetail>(`/routing/presets/${id}`),

  createPreset: (data: RoutePresetCreate) =>
    fetchApi<RoutePreset>('/routing/presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePreset: (id: string, data: RoutePresetUpdate) =>
    fetchApi<RoutePreset>(`/routing/presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePreset: (id: string) =>
    fetchApi<{ status: string }>(`/routing/presets/${id}`, {
      method: 'DELETE',
    }),

  saveToPreset: (presetId: string) =>
    fetchApi<{ status: string; route_count: number }>(`/routing/presets/${presetId}/save`, {
      method: 'POST',
    }),

  recallPreset: (presetId: string) =>
    fetchApi<{ status: string; preset_name: string; route_count: number }>(
      `/routing/presets/${presetId}/recall`,
      { method: 'POST' }
    ),
}

// Combined API object for convenience
export const api = {
  // Devices
  listDevices: devicesApi.list,
  getDevice: devicesApi.get,
  registerDevice: devicesApi.register,
  deleteDevice: devicesApi.delete,
  deviceHeartbeat: devicesApi.heartbeat,

  // Entities
  listEntities: entitiesApi.list,
  getEntity: entitiesApi.get,
  createEntity: entitiesApi.create,
  updateEntity: entitiesApi.update,
  deleteEntity: entitiesApi.delete,

  // Health
  health: healthApi.check,
  status: healthApi.status,
}

// Streams API
export const streamsApi = {
  getState: () => fetchApi<StreamRegistryState>('/streams/state'),

  listStreams: (streamType?: string) => {
    const params = streamType ? `?stream_type=${streamType}` : ''
    return fetchApi<StreamInfo[]>(`/streams${params}`)
  },

  getStream: (id: string) => fetchApi<StreamInfo>(`/streams/${id}`),

  listSessions: (streamId?: string) => {
    const params = streamId ? `?stream_id=${streamId}` : ''
    return fetchApi<StreamSession[]>(`/streams/sessions${params}`)
  },

  stopSession: (sessionId: string) =>
    fetchApi<{ status: string }>(`/streams/sessions/${sessionId}`, { method: 'DELETE' }),

  listTypes: () => fetchApi<StreamTypeInfo[]>('/streams/types'),

  /** Get the SSE preview URL for a stream (use with EventSource) */
  getPreviewUrl: (id: string) => `${API_URL}/streams/${id}/preview`,
}

export { ApiError }
