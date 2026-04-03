# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maestra is an immersive experience infrastructure platform for creatives. It's a Docker-based system that connects devices (TouchDesigner, Max/MSP, Unreal, Arduino, Raspberry Pi, web/mobile) to a central message bus, enabling real-time event publishing/subscribing and device orchestration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT LAYER: TouchDesigner│Max/MSP│Unreal│Arduino│Web    │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  GATEWAY LAYER: OSC│WebSocket│MQTT│DMX/Art-Net (opt-in)    │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  MESSAGE BUS: NATS (Pub/Sub) │ Redis (Cache/State)          │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVICES: Fleet Manager│Node-RED│Dashboard│Grafana         │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PERSISTENCE: PostgreSQL (TimescaleDB)                      │
└─────────────────────────────────────────────────────────────┘
```

### Core Services

| Service | Port | Purpose |
|---------|------|---------|
| Fleet Manager | 8080 | FastAPI REST API for device registration, metrics, events |
| Dashboard | 3001 | Next.js web interface |
| Node-RED | 1880 | Visual flow-based programming and orchestration |
| Grafana | 3000 | Monitoring dashboards (admin/admin) |
| NATS | 4222, 8222 | Primary message bus with JetStream |
| Mosquitto | 1883, 9001 | MQTT broker for IoT devices |
| Redis | 6379 | Caching and real-time state |
| PostgreSQL | 5432 | TimescaleDB for time-series data |
| OSC Gateway | 57120/UDP | Bridges OSC to NATS |
| WebSocket Gateway | 8765 | Bridges browser clients to NATS |
| MQTT-NATS Bridge | internal | Bidirectional MQTT↔NATS routing |
| DMX Gateway | 6454/UDP (out) | Art-Net bridge to physical DMX fixtures (opt-in, `dmx` profile) |

### Gateway Layer Details

| Gateway | Ports | Purpose | Protocol | Documentation |
|---------|-------|---------|----------|---------------|
| OSC Gateway | 57120 (in), 57121 (out) | Creative tools (TouchDesigner, Max/MSP, SuperCollider) | OSC over UDP | [OSC API](docs/docs/api/osc.md) |
| WebSocket Gateway | 8765 | Browser clients, web apps | WebSocket + JSON | [WebSocket API](docs/docs/api/websocket.md) |
| MQTT Broker | 1883 (TCP), 9001 (WS) | IoT devices, embedded systems | MQTT 3.1.1 | [MQTT Guide](docs/docs/guides/mqtt.md) |
| MQTT-NATS Bridge | internal | Bidirectional message routing | MQTT ↔ NATS | Built into stack |
| DMX Gateway *(opt-in)* | 6454/UDP (out) | Physical DMX fixtures via Art-Net | Art-Net ArtDMX | [DMX Guide](docs/docs/guides/dmx-gateway.md) |

**Message transformations:**
- OSC `"/device/temp"` → NATS `"maestra.osc.device.temp"`
- OSC `"/entity/update/<slug>/<key>"` → NATS `"maestra.entity.state.update.<slug>"` (entity state)
- OSC `"/entity/set/<slug>/<key>"` → NATS `"maestra.entity.state.set.<slug>"` (entity state)
- NATS `"maestra.entity.state.>"` → OSC `/entity/state/<type>/<slug>/<key>` (to OSC_TARGETS)
- MQTT `"maestra/device/temp"` → NATS `"maestra.mqtt.maestra.device.temp"`
- WebSocket publishes directly to NATS subjects
- NATS `"maestra.to_osc.*"` → OSC output
- NATS `"maestra.to_mqtt.*"` → MQTT output
- NATS `"maestra.entity.state.>"` → DMX channel values via Art-Net UDP (DMX gateway)
- OSC `"/show/<action>"` → NATS `"maestra.osc.show.<action>"` → Show control state machine
- MQTT `"maestra/show/command/<action>"` → NATS `"maestra.show.command.<action>"` → Show control state machine
- Show state broadcasts: NATS `"maestra.entity.state.show_control.show"` → all protocols
- NATS `"maestra.to_artnet.universe.*"` → raw 512-channel universe bypass (DMX gateway)

### Message Flow Patterns

**Topic naming:**
- NATS: `maestra.<protocol>.<resource>.<action>` (e.g., `maestra.mqtt.devices.esp32.temperature`)
- MQTT: `maestra/<resource>/<action>` (e.g., `maestra/devices/esp32/temperature`)

**Entity state updates (device → Maestra):**
- MQTT: `maestra/entity/state/update/<slug>` (merge) or `maestra/entity/state/set/<slug>` (replace)
- NATS: `maestra.entity.state.update.<slug>` (merge) or `maestra.entity.state.set.<slug>` (replace)
- OSC: `/entity/update/<slug>/<key> <value>` (merge) or `/entity/set/<slug>/<key> <value>` (replace)
- HTTP: `PATCH /entities/{id}/state` (merge) or `PUT /entities/{id}/state` (replace)
- Payload: `{"state": {...}, "source": "optional-source-id"}`

**Entity state broadcasts (Maestra → devices):**
- MQTT: `maestra/entity/state/<type>/<slug>`
- NATS: `maestra.entity.state.<type>.<slug>`
- WebSocket: All NATS broadcasts relayed automatically

**Bridge routing:**
- MQTT → NATS: `maestra/x/y` becomes `maestra.mqtt.maestra.x.y`
- NATS → MQTT: `maestra.to_mqtt.x.y` becomes `x/y`
- NATS → OSC: Subscribe to `maestra.to_osc.*`
- NATS entity state → DMX: `maestra.entity.state.>` resolved via database fixtures (Fleet Manager API) → Art-Net UDP

## Common Commands

```bash
# Lifecycle
make up              # Start all services
make down            # Stop all services
make restart         # Restart all services
make clean           # Stop and remove containers (keeps volumes)
make clean-all       # Remove everything including data (DESTRUCTIVE)

# Development
make dev-core        # Start core services only (bus, db, fleet-manager, nodered)
make dev-bus         # Start only message bus (NATS, Mosquitto, Redis)
make dev-db          # Start only database
make build           # Rebuild all custom services
make init            # Initialize .env from .env.example

# Monitoring
make logs            # View all logs
make logs-service SERVICE=fleet-manager  # Logs for specific service
make ps              # Show service status
make health          # Check all service health
make watch           # Monitor status in real-time

# Database
make shell-postgres  # Open psql shell
make shell-redis     # Open Redis CLI
make migrate         # Run pending database migrations
make migrate-status  # Show which migrations have been applied
make migrate-dry-run # Preview pending migrations without executing
make backup-db       # Backup to backups/
make restore-db FILE=backups/backup.sql

# Testing
make test-mqtt       # Publish test MQTT message
make test-mqtt-state SLUG=my-entity  # Test MQTT entity state update
```

## Service Development Patterns

### Python Services (Fleet Manager, Gateways, Bridge)

All Python services follow:
- **Async-first**: `async def`, `await`, `asyncio`
- **Environment config**: `os.getenv()` for all configuration
- **Global clients**: NATS, MQTT, Redis connections at module level
- **Graceful shutdown**: `try/finally` blocks for cleanup

```python
async def main():
    global nc
    nc = await nats.connect(NATS_URL)
    await nc.subscribe("subject.>", cb=message_handler)
    try:
        await asyncio.Event().wait()
    finally:
        await nc.close()
```

### Fleet Manager API (FastAPI)

Located at `services/fleet-manager/main.py`:
- Pydantic models for request/response validation
- Async SQLAlchemy with AsyncPG driver
- Key endpoints: `/devices/register`, `/devices/heartbeat`, `/metrics`, `/events`
- **Entity Variables**: Define typed input/output fields with validation
  - 6 endpoints: GET/PUT/POST/DELETE `/entities/{id}/variables/*`
  - Types: string, number, boolean, array, color, vector2, vector3, range, enum, object
  - Features: Direction (input/output), default values, type-specific config, state validation
- **Streams**: Dynamic stream discovery and direct device-to-device streaming
  - 13 endpoints under `/streams/*` for advertisement, discovery, negotiation, sessions
  - Stream types: ndi, audio, video, texture, sensor, osc, midi, data, srt, spout, syphon
  - Control plane only — data plane flows P2P between devices
  - Redis ephemeral state (30s TTL), NATS request-reply negotiation, Postgres session history
- **Show Control**: System-wide show lifecycle management
  - State machine: idle → pre_show → active → paused → post_show → shutdown
  - 9 endpoints: GET/POST `/show/*` for state, transitions, shortcuts
  - Schedule CRUD: `/show/schedules/*` (cron-based, timezone-aware)
  - Configurable side effects: `/show/side-effects/*` (entity updates, NATS publishes, internal calls)
  - Optional API key auth via `SHOW_CONTROL_TOKEN` env var
  - Inbound commands via NATS: `maestra.show.command.*` and `maestra.osc.show.*`
  - Background scheduler evaluates cron entries every 60 seconds
- **DMX Lighting**: Full Art-Net / DMX512 fixture control (see DMX Lighting System section below)
  - Router: `services/fleet-manager/dmx_router.py`
  - Playback engine: `services/fleet-manager/dmx_playback_engine.py`
  - NATS state handler and entity sync in `services/fleet-manager/main.py`
- API docs at http://localhost:8080/docs

### Dashboard (Next.js)

Located at `services/dashboard/`:
- Next.js 14 with React 18
- TailwindCSS, Recharts, Socket.IO, MQTT
- Environment vars in `NEXT_PUBLIC_*` prefix

**Responsive design system** (`services/dashboard/src/app/globals.css` + `tailwind.config.js`):
- CSS custom properties define single-source-of-truth design tokens:
  - `--sidebar-nav-width: 14rem` — left navigation sidebar width
  - `--sidebar-dmx-width: 295px` — DMX Lighting right sidebar width
  - `--z-nav-backdrop: 40`, `--z-overlay: 50` — z-index layers
  - `--breakpoint-mobile: 768px` — documents the `md` Tailwind breakpoint
- Tailwind `theme.extend.width` adds `w-sidebar-nav` and `w-sidebar-dmx` utilities backed by the CSS vars
- `@layer components` defines shared classes:
  - `.modal-backdrop` — `fixed inset-0 z-50` centered flex with `p-4` safe padding and `bg-black/60 backdrop-blur-sm`; pair with `.modal-panel max-w-sm` or `.modal-panel max-w-lg`
  - `.modal-panel` — base modal frame (`w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl`); caller adds size and layout modifiers
  - `.nav-overlay-backdrop` — mobile-only (`md:hidden`) nav backdrop at `z-40`

**Mobile layout** (breakpoint `md` = 768px):
- `AppShell`: mobile top bar (`md:hidden`) with hamburger button (opens slide-in nav), Maestra wordmark, and system health status dots on the right
- `Sidebar`: fixed overlay on mobile (`translate-x` open/close, 300ms ease), static in flexbox on desktop; uses `w-sidebar-nav`
- Nav links call `onClose()` to dismiss the drawer on mobile
- System health dots in the top bar come from `useSystemHealth(30000)` + `useWebSocket()` called in AppShell
- Dashboard page has a mobile toggle button (`md:hidden`) to switch between the dashboard summary view and the Live Activity feed full-screen view
- DMX Lighting page: canvas is `hidden md:block` on mobile; DMX sidebar becomes full-width (`w-full md:w-sidebar-dmx`); toolbar labels condensed to icon-only on small screens; scale picker hidden; per-fixture Adjust button always visible (not hover-only)

### Message Envelope Convention

All inter-service messages include:
```json
{
  "timestamp": "ISO-8601",
  "source": "mqtt|osc|websocket",
  "topic": "original/topic",
  "data": {...}
}
```

## Database Migrations

PostgreSQL init scripts (`config/postgres/init/01-05*.sql`) only run on first database creation. For schema changes on existing databases, use the migration system:

```bash
make migrate         # Apply pending migrations
make migrate-status  # See what's been applied
make migrate-dry-run # Preview without executing
```

**How it works:**
- Migration files live in `config/postgres/migrations/` with numbered prefixes (`001_`, `002_`, etc.)
- A `schema_migrations` table tracks which migrations have been applied
- Each migration runs exactly once; re-running `make migrate` is always safe
- Migrations must be idempotent (use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.)

**Adding a new migration:**
1. Create `config/postgres/migrations/NNN_description.sql` (next number in sequence)
2. Write idempotent SQL (safe to run on databases that may already have the changes)
3. If this is for a brand-new table, also add it to the appropriate init script in `config/postgres/init/` so fresh installs get it automatically
4. Run `make migrate` to apply

**Fresh install vs existing database:**
- Fresh install (`make clean-all && make up`): init scripts run automatically, then `make migrate` is a no-op
- Existing database (`make up`): init scripts are skipped, `make migrate` applies any new changes

## Database Schema (TimescaleDB)

Maestra uses PostgreSQL with TimescaleDB extension for time-series data and LTREE extension for hierarchical entities.

### Core Tables

**Device Management** (`config/postgres/init/01-init-db.sql`):
- **devices** - Device registry with status, location, metadata (JSONB)
- **device_groups** - Logical grouping of devices
- **device_group_members** - Many-to-many device↔group relationship
- **device_configurations** - Versioned device configs (JSONB)
- **experiences** - Node-RED flow definitions

**Entity System** (`config/postgres/init/02-entities.sql`):
- **entity_types** - Entity type definitions with variable schemas
- **entities** - Core entity table with hierarchical path (LTREE)
- **entity_variables** - Typed input/output field definitions
- **entity_states** - State change history (hypertable)
- **entity_subscriptions** - State change subscriptions

### TimescaleDB Hypertables

Time-series tables with automatic partitioning and compression:

1. **device_metrics** (time-series telemetry)
   - Automatic 90-day retention policy
   - Compressed after 7 days
   - Indexed on (device_id, time) and (metric_name, time)
   - Stores metric_name, metric_value, unit, tags (JSONB)

2. **device_events** (discrete events)
   - Automatic 30-day retention policy
   - Compressed after 7 days
   - Indexed on (device_id, time) and (severity, time)
   - Stores event_type, severity, message, data (JSONB)

3. **entity_states** (entity state changes)
   - State history with automatic partitioning
   - Full state snapshots with source tracking
   - Supports JSONB queries for nested state fields

### Continuous Aggregates

Pre-computed rollups for faster historical queries:

1. **device_metrics_hourly**
   - 1-hour time buckets
   - AVG, MAX, MIN, COUNT aggregations
   - Auto-refreshes every 1 hour
   - 1-year retention

2. **device_metrics_daily**
   - 1-day time buckets
   - AVG, MAX, MIN, COUNT aggregations
   - Auto-refreshes every 1 day
   - 5-year retention

**Usage**: Query aggregates instead of raw data for historical analysis:
```sql
-- Use hourly aggregate for 7-day queries (much faster)
SELECT * FROM device_metrics_hourly
WHERE bucket > NOW() - INTERVAL '7 days';
```

### Hierarchical Entities (LTREE)

Entities use PostgreSQL LTREE extension for efficient hierarchy queries:

**Path Structure**: `building.floor1.room5.light1`

**Key Features**:
- **GiST indexes** for fast tree queries
- **Ancestor queries**: `SELECT * FROM entities WHERE path @> 'building.floor1'`
- **Descendant queries**: `SELECT * FROM entities WHERE path <@ 'building.floor1.>'`
- **Depth queries**: `SELECT * FROM entities WHERE nlevel(path) = 3`
- **Sibling queries**: Find entities with same parent

**Helper Functions**:
- `get_entity_ancestors(entity_uuid)` - Get all ancestors from root to parent
- `get_entity_descendants(entity_uuid, max_depth)` - Get all descendants up to depth

**Example Queries**:
```sql
-- Find all lights in building
SELECT * FROM entities
WHERE path <@ 'building.>'
AND entity_type_id = (SELECT id FROM entity_types WHERE name = 'light');

-- Get immediate children
SELECT * FROM entities
WHERE parent_id = 'your-uuid';

-- Find by path pattern
SELECT * FROM entities
WHERE path ~ '*.floor1.*.light*';
```

### JSONB Field Usage

Many tables use JSONB for flexible schema:

**Querying JSONB**:
```sql
-- Extract field
SELECT state->>'brightness' FROM entity_states;

-- Nested field
SELECT state->'position'->>'x' FROM entity_states;

-- Cast to numeric
SELECT (state->>'temperature')::float FROM entity_states;

-- Check field exists
SELECT * FROM entities WHERE metadata ? 'serial_number';

-- Array contains
SELECT * FROM entities WHERE metadata @> '{"tags": ["production"]}';
```

**JSONB Indexes**:
- GIN indexes on JSONB columns for fast existence/containment queries
- Automatically created on state, metadata, tags columns

### Data Retention Policies

- **device_metrics**: 90 days (raw), 1 year (hourly), 5 years (daily)
- **device_events**: 30 days (raw)
- **entity_states**: No automatic retention (managed by application)

**Manual cleanup**:
```sql
-- Delete old entity states
DELETE FROM entity_states WHERE time < NOW() - INTERVAL '1 year';
```

## Port Reference

```
80/443  - Traefik (HTTP/HTTPS)
1880    - Node-RED
1883    - MQTT
3000    - Grafana
3001    - Dashboard
4222    - NATS Client
5432    - PostgreSQL
6379    - Redis
8000    - MkDocs
8080    - Fleet Manager API
8222    - NATS HTTP Monitor
8765    - WebSocket Gateway
9000/9443 - Portainer
9001    - MQTT WebSocket
57120/57121 - OSC (UDP in/out)
6454        - Art-Net / DMX gateway (UDP out to node, opt-in)
```

## Monitoring & Observability

### Grafana Dashboards

Access at http://localhost:3000 (default: admin/admin)

Maestra includes **8 pre-configured dashboards**:

1. **System Health** - Infrastructure monitoring (CPU, memory, containers, database)
2. **Device Overview** - Fleet status, registration rates, heartbeats
3. **Entity State** - Real-time entity state changes and history
4. **Events & Debug** - Event logs, error rates, debugging
5. **Message Bus Metrics** - NATS/MQTT throughput, subscriptions, latency
6. **Performance Metrics** - API response times, database queries, cache performance
7. **SDK Connections** - WebSocket, OSC, MQTT gateway monitoring
8. **Experiences & Flows** - Node-RED flow execution and performance

**Key Features**:
- TimescaleDB hypertables with automatic compression
- Continuous aggregates (hourly, daily) for historical data
- JSONB field extraction for flexible querying
- Alerting support (email, Slack)
- Custom dashboard creation

See [Monitoring Guide](docs/docs/guides/monitoring.md) for complete documentation.

## Stream System

Maestra Streams enable devices to advertise high-bandwidth data streams and other devices to discover and connect to them. The **control plane** (discovery, negotiation, session management) runs through Maestra, while the **data plane** (actual bytes) flows directly peer-to-peer between devices.

### Stream Lifecycle

```
1. ADVERTISE    Publisher registers stream with Maestra (POST /streams/advertise)
2. DISCOVER     Consumers browse available streams (GET /streams)
3. REQUEST      Consumer requests access (POST /streams/{id}/request)
4. NEGOTIATE    NATS request-reply handshake with publisher (5s timeout)
5. SESSION      Active streaming session (data flows P2P)
6. HEARTBEAT    Both sides refresh TTLs every ~10 seconds
7. WITHDRAW     Publisher removes stream (DELETE /streams/{id})
```

### NATS Subjects

| Subject | Purpose |
|---------|---------|
| `maestra.stream.advertise` | Broadcast when a stream is advertised |
| `maestra.stream.advertise.{type}` | Type-specific advertisement |
| `maestra.stream.withdraw.{id}` | Stream withdrawn |
| `maestra.stream.request.{id}` | Request-reply: consumer → publisher |
| `maestra.stream.heartbeat.>` | Stream heartbeat |
| `maestra.stream.session.started` | Session created |
| `maestra.stream.session.stopped` | Session ended |
| `maestra.stream.session.heartbeat.>` | Session heartbeat |

### Redis Key Patterns

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `stream:{id}` | Hash | 30s | Active stream advertisement |
| `stream:session:{id}` | Hash | 30s | Active streaming session |
| `streams:index` | Set | — | Set of all active stream IDs |
| `streams:type:{type}` | Set | — | Stream IDs by type |
| `stream:sessions:{stream_id}` | Set | — | Session IDs for a stream |

### Key Implementation Files

| File | Purpose |
|------|---------|
| `services/fleet-manager/stream_router.py` | 13 API endpoints (FastAPI router) |
| `services/fleet-manager/stream_manager.py` | StreamManager singleton (Redis + NATS) |
| `services/fleet-manager/redis_client.py` | Redis connection and helpers |
| `config/postgres/init/04-streams.sql` | Session history hypertable |
| `sdks/python/maestra/stream.py` | StreamPublisher/StreamConsumer helpers |

### SDK Stream Support

All 8 SDKs support streams:
- **Python**: Full async support with `StreamPublisher`/`StreamConsumer` automatic heartbeat helpers
- **JavaScript/TypeScript**: Promise-based API matching all 13 endpoints
- **Unity**: Coroutine/callback pattern with `UnityWebRequest`
- **Unreal Engine**: Async HTTP with `FHttpModule`, Blueprint-exposed events and delegates
- **TouchDesigner**: Synchronous `urllib.request` methods (manual heartbeat via Timer CHOP)
- **Arduino**: MQTT-only stream events (advertise, subscribe, heartbeat via pub/sub topics)
- **Processing**: MQTT-based with `processing-mqtt` (Eclipse Paho), thread-safe queue for main-thread dispatch
- **OpenFrameworks**: MQTT-based `ofxMaestra` addon with `ofxMQTT` (libmosquitto), main-thread callbacks via `ofEvent`

## DMX Lighting System

The DMX Lighting feature provides Art-Net/DMX512 fixture control with a full cue/sequence programming interface. It is configured entirely through the Dashboard UI or the Fleet Manager REST API — no YAML files.

### Database Tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `dmx_nodes` | init | Art-Net hardware nodes (IP, universes) |
| `dmx_fixtures` | init | Fixture patch (node, universe, start channel, channel map, entity link) |
| `dmx_groups` | 018 | Independent playback layers; fixtures, cues, and sequences belong to a group |
| `dmx_cues` | init | Named snapshots of fixture states; optional `group_id` |
| `dmx_sequences` | init | Ordered cue chains with transition/hold timing; optional `group_id` |
| `dmx_cue_placements` | init | Many-to-many cue↔sequence with `transition_time` and `hold_duration` |
| `dmx_fixture_snapshots` | init | Fixture state data stored per cue |

### Playback Engine Architecture

`DMXGroupEngine` (`dmx_playback_engine.py`) — one instance per group (and one ungrouped):
- Ticks every 80ms; interpolates DMX values between cues during transitions
- States: `stopped → playing → paused`; phases: `idle → transitioning → holding`
- Supports `loop` (repeat sequence indefinitely) and `fadeout_ms` (fade dimmers to zero on completion)
- `play(sequence_id, loop=False, fadeout_ms=None)` — starts playback; stores parameters
- `_fadeout_ms_on_complete` — fires `_run_fade_out()` as a background task on non-looping completion

`DMXEngineRegistry` — singleton dict in `dmx_router.py`:
- Key `None` → ungrouped (legacy) engine
- Key `"<group-uuid>"` → per-group engine
- Groups run fully independently; playing a sequence on group A never affects group B
- `GET /dmx/playback/status?group_id=all` returns all active engines in one request

### Entity State Integration

The `dmx-lighting` singleton entity (slug `dmx-lighting`, type `dmx_controller`) reflects the full catalog and enables external control from any Maestra client:

```json
{
  "groups":   [{ "id": "uuid", "name": "Stage Left", "color": "#ef4444" }],
  "cues":     [{ "id": "uuid", "name": "Warm Stage", "fade_duration": 2.5, "group_id": "uuid|null" }],
  "sequences":[{ "id": "uuid", "name": "Opening", "cue_count": 4, "fade_out_duration": 3.0, "group_id": "uuid|null" }],
  "active_cue_id": null,
  "active_sequence_id": null,
  "group_playback": {
    "<group-uuid>": { "active_sequence_id": null, "active_cue_id": null }
  }
}
```

`_sync_dmx_lighting_entity()` in `dmx_router.py` — called after every CRUD operation; rebuilds the full entity state from the database and hydrates `group_playback` from the live engine registry.

`_on_dmx_lighting_state()` in `main.py` — NATS handler for `maestra.entity.state.update.dmx-lighting`; routes state changes to the correct engine(s).

### Sequence Control Parameters

`active_sequence_id` (and the equivalent field inside each `group_playback` entry) accepts a plain string UUID **or** a control object:

| Form | Behavior |
|------|----------|
| `"<uuid>"` | Play once; last DMX values hold when the final cue completes |
| `{"id": "<uuid>", "loop": true}` | Repeat indefinitely |
| `{"id": "<uuid>", "fadeout": 3.0}` | Fade dimmers to zero over N seconds on completion, then stop |

`_parse_seq_control(value)` in `main.py` — handles `None`, string, and dict inputs uniformly; returns `(seq_id, loop, fadeout_ms)`.

`POST /dmx/playback/play` accepts the same options via `loop` (bool) and `fadeout_ms` (float) fields.

### Key Implementation Files

| File | Purpose |
|------|---------|
| `services/fleet-manager/dmx_router.py` | All DMX REST endpoints + `DMXEngineRegistry` + `_sync_dmx_lighting_entity()` |
| `services/fleet-manager/dmx_playback_engine.py` | `DMXGroupEngine` — tick loop, transitions, fade-out |
| `services/fleet-manager/main.py` | `_on_dmx_lighting_state()` NATS handler, `_parse_seq_control()` |
| `services/dmx-gateway/main.py` | Art-Net UDP sender; reads fixture config from Fleet Manager API |
| `config/postgres/migrations/018_dmx_groups.sql` | Groups table + `group_id` FK columns on fixtures, cues, sequences |
| `config/postgres/migrations/019_dmx_lighting_groups_state.sql` | Updates `dmx_controller` entity type schema with groups/group_playback |
| `config/postgres/migrations/020_dmx_lighting_seq_control_schema.sql` | Documents `oneOf` string/object schema for `active_sequence_id` |
| `services/dashboard/src/app/dmx/page.tsx` | DMX Lighting page — canvas, toolbar, all modal handlers |
| `services/dashboard/src/components/dmx/DMXSidebar.tsx` | Right sidebar — 5 tabs: Nodes, Fixtures, Groups, Cues, Sequences |
| `services/dashboard/src/components/dmx/DMXCanvas.tsx` | Drag-and-drop fixture layout canvas |
| `services/dashboard/src/hooks/useSequencePlayback.ts` | Multi-group playback state; polls `?group_id=all`; exports `Map<groupId, status>` |

### Dashboard DMX UI Patterns

- **5-tab sidebar** (`DMXSidebar.tsx`): Nodes, Fixtures, Groups, Cues, Sequences — accordion-style with `gridTemplateRows` animation; active section remembered in `sessionStorage`
- **Group context pills**: Cues and Sequences tabs each show a group filter pill bar; `cueGroupId` drives canvas highlight independently of `selectedGroupId` (Groups tab)
- **Canvas group mode**: three visual states — in-group (bright ring), eligible (dashed), ineligible (dimmed); shift-click toggles fixture membership
- **Green pulse indicators**: active sequence engines shown on group rows, context pills, Sequences tab header
- **`useSequencePlayback` hook**: tracks `Map<string|null, SequencePlaybackStatus>` keyed by `group_id`; `activeGroupIds` useMemo set drives all visual indicators; polls every 150ms while any engine is active
- **`onAdjustFixture` prop**: mobile-specific path to open the DMX channel modal for a specific fixture without requiring canvas selection

## Configuration

- **Environment**: Copy `.env.example` to `.env` (or `make init`)
- **Docker network**: `maestra-network` (172.28.0.0/16)
- **Service configs**: `config/<service>/`
- **Node-RED flows**: `flows/`

## Environment Variables Reference

### Required Variables
- `POSTGRES_PASSWORD` - Database password for PostgreSQL
- `DATABASE_URL` - Full PostgreSQL connection string
- `GRAFANA_PASSWORD` - Grafana admin password

### Message Bus
- `NATS_URL` - NATS server connection (default: nats://nats:4222)
- `MQTT_BROKER` - MQTT broker address (default: mosquitto:1883)

### Gateway Configuration
- `OSC_IN_PORT` - OSC receive port (default: 57120)
- `OSC_OUT_PORT` - OSC send port (default: 57121)

### Development
- `NODE_ENV` - Environment mode (development/production)

## Documentation Structure

Complete documentation is available at http://localhost:8000 (MkDocs).

**Key Documentation**:
- [API Reference](docs/docs/api/) - Fleet Manager, Entities, Streams, WebSocket, OSC Gateway APIs
- [User Guides](docs/docs/guides/) - Device registration, MQTT, Streams, Node-RED, monitoring
- [SDK Documentation](docs/docs/sdks/) - Web, Python, Arduino, TouchDesigner integrations
- [Architecture](docs/docs/architecture/) - System design and service architecture

**Project Documentation**:
- `CLAUDE.md` - AI assistant guidance (this file)
- `DOCKER.md` - Docker infrastructure and production deployment
- `QUICKSTART.md` - Quick start guide
- `README.md` - Project overview

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
