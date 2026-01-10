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
│  GATEWAY LAYER: OSC Gateway│WebSocket Gateway│MQTT Broker  │
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

### Message Flow Patterns

**Topic naming:**
- NATS: `maestra.<protocol>.<resource>.<action>` (e.g., `maestra.mqtt.devices.esp32.temperature`)
- MQTT: `maestra/<resource>/<action>` (e.g., `maestra/devices/esp32/temperature`)

**Bridge routing:**
- MQTT → NATS: `maestra/x/y` becomes `maestra.mqtt.maestra.x.y`
- NATS → MQTT: `maestra.to_mqtt.x.y` becomes `x/y`
- NATS → OSC: Subscribe to `maestra.to_osc.*`

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
make backup-db       # Backup to backups/
make restore-db FILE=backups/backup.sql

# Testing
make test-mqtt       # Publish test MQTT message
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
- API docs at http://localhost:8080/docs

### Dashboard (Next.js)

Located at `services/dashboard/`:
- Next.js 14 with React 18
- TailwindCSS, Recharts, Socket.IO, MQTT
- Environment vars in `NEXT_PUBLIC_*` prefix

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

## Database Schema (TimescaleDB)

Key tables in `config/postgres/init/01-init-db.sql`:

- **devices**: Device registry with status, location, metadata
- **device_metrics**: Time-series hypertable (90-day retention)
- **device_events**: Event logs hypertable (30-day retention)
- **device_configurations**: Versioned device configs (JSON)
- **experiences**: Node-RED flow definitions
- **device_groups**: Logical device groupings

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
```

## Configuration

- **Environment**: Copy `.env.example` to `.env` (or `make init`)
- **Docker network**: `maestra-network` (172.28.0.0/16)
- **Service configs**: `config/<service>/`
- **Node-RED flows**: `flows/`
