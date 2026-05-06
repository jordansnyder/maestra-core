# Show Control API

System-wide show lifecycle management for Maestra installations.

## Overview

The Show Control API manages a state machine with six phases: `idle`, `pre_show`, `active`, `paused`, `post_show`, and `shutdown`. Every connected device receives state changes automatically through the existing entity state broadcast system (NATS, MQTT, OSC, WebSocket).

**Base URL:** `http://localhost:8080/show`

## State Machine

```
idle → pre_show → active → post_show → idle
                    ↕
                  paused

ANY → shutdown → idle (manual reset only)
```

### Phases

| Phase | Meaning |
|-------|---------|
| `idle` | No show running. System at rest. |
| `pre_show` | Warmup. Devices prepare. |
| `active` | Show is running. |
| `paused` | Temporarily halted. |
| `post_show` | Show ended. Cool-down. |
| `shutdown` | Preparing for power off. All outputs muted/zeroed. |

## Endpoints

### Get Current State

```
GET /show/state
```

**Response:**
```json
{
  "phase": "active",
  "previous_phase": "pre_show",
  "transition_time": "2026-03-29T16:00:00+00:00",
  "source": "dashboard",
  "context": {}
}
```

### Get Valid Transitions

```
GET /show/transitions
```

**Response:**
```json
{
  "current_phase": "active",
  "valid_transitions": ["paused", "post_show", "shutdown"]
}
```

### Transition (Generic)

```
POST /show/transition
Content-Type: application/json

{
  "to": "paused",
  "source": "my-app"
}
```

### Shortcut Endpoints

| Endpoint | Transition | Auth Required |
|----------|-----------|---------------|
| `POST /show/warmup` | idle → pre_show | If token set |
| `POST /show/go` | pre_show → active | If token set |
| `POST /show/pause` | active → paused | If token set |
| `POST /show/resume` | paused → active | If token set |
| `POST /show/stop` | active/paused → post_show | If token set |
| `POST /show/shutdown` | ANY → shutdown | If token set |
| `POST /show/reset` | shutdown/post_show → idle | If token set |

### Transition History

```
GET /show/history?limit=20&offset=0
```

**Response:** Array of state snapshots from the entity_states hypertable.

## Authentication

Set `SHOW_CONTROL_TOKEN` in your `.env` file to require Bearer token auth on all transition endpoints. If not set, endpoints are open (suitable for local installations).

```
SHOW_CONTROL_TOKEN=my-secret-token
```

```bash
curl -X POST http://localhost:8080/show/go \
  -H "Authorization: Bearer my-secret-token"
```

## Schedules

### List Schedules
```
GET /show/schedules
```

### Create Schedule
```
POST /show/schedules
Content-Type: application/json

{
  "name": "Weekday Schedule",
  "timezone": "America/New_York",
  "entries": [
    {"cron": "45 9 * * 1-5", "transition": "pre_show"},
    {"cron": "0 10 * * 1-5", "transition": "active"},
    {"cron": "0 18 * * 1-5", "transition": "shutdown"}
  ]
}
```

### Update/Delete Schedule
```
PATCH /show/schedules/{id}
DELETE /show/schedules/{id}
```

## Side Effects

Side effects fire automatically on show transitions. Default side effects trigger DMX blackout on shutdown and DMX pause/resume on show pause/resume.

```
GET /show/side-effects
POST /show/side-effects
PATCH /show/side-effects/{id}
DELETE /show/side-effects/{id}
```

### Action Types

| Type | Config | Description |
|------|--------|-------------|
| `internal_call` | `{"function": "dmx_blackout"}` | Call whitelisted internal function |
| `nats_publish` | `{"subject": "maestra.x", "payload": {}}` | Publish to NATS subject |
| `entity_state_update` | `{"slug": "my-entity", "state": {"key": "value"}}` | Update an entity's state |

## Protocol Integration

### Receiving show state (all protocols)

Show state changes broadcast automatically:

| Protocol | Topic/Address |
|----------|-------------|
| NATS | `maestra.entity.state.show_control.show` |
| MQTT | `maestra/entity/state/show_control/show` |
| OSC | `/entity/state/show_control/show/phase <value>` |
| WebSocket | Relayed from NATS automatically |

### Triggering transitions via OSC/MQTT

Send commands via NATS subjects (bridged from OSC/MQTT):
- `maestra.show.command.go` → transitions to active
- `maestra.show.command.pause` → transitions to paused
- `maestra.show.command.shutdown` → transitions to shutdown

From OSC: send `/show/go`, `/show/pause`, etc.
From MQTT: publish to `maestra/show/command/go`, `maestra/show/command/pause`, etc.
