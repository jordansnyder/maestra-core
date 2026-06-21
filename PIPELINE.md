# PIPELINE.md — Maestra Core

> Auto-generated reference for AI orchestrator + coding agents.

---

## 1. Test Command

**Dashboard (TypeScript/React) — Vitest:**
```bash
cd services/dashboard && npm test
# or for watch mode:
cd services/dashboard && npm run test:watch
```
Tests live in `services/dashboard/test/`. Currently one test file: `console-provider.test.ts`.

**Python services (Fleet Manager) — pytest unit tests, no Docker required:**
```bash
cd services/fleet-manager
python3 -m venv /tmp/fm-venv && /tmp/fm-venv/bin/pip install -q -r requirements.txt pytest
/tmp/fm-venv/bin/python -m pytest tests/ -v
```
Tests live in `services/fleet-manager/tests/`. `conftest.py` mocks all external deps
(NATS, Redis, MQTT, asyncpg) so no live connections are needed.
Coverage: slug generation, state machine helpers, type checking, deep merge, variable validation.

**Integration smoke tests** (require full Docker stack via `make up`):
```bash
make test-mqtt                        # publish to MQTT broker
make test-mqtt-state SLUG=my-entity   # test entity state update via MQTT
make test-osc                         # send OSC message to gateway
make test-osc-state SLUG=my-entity    # test entity state via OSC
make test-dmx                         # publish entity state to NATS → DMX
```

---

## 2. File Map

| Path | Role |
|------|------|
| `services/fleet-manager/main.py` | FastAPI app entrypoint; registers all routers, startup/shutdown lifecycle |
| `services/fleet-manager/models.py` | Pydantic v2 request/response models (Base/Create/Update/Response pattern) |
| `services/fleet-manager/database.py` | SQLAlchemy async engine + all ORM table definitions (EntityDB, DeviceDB, etc.) |
| `services/fleet-manager/entity_router.py` | Entity CRUD, state update/set, variable definitions, hierarchy |
| `services/fleet-manager/stream_router.py` | Stream advertisement, discovery, session management |
| `services/fleet-manager/dmx_router.py` | DMX node/fixture CRUD API |
| `services/fleet-manager/fixtures_router.py` | OFL fixture library search API |
| `services/fleet-manager/routing_router.py` | Signal routing device/route/preset CRUD |
| `services/fleet-manager/cloud_router.py` | Cloud sync endpoints |
| `services/fleet-manager/discovery_router.py` | Device discovery/approval/blocking |
| `services/fleet-manager/analytics_router.py` | Historical state queries, annotations, verbosity config |
| `services/fleet-manager/state_manager.py` | NATS pub/sub for entity state events (Redis cache + broadcast) |
| `services/fleet-manager/stream_manager.py` | Stream session lifecycle, TTL, Redis ephemeral state |
| `services/fleet-manager/dmx_playback_engine.py` | DMX cue/sequence playback with fade engine |
| `services/fleet-manager/redis_client.py` | Redis connection singleton |
| `services/fleet-manager/cloud_manager.py` | Cloud sync logic |
| `services/fleet-manager/demo_simulator.py` | Synthetic demo data generator (toggled via `DEMO_MODE`) |
| `services/fleet-manager/requirements.txt` | Python deps for fleet-manager |
| `services/osc-gateway/gateway.py` | OSC ↔ NATS bridge (UDP in/out, entity state routing) |
| `services/websocket-gateway/gateway.py` | WebSocket ↔ NATS bridge (JSON, browser clients) |
| `services/mqtt-nats-bridge/bridge.py` | Bidirectional MQTT ↔ NATS bridge |
| `services/dmx-gateway/main.py` | NATS → Art-Net DMX gateway entrypoint |
| `services/dmx-gateway/universe_buffer.py` | 512-channel DMX universe buffer |
| `services/dmx-gateway/channel_mapper.py` | Maps entity state keys → DMX channels via fixture config |
| `services/dmx-gateway/artnet_sender.py` | Art-Net UDP packet sender |
| `services/dmx-gateway/api_loader.py` | Fetches fixture config from Fleet Manager API |
| `services/discovery-service/discovery.py` | mDNS/SSDP device discovery broadcaster |
| `services/dashboard/src/app/` | Next.js 14 App Router pages (page.tsx per route) |
| `services/dashboard/src/components/` | React components organized by domain (dmx/, console/, routing/, streams/, settings/, variable-controls/) |
| `services/dashboard/src/hooks/` | Custom React hooks (`use*` prefix) for API/WebSocket data fetching |
| `services/dashboard/src/lib/api.ts` | Axios-based REST client for Fleet Manager |
| `services/dashboard/src/lib/types.ts` | Shared TypeScript types |
| `services/dashboard/src/lib/hosts.ts` | Base URL resolution (respects `HOST_IP` env) |
| `services/dashboard/src/types/index.ts` | Additional type exports |
| `services/dashboard/vitest.config.ts` | Vitest config (jsdom env, `@` path alias) |
| `services/dashboard/test/` | Dashboard unit tests |
| `services/dashboard/tailwind.config.js` | Tailwind CSS config |
| `services/dashboard/next.config.js` | Next.js config |
| `config/postgres/migrations/` | Raw SQL migrations (applied by `scripts/migrate.sh`, tracked in `schema_migrations` table) |
| `flows/flows.json` | Node-RED flow definitions (auto-loaded into Node-RED container) |
| `sdks/python/` | Python SDK (`pyproject.toml`, `maestra/client.py`, `entity.py`, `stream.py`, `discovery.py`) |
| `sdks/js/` | JavaScript/TypeScript SDK |
| `sdks/arduino/MaestraClient/` | Arduino library |
| `sdks/unity/` | Unity C# SDK |
| `sdks/unreal/MaestraPlugin/` | Unreal Engine C++ plugin |
| `sdks/touchdesigner/` | TouchDesigner Python extension |
| `scripts/migrate.sh` | Migration runner script |
| `scripts/sync-ofl.js` | Syncs OFL fixture library into DB |
| `.env.example` | All required environment variables with defaults |
| `docker-compose.yml` | Full stack definition |
| `Makefile` | All dev/ops commands |
| `CLAUDE.md` | Detailed in-repo architecture reference (read this too) |

---

## 3. Tech Stack

**Backend (Python services):**
- Python 3 (async-first via `asyncio`)
- **FastAPI** 0.109 + **Uvicorn** (fleet-manager REST API)
- **Pydantic v2** (models/validation)
- **SQLAlchemy 2.0** async + **asyncpg** (ORM, PostgreSQL)
- **nats-py** (NATS pub/sub + JetStream)
- **paho-mqtt** (MQTT client in bridge)
- **redis-py** 5 async (state cache)
- **alembic** (ORM schema; note: raw SQL migrations in `config/postgres/migrations/` are used instead for core schema)
- **prometheus-client** (metrics)

**Frontend (Dashboard):**
- **Next.js 14** (App Router)
- **React 18** + **TypeScript 5**
- **Tailwind CSS 3**
- **SWR** (data fetching/caching)
- **Axios** (REST calls)
- **Recharts** (charting)
- **lucide-react** (icons)
- **Vitest 4** + **@testing-library/react** (testing)
- **mqtt** npm package (direct MQTT-over-WebSocket)

**Infrastructure:**
- **PostgreSQL + TimescaleDB** (primary DB, time-series hypertables)
- **NATS** with JetStream (message bus, primary pub/sub)
- **Mosquitto** (MQTT broker)
- **Redis** (ephemeral state, stream session TTLs)
- **Node-RED** (visual flow orchestration)
- **Grafana** (monitoring dashboards)
- **Docker + docker-compose** (all services containerized)

---

## 4. Conventions

### Python Services
- **Async-first**: All I/O uses `async def` / `await`. No sync DB or network calls.
- **Global singletons**: NATS, MQTT, Redis connections are module-level globals initialized in `main()` / startup hooks.
- **Config via env**: `os.getenv('VAR', 'default')` everywhere — no config files.
- **Graceful shutdown**: `try/finally` in `main()` to close connections.
- **Router modules**: Each feature domain gets its own `*_router.py` file with a FastAPI `APIRouter` (prefix + tags set at creation). Routers import from `database.py` and `models.py`.
- **Model naming**: Pydantic models follow `FooBase` → `FooCreate` → `FooUpdate` → `Foo` (full response). DB ORM classes are named `FooDB`.
- **Slug generation**: `generate_slug(name)` lowercases + replaces non-alphanumeric with `-`.
- **NATS subject format**: `maestra.<protocol>.<resource>.<action>` (dots, not slashes).
- **Docstrings**: Short module-level docstrings on all service files. Function docstrings where non-obvious.
- **Logging**: `logging.getLogger(__name__)` — JSON logger configured via `python-json-logger`.

### Dashboard (TypeScript/React)
- **Hooks for data**: All API/WebSocket access lives in `src/hooks/use*.ts` custom hooks. Components consume hooks, never call `api.ts` directly.
- **`@` path alias**: Maps to `src/`. Use `@/components/...`, `@/lib/...`, `@/hooks/...`.
- **Component organization**: Domain-based subdirectories under `src/components/` (e.g., `dmx/`, `console/`, `routing/`, `streams/`, `settings/`, `variable-controls/`).
- **No default exports on index files**: Domain folders export via `index.ts` named exports.
- **Tailwind only**: No CSS modules or styled-components. All styling via Tailwind utility classes.
- **TypeScript strict**: `tsconfig.json` targets strict mode. Avoid `any`.
- **SWR for REST**: Polling/caching via `useSWR`. WebSocket state kept in React state via `useWebSocket` hook.

### SQL Migrations
- Plain SQL files in `config/postgres/migrations/`, numbered `NNN_description.sql`.
- Each migration is **fully idempotent** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Tracked in a `schema_migrations` table by the `scripts/migrate.sh` runner.
- Do **not** use Alembic for core schema — use numbered SQL files.

---

## 5. DB Schema

**PostgreSQL + TimescaleDB.** Core tables are created by the initial Docker entrypoint SQL; additional tables added via numbered migrations.

### Core Tables (from `database.py`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `entity_types` | `id UUID PK`, `name VARCHAR(100) UNIQUE`, `display_name`, `description`, `icon`, `state_schema JSONB`, `default_state JSONB`, `metadata JSONB`, `created_at`, `updated_at` | Registry of entity types (e.g. "light", "sensor") |
| `entities` | `id UUID PK`, `name VARCHAR(255)`, `slug VARCHAR(255) UNIQUE`, `entity_type_id UUID FK`, `parent_id UUID FK` (self), `path LTREE`, `state JSONB`, `state_updated_at`, `status VARCHAR(50)`, `description`, `tags TEXT[]`, `metadata JSONB`, `device_id UUID FK`, `created_at`, `updated_at` | Main entity registry; LTREE for hierarchy |
| `devices` | `id UUID PK`, `name`, `device_type`, `hardware_id VARCHAR(255) UNIQUE`, `firmware_version`, `ip_address`, `location JSONB`, `metadata JSONB`, `status VARCHAR(50)`, `last_seen`, `created_at`, `updated_at` | Registered physical/virtual devices |
| `blocked_devices` | `id UUID PK`, `hardware_id UNIQUE`, `reason`, `blocked_at` | Rejected device hardware IDs |
| `device_provisions` | `id UUID PK`, `device_id FK`, `entity_id FK`, `env_vars JSONB`, `connection_config JSONB`, `provision_status`, `approved_at`, `provisioned_at`, `created_at`, `updated_at` | Config pushed to approved devices |
| `routing_devices` | `id UUID PK`, `name`, `device_type`, `icon`, `color`, `inputs JSONB`, `outputs JSONB`, `metadata JSONB`, `position_x FLOAT`, `position_y FLOAT`, `sort_order INT`, `created_at`, `updated_at` | Visual patch bay nodes |
| `routes` | `id UUID PK`, `from_device_id FK`, `from_port`, `to_device_id FK`, `to_port`, `preset_id FK`, `metadata JSONB`, `created_at` | Signal path between routing device ports |
| `route_presets` | `id UUID PK`, `name UNIQUE`, `description`, `metadata JSONB`, `is_active BOOL`, `created_at`, `updated_at` | Named routing snapshots |
| `stream_types` | `id UUID PK`, `name UNIQUE`, `display_name`, `description`, `icon`, `default_config JSONB`, `metadata JSONB`, `created_at`, `updated_at` | Stream type registry |

### Migration-Added Tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `entity_states` | `001` | TimescaleDB hypertable; time-series history of all entity state changes (`time TIMESTAMPTZ`, `entity_id`, `slug`, `type`, `path`, `state JSONB`, `previous_state JSONB`, `changed_keys TEXT[]`, `source`) |
| `entity_states_hourly` | `001` | Continuous aggregate (materialized view) — hourly change counts |
| `entity_states_daily` | `001` | Continuous aggregate — daily change counts |
| `show_annotations` | `001` | Manual show events (`time TIMESTAMPTZ`, `label`, `category`, `description`, `tags TEXT[]`, `metadata JSONB`) |
| `collection_config` | `001` | Per-entity verbosity config for state logging |
| `dmx_nodes` | `003b` | Art-Net node registry (`ip_address`, `universe`, `subnet`, `name`, `description`, `is_active BOOL`) |
| `dmx_fixtures` | `003b` | Physical DMX fixtures (`node_id FK`, `entity_id FK`, `start_channel INT`, `channel_count INT`, `mode VARCHAR`, `channel_map JSONB`, `name`, `is_active BOOL`) |
| `dmx_cues` | `007` | DMX cue snapshots (`name`, `description`, `fade_time FLOAT`, `metadata JSONB`) |
| `dmx_cue_fixtures` | `007` | Fixture channel values within a cue (`cue_id FK`, `entity_id FK`, `channel_values JSONB`) |
| `dmx_sequences` | `009` | Ordered list of cues for playback (`name`, `description`, `loop BOOL`, `metadata JSONB`) |
| `dmx_sequence_cues` | `009` | Cue order within sequence (`sequence_id FK`, `cue_id FK`, `position INT`, `hold_time FLOAT`, `fade_time FLOAT`) |
| `dmx_settings` | `012` | Global DMX configuration KV (`key VARCHAR UNIQUE`, `value JSONB`, `description`, `updated_at`) |
| `ofl_manufacturers` | `004` | Open Fixture Library manufacturers (`key UNIQUE`, `name`, `website`, `rdm_id`) |
| `ofl_fixtures` | `004` | OFL fixture definitions (`manufacturer_id FK`, `key`, `name`, `categories TEXT[]`, `full_data JSONB`, `search_vector TSVECTOR`) |
| `ofl_sync_log` | `004` | OFL sync run metadata |
| `stream_subscribers` | `013` | TimescaleDB hypertable for multicast stream subscriber sessions (`time TIMESTAMPTZ`, `stream_id`, `consumer_id`, `status`, `metadata JSONB`) |

---

## 6. Branch Naming

Inferred from existing remote branches:

```
feature/<short-slug>       # new features (e.g. feature/console-visualization)
fix/<short-slug>           # bug fixes (e.g. fix/console-visualization-live-data)
bugfix/<short-slug>        # also used (e.g. bugfix/dmx-entity-state-routing)
develop                    # integration branch; PRs merge here before main
```

For issue-linked branches use: `feat/issue-<N>-<short-slug>` or `fix/issue-<N>-<short-slug>`.

---

## 7. Worker Preference

Both stryx and bigrig. No preference — assign round-robin for parallel tasks.

---

## 8. Notes

### Monorepo Structure
This is a monorepo with independent services, SDKs, examples, and docs under one repo. Key top-level dirs:
- `services/` — all Docker services (Python + Next.js)
- `sdks/` — client SDKs (Python, JS/TS, Arduino, Unity, Unreal, TouchDesigner)
- `config/` — Docker service configs, Grafana dashboards, NATS/MQTT/Redis config, SQL migrations
- `flows/` — Node-RED flow JSON
- `examples/` — Example device firmware (ESP32, Arduino, Python)
- `docs/` — MkDocs documentation site
- `scripts/` — Dev tooling scripts

### Do Not Edit (Generated/External)
- `services/dashboard/package-lock.json` — generated
- `services/dashboard/.next/` — build artifact
- `services/dashboard/next-env.d.ts` — auto-generated by Next.js
- `services/fleet-manager/export_openapi.py` — generates OpenAPI spec, not production code
- `sdks/arduino/MaestraClient/` — Arduino library, changes need version bump via `scripts/bump-sdk-version.sh`
- Any OFL fixture data synced by `scripts/sync-ofl.js` — runs against the OFL git submodule

### External Services Required
Running any Python service or integration test requires the Docker stack:
```bash
make up          # full stack
make dev-core    # minimal: NATS, Redis, PostgreSQL, fleet-manager, Node-RED
```

### Environment Variables
Copy `.env.example` → `.env`. Key variables:
| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://maestra:maestra_dev_password@postgres:5432/maestra` | PostgreSQL connection |
| `POSTGRES_PASSWORD` | `maestra_dev_password` | Postgres password |
| `NATS_URL` | `nats://nats:4222` | NATS server |
| `MQTT_BROKER` | `mosquitto:1883` | MQTT broker |
| `HOST_IP` | *(unset = localhost)* | LAN IP for remote device access |
| `OSC_IN_PORT` | `57120` | OSC gateway inbound UDP port |
| `OSC_OUT_PORT` | `57121` | OSC gateway outbound UDP port |
| `OSC_TARGETS` | *(unset)* | Comma-separated `ip:port` for OSC entity state broadcasts |
| `DEMO_MODE` | `true` | Enables synthetic data generation |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

### Database Migrations
Migrations are **plain SQL** in `config/postgres/migrations/`, not Alembic. To add a new migration:
1. Create `NNN_description.sql` (next number in sequence)
2. Make it fully idempotent (`IF NOT EXISTS`, etc.)
3. Run `make migrate` to apply

### NATS Subject Conventions
- `maestra.entity.state.update.<slug>` — merge entity state
- `maestra.entity.state.set.<slug>` — replace entity state
- `maestra.entity.state.<type>.<slug>` — broadcast after state change
- `maestra.osc.*` — messages from OSC gateway
- `maestra.mqtt.*` — messages from MQTT bridge
- `maestra.to_osc.*` — NATS → OSC output
- `maestra.to_mqtt.*` — NATS → MQTT output
- `maestra.to_artnet.universe.*` — raw universe bypass to DMX gateway
- `maestra.stream.*` — stream control plane

### OFL Submodule
The Open Fixture Library is a git submodule under `config/ofl/` (or similar). The `scripts/sync-ofl.js` script bulk-imports fixture JSON into the `ofl_fixtures` table. Do not manually edit OFL fixture data in the DB.
