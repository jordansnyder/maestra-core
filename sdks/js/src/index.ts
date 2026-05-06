/**
 * Maestra JavaScript/TypeScript SDK
 * Connect to the Maestra immersive experience platform
 */

export * from './types'
export { discoverMaestra, advertiseDevice, waitForProvisioning } from './discovery'
export { ShowControl } from './show'
export type { ShowPhase, ShowState, ShowTransitionResponse, ShowHistoryEntry, ShowStateCallback } from './show'

import type {
  ConnectionConfig,
  DiscoveryConfig,
  EntityType,
  EntityData,
  EntityCreate,
  EntityUpdate,
  StateUpdate,
  StateResponse,
  StateChangeEvent,
  StateChangeCallback,
  UnsubscribeFunction,
  EntityTreeNode,
  StreamTypeInfo,
  StreamTypeCreate,
  StreamInfo,
  StreamAdvertise,
  StreamRequest,
  StreamOffer,
  StreamSession,
  StreamSessionHistory,
  StreamRegistryState,
  StreamJoinRequest,
  StreamJoinResponse,
  StreamSubscriber,
} from './types'

import { discoverMaestra } from './discovery'

/**
 * Entity State Manager
 * Provides reactive state access and subscriptions
 */
export class EntityState {
  private _state: Record<string, unknown>
  private _callbacks: StateChangeCallback[] = []
  private _entity: Entity

  constructor(entity: Entity, initialState: Record<string, unknown>) {
    this._entity = entity
    this._state = { ...initialState }
  }

  /** Get current state */
  get data(): Record<string, unknown> {
    return { ...this._state }
  }

  /** Get a specific value */
  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    return (this._state[key] as T) ?? defaultValue
  }

  /** Update state (merge) */
  async update(updates: Record<string, unknown>, source?: string): Promise<void> {
    await this._entity['_updateState'](updates, source, false)
  }

  /** Replace entire state */
  async replace(newState: Record<string, unknown>, source?: string): Promise<void> {
    await this._entity['_updateState'](newState, source, true)
  }

  /** Set a single value */
  async set(key: string, value: unknown, source?: string): Promise<void> {
    await this.update({ [key]: value }, source)
  }

  /** Subscribe to state changes */
  onChange(callback: StateChangeCallback): UnsubscribeFunction {
    this._callbacks.push(callback)
    return () => {
      const index = this._callbacks.indexOf(callback)
      if (index > -1) {
        this._callbacks.splice(index, 1)
      }
    }
  }

  /** @internal Apply update from event */
  _applyUpdate(event: StateChangeEvent): void {
    this._state = { ...event.current_state }
    this._callbacks.forEach((cb) => {
      try {
        cb(event)
      } catch (e) {
        console.error('Error in state change callback:', e)
      }
    })
  }
}

/**
 * Entity
 * Represents a Maestra entity with state management
 */
export class Entity {
  private _client: MaestraClient
  private _data: EntityData
  private _subscribed = false

  readonly state: EntityState

  constructor(client: MaestraClient, data: EntityData) {
    this._client = client
    this._data = data
    this.state = new EntityState(this, data.state)
  }

  get id(): string { return this._data.id }
  get name(): string { return this._data.name }
  get slug(): string { return this._data.slug }
  get entityTypeId(): string { return this._data.entity_type_id }
  get entityType(): EntityType | undefined { return this._data.entity_type }
  get parentId(): string | undefined { return this._data.parent_id }
  get path(): string | undefined { return this._data.path }
  get status(): string { return this._data.status }
  get description(): string | undefined { return this._data.description }
  get tags(): string[] { return this._data.tags }
  get metadata(): Record<string, unknown> { return this._data.metadata }
  get createdAt(): string { return this._data.created_at }
  get updatedAt(): string { return this._data.updated_at }

  /** Refresh entity data from server */
  async refresh(): Promise<void> {
    const updated = await this._client.getEntity(this.id)
    this._data = updated._data
    this.state['_state'] = { ...updated._data.state }
  }

  /** Get ancestor entities */
  async getAncestors(): Promise<Entity[]> {
    return this._client.getAncestors(this.id)
  }

  /** Get descendant entities */
  async getDescendants(maxDepth = 10): Promise<Entity[]> {
    return this._client.getDescendants(this.id, maxDepth)
  }

  /** Get immediate children */
  async getChildren(): Promise<Entity[]> {
    return this._client.getEntities({ parentId: this.id })
  }

  /** Delete this entity */
  async delete(cascade = false): Promise<void> {
    await this._client.deleteEntity(this.id, cascade)
  }

  /** Subscribe to real-time state updates */
  async subscribe(): Promise<void> {
    if (this._subscribed) return
    await this._client['_subscribeEntity'](this)
    this._subscribed = true
  }

  /** Unsubscribe from real-time updates */
  async unsubscribe(): Promise<void> {
    if (!this._subscribed) return
    await this._client['_unsubscribeEntity'](this)
    this._subscribed = false
  }

  /** @internal Update state via API */
  private async _updateState(
    state: Record<string, unknown>,
    source?: string,
    replace = false
  ): Promise<void> {
    if (replace) {
      await this._client['_http'].setState(this.id, state, source)
      this.state['_state'] = { ...state }
    } else {
      await this._client['_http'].updateState(this.id, state, source)
      this.state['_state'] = { ...this.state['_state'], ...state }
    }
  }

  /** @internal Handle incoming state event */
  _handleStateEvent(event: StateChangeEvent): void {
    this.state._applyUpdate(event)
  }

  toJSON(): EntityData {
    return { ...this._data, state: this.state.data }
  }
}

/**
 * HTTP Transport
 */
class HttpTransport {
  private apiUrl: string

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '')
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }
    return response.json()
  }

  // Entity Types
  listEntityTypes(): Promise<EntityType[]> {
    return this.request('GET', '/entities/types')
  }

  // Entities
  listEntities(params: {
    entityType?: string
    parentId?: string
    status?: string
    search?: string
    limit?: number
    offset?: number
  } = {}): Promise<EntityData[]> {
    const query = new URLSearchParams()
    if (params.entityType) query.set('entity_type', params.entityType)
    if (params.parentId) query.set('parent_id', params.parentId)
    if (params.status) query.set('status', params.status)
    if (params.search) query.set('search', params.search)
    if (params.limit) query.set('limit', params.limit.toString())
    if (params.offset) query.set('offset', params.offset.toString())
    const qs = query.toString()
    return this.request('GET', `/entities${qs ? `?${qs}` : ''}`)
  }

  getEntity(id: string): Promise<EntityData> {
    return this.request('GET', `/entities/${id}`)
  }

  getEntityBySlug(slug: string): Promise<EntityData> {
    return this.request('GET', `/entities/by-slug/${slug}`)
  }

  createEntity(data: EntityCreate): Promise<EntityData> {
    return this.request('POST', '/entities', data)
  }

  updateEntity(id: string, data: EntityUpdate): Promise<EntityData> {
    return this.request('PUT', `/entities/${id}`, data)
  }

  deleteEntity(id: string, cascade = false): Promise<void> {
    return this.request('DELETE', `/entities/${id}?cascade=${cascade}`)
  }

  // Hierarchy
  getAncestors(id: string): Promise<EntityData[]> {
    return this.request('GET', `/entities/${id}/ancestors`)
  }

  getDescendants(id: string, maxDepth = 10): Promise<EntityData[]> {
    return this.request('GET', `/entities/${id}/descendants?max_depth=${maxDepth}`)
  }

  getTree(rootId?: string, entityType?: string, maxDepth = 5): Promise<EntityTreeNode[]> {
    const query = new URLSearchParams()
    if (rootId) query.set('root_id', rootId)
    if (entityType) query.set('entity_type', entityType)
    query.set('max_depth', maxDepth.toString())
    return this.request('GET', `/entities/tree?${query}`)
  }

  // State
  getState(id: string): Promise<StateResponse> {
    return this.request('GET', `/entities/${id}/state`)
  }

  updateState(id: string, state: Record<string, unknown>, source?: string): Promise<StateResponse> {
    return this.request('PATCH', `/entities/${id}/state`, { state, source })
  }

  setState(id: string, state: Record<string, unknown>, source?: string): Promise<StateResponse> {
    return this.request('PUT', `/entities/${id}/state`, { state, source })
  }

  // Streams
  getStreamState(): Promise<StreamRegistryState> {
    return this.request('GET', '/streams/state')
  }

  listStreamTypes(): Promise<StreamTypeInfo[]> {
    return this.request('GET', '/streams/types')
  }

  createStreamType(data: StreamTypeCreate): Promise<StreamTypeInfo> {
    return this.request('POST', '/streams/types', data)
  }

  listStreams(streamType?: string): Promise<StreamInfo[]> {
    const qs = streamType ? `?stream_type=${streamType}` : ''
    return this.request('GET', `/streams${qs}`)
  }

  getStream(streamId: string): Promise<StreamInfo> {
    return this.request('GET', `/streams/${streamId}`)
  }

  advertiseStream(data: StreamAdvertise): Promise<StreamInfo> {
    return this.request('POST', '/streams/advertise', data)
  }

  withdrawStream(streamId: string): Promise<void> {
    return this.request('DELETE', `/streams/${streamId}`)
  }

  streamHeartbeat(streamId: string): Promise<void> {
    return this.request('POST', `/streams/${streamId}/heartbeat`)
  }

  requestStream(streamId: string, data: StreamRequest): Promise<StreamOffer> {
    return this.request('POST', `/streams/${streamId}/request`, data)
  }

  listSessions(streamId?: string): Promise<StreamSession[]> {
    const qs = streamId ? `?stream_id=${streamId}` : ''
    return this.request('GET', `/streams/sessions${qs}`)
  }

  getSessionHistory(params: {
    streamId?: string
    publisherId?: string
    consumerId?: string
    limit?: number
  } = {}): Promise<StreamSessionHistory[]> {
    const query = new URLSearchParams()
    if (params.streamId) query.set('stream_id', params.streamId)
    if (params.publisherId) query.set('publisher_id', params.publisherId)
    if (params.consumerId) query.set('consumer_id', params.consumerId)
    if (params.limit) query.set('limit', params.limit.toString())
    const qs = query.toString()
    return this.request('GET', `/streams/sessions/history${qs ? `?${qs}` : ''}`)
  }

  stopSession(sessionId: string): Promise<void> {
    return this.request('DELETE', `/streams/sessions/${sessionId}`)
  }

  sessionHeartbeat(sessionId: string): Promise<void> {
    return this.request('POST', `/streams/sessions/${sessionId}/heartbeat`)
  }

  // Multicast streams
  joinStream(streamId: string, data: StreamJoinRequest): Promise<StreamJoinResponse> {
    return this.request('POST', `/streams/${streamId}/join`, data)
  }

  leaveStream(streamId: string, subscriberId: string): Promise<void> {
    return this.request('DELETE', `/streams/${streamId}/leave/${subscriberId}`)
  }

  subscriberHeartbeat(subscriberId: string): Promise<void> {
    return this.request('POST', `/streams/subscribers/${subscriberId}/heartbeat`)
  }

  listSubscribers(streamId?: string): Promise<StreamSubscriber[]> {
    const params = streamId ? `?stream_id=${streamId}` : ''
    return this.request('GET', `/streams/subscribers${params}`)
  }

  // Device Config
  getDeviceConfig(hardwareId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/devices/config/${encodeURIComponent(hardwareId)}`)
  }
}

/**
 * Maestra Client
 * Main entry point for the SDK
 */
export class MaestraClient {
  private config: ConnectionConfig
  private _http: HttpTransport
  private _ws: WebSocket | null = null
  private _mqtt: unknown = null
  private _connected = false
  private _subscribedEntities = new Map<string, Entity>()
  private _clientId: string

  /** Pre-provisioned device configuration (populated on connect if hardwareId is set) */
  public deviceConfig: Record<string, unknown> = {}

  /**
   * Discover a Maestra instance on the local network via mDNS and
   * return a connected client.
   *
   * Requires `bonjour-service` and a Node.js runtime.
   *
   * @param timeout - Discovery timeout in ms (default: 5000)
   */
  static async discover(timeout?: number): Promise<MaestraClient> {
    const discovered = await discoverMaestra({ timeout })
    const client = new MaestraClient({
      apiUrl: discovered.apiUrl,
      wsUrl: discovered.wsUrl,
      mqttUrl: discovered.mqttUrl,
    })
    await client.connect()
    return client
  }

  constructor(config: Partial<ConnectionConfig> = {}) {
    this.config = {
      apiUrl: config.apiUrl || 'http://localhost:8080',
      wsUrl: config.wsUrl,
      mqttUrl: config.mqttUrl,
      clientId: config.clientId,
      hardwareId: config.hardwareId,
    }
    this._http = new HttpTransport(this.config.apiUrl)
    this._clientId = this.config.clientId || `maestra-js-${Math.random().toString(36).slice(2, 10)}`
  }

  /** Connect to Maestra services */
  async connect(): Promise<void> {
    console.log(`🔌 Connecting to Maestra API: ${this.config.apiUrl}`)

    // WebSocket connection
    if (this.config.wsUrl) {
      try {
        this._ws = new WebSocket(this.config.wsUrl)
        this._ws.onmessage = (event) => this._handleWsMessage(event)
        this._ws.onopen = () => console.log('✅ WebSocket connected')
        this._ws.onerror = (e) => console.warn('⚠️ WebSocket error:', e)
      } catch (e) {
        console.warn('⚠️ WebSocket connection failed:', e)
      }
    }

    // MQTT connection (if mqtt library is available)
    if (this.config.mqttUrl && typeof window !== 'undefined') {
      try {
        // @ts-ignore - mqtt is optional
        const mqtt = await import('mqtt')
        this._mqtt = mqtt.connect(this.config.mqttUrl, { clientId: this._clientId })
        // @ts-ignore
        this._mqtt.on('message', (topic: string, message: Buffer) => {
          this._handleMqttMessage(topic, message.toString())
        })
        console.log('✅ MQTT connecting...')
      } catch (e) {
        console.warn('⚠️ MQTT not available:', e)
      }
    }

    // Fetch pre-provisioned device config if hardwareId is set
    if (this.config.hardwareId) {
      try {
        this.deviceConfig = await this._http.getDeviceConfig(this.config.hardwareId)
      } catch (e) {
        console.warn('⚠️ Could not fetch device config:', e)
        this.deviceConfig = {}
      }
    }

    this._connected = true
    console.log('✅ Maestra client ready!')
  }

  /** Fetch device configuration by hardware ID */
  async fetchDeviceConfig(hardwareId?: string): Promise<Record<string, unknown>> {
    const hwId = hardwareId || this.config.hardwareId
    if (!hwId) throw new Error('No hardwareId provided')
    this.deviceConfig = await this._http.getDeviceConfig(hwId)
    return this.deviceConfig
  }

  /** Disconnect from all services */
  async disconnect(): Promise<void> {
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
    if (this._mqtt) {
      // @ts-ignore
      this._mqtt.end()
      this._mqtt = null
    }
    this._connected = false
    console.log('👋 Disconnected from Maestra')
  }

  get isConnected(): boolean {
    return this._connected
  }

  // Entity Types
  async getEntityTypes(): Promise<EntityType[]> {
    return this._http.listEntityTypes()
  }

  // Entities
  async getEntities(params: {
    entityType?: string
    parentId?: string
    status?: string
    search?: string
    limit?: number
  } = {}): Promise<Entity[]> {
    const data = await this._http.listEntities(params)
    return data.map((d) => new Entity(this, d))
  }

  async getEntity(id: string): Promise<Entity> {
    const data = await this._http.getEntity(id)
    return new Entity(this, data)
  }

  async getEntityBySlug(slug: string): Promise<Entity> {
    const data = await this._http.getEntityBySlug(slug)
    return new Entity(this, data)
  }

  async createEntity(params: EntityCreate): Promise<Entity> {
    const data = await this._http.createEntity(params)
    return new Entity(this, data)
  }

  async deleteEntity(id: string, cascade = false): Promise<void> {
    await this._http.deleteEntity(id, cascade)
  }

  // Hierarchy
  async getAncestors(id: string): Promise<Entity[]> {
    const data = await this._http.getAncestors(id)
    return data.map((d) => new Entity(this, d))
  }

  async getDescendants(id: string, maxDepth = 10): Promise<Entity[]> {
    const data = await this._http.getDescendants(id, maxDepth)
    return data.map((d) => new Entity(this, d))
  }

  async getTree(rootId?: string, entityType?: string, maxDepth = 5): Promise<EntityTreeNode[]> {
    return this._http.getTree(rootId, entityType, maxDepth)
  }

  // ===== Streams =====

  /** Get complete stream registry state */
  async getStreamState(): Promise<StreamRegistryState> {
    return this._http.getStreamState()
  }

  /** List stream type definitions */
  async getStreamTypes(): Promise<StreamTypeInfo[]> {
    return this._http.listStreamTypes()
  }

  /** Create a custom stream type */
  async createStreamType(data: StreamTypeCreate): Promise<StreamTypeInfo> {
    return this._http.createStreamType(data)
  }

  /** List active streams, optionally filtered by type */
  async getStreams(streamType?: string): Promise<StreamInfo[]> {
    return this._http.listStreams(streamType)
  }

  /** Get a single stream by ID */
  async getStream(streamId: string): Promise<StreamInfo> {
    return this._http.getStream(streamId)
  }

  /** Advertise a new stream to the registry */
  async advertiseStream(data: StreamAdvertise): Promise<StreamInfo> {
    return this._http.advertiseStream(data)
  }

  /** Withdraw a stream from the registry */
  async withdrawStream(streamId: string): Promise<void> {
    return this._http.withdrawStream(streamId)
  }

  /** Refresh a stream's TTL */
  async streamHeartbeat(streamId: string): Promise<void> {
    return this._http.streamHeartbeat(streamId)
  }

  /** Request to consume a stream. Returns connection offer from the publisher. */
  async requestStream(streamId: string, data: StreamRequest): Promise<StreamOffer> {
    return this._http.requestStream(streamId, data)
  }

  /** List active sessions */
  async getSessions(streamId?: string): Promise<StreamSession[]> {
    return this._http.listSessions(streamId)
  }

  /** Query historical sessions */
  async getSessionHistory(params?: {
    streamId?: string
    publisherId?: string
    consumerId?: string
    limit?: number
  }): Promise<StreamSessionHistory[]> {
    return this._http.getSessionHistory(params)
  }

  /** Stop an active session */
  async stopSession(sessionId: string): Promise<void> {
    return this._http.stopSession(sessionId)
  }

  /** Refresh a session's TTL */
  async sessionHeartbeat(sessionId: string): Promise<void> {
    return this._http.sessionHeartbeat(sessionId)
  }

  /** Join a multicast stream. Returns multicast group info for IGMP join. */
  async joinStream(streamId: string, data: StreamJoinRequest): Promise<StreamJoinResponse> {
    return this._http.joinStream(streamId, data)
  }

  /** Leave a multicast stream */
  async leaveStream(streamId: string, subscriberId: string): Promise<void> {
    return this._http.leaveStream(streamId, subscriberId)
  }

  /** Refresh a subscriber's TTL */
  async subscriberHeartbeat(subscriberId: string): Promise<void> {
    return this._http.subscriberHeartbeat(subscriberId)
  }

  /** List active multicast subscribers */
  async getSubscribers(streamId?: string): Promise<StreamSubscriber[]> {
    return this._http.listSubscribers(streamId)
  }

  // Subscriptions
  private async _subscribeEntity(entity: Entity): Promise<void> {
    this._subscribedEntities.set(entity.slug, entity)

    // Subscribe via WebSocket
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: 'subscribe',
        subject: `maestra.entity.state.*.${entity.slug}`,
      }))
    }

    // Subscribe via MQTT
    if (this._mqtt) {
      // @ts-ignore
      this._mqtt.subscribe(`maestra/entity/state/+/${entity.slug}`)
    }
  }

  private async _unsubscribeEntity(entity: Entity): Promise<void> {
    this._subscribedEntities.delete(entity.slug)
  }

  private _handleWsMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data)
      this._handleStateEvent(data)
    } catch (e) {
      console.warn('Error parsing WebSocket message:', e)
    }
  }

  private _handleMqttMessage(topic: string, message: string): void {
    try {
      const data = JSON.parse(message)
      this._handleStateEvent(data)
    } catch (e) {
      console.warn('Error parsing MQTT message:', e)
    }
  }

  private _handleStateEvent(data: StateChangeEvent): void {
    if (data.type !== 'state_changed') return

    const entity = this._subscribedEntities.get(data.entity_slug)
    if (entity) {
      entity._handleStateEvent(data)
    }
  }
}

/** Quick connect helper */
export async function connect(config: Partial<ConnectionConfig> = {}): Promise<MaestraClient> {
  const client = new MaestraClient(config)
  await client.connect()
  return client
}
