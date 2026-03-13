# DMX / Art-Net Gateway

The DMX Gateway bridges the Maestra NATS message bus to physical DMX lighting fixtures via the **Art-Net** protocol. It enables any Maestra client — TouchDesigner, Node-RED, Unreal Engine, a browser, or a custom script — to control real lights in real time by publishing entity state changes.

Configuration is **database-driven**: all Art-Net nodes and fixture assignments are managed through the Dashboard → DMX Lighting interface (or the Fleet Manager REST API). No YAML files required.

## How It Works

```
Maestra Client (any SDK or tool)
        │  PATCH /entities/{id}/state
        ▼
    NATS Bus   maestra.entity.state.venue.stage.par_l1
        │
        ▼
  DMX Gateway
  ├── subscribes to entity state changes
  ├── loads fixture config from Fleet Manager API (/dmx/nodes, /dmx/fixtures)
  ├── resolves entity_id → entity path
  ├── converts variable values → DMX channel bytes
  └── sends Art-Net ArtDMX UDP packets to the configured node
        │
        ▼  UDP port 6454
  Art-Net Node (e.g. Enttec ODE, Pathway, etc.)
        │  XLR DMX512
        ▼
  Physical Fixtures
```

The gateway is **hardware-agnostic** — it works with any Art-Net node on the network. Configuration changes between venues via the Dashboard, not file edits.

## Prerequisites

- An Art-Net node connected to your network with a known static IP address
- DMX fixtures patched to the node's output ports
- Maestra running with NATS and Fleet Manager available

## Quick Start

### 1. Configure via the Dashboard

Open the Dashboard → **DMX Lighting** and:

1. Add an **Art-Net Node** (hardware device): enter IP address, port, manufacturer, and universe assignments
2. Add **DMX Fixtures**: select the node, universe, start channel, and channel count
3. Optionally link each fixture to a Maestra **Entity** — the gateway will then respond to entity state changes for that fixture automatically

### 2. Start the DMX gateway

The DMX gateway is an opt-in service — it is not started by `make up`. Enable it with:

```bash
make up-dmx          # Full stack + DMX gateway
make dev-dmx         # Core services + DMX gateway (lighter)
```

The gateway connects to the Fleet Manager API on startup and loads all nodes and fixtures. It refreshes configuration every 30 seconds automatically, so new fixtures added via the Dashboard are picked up without a restart.

### 3. Control a fixture

Link a fixture to a Maestra entity (via the DMX Lighting → fixture detail view), then publish a state change using any Maestra client:

**Via curl:**

```bash
curl -X PATCH http://localhost:8080/entities/{entity-slug}/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"intensity": 0.8, "red": 1.0, "green": 0.0, "blue": 0.0}}'
```

**Via Node-RED:** Use an HTTP request node targeting `PATCH /entities/{slug}/state`.

**Via raw bypass (any universe):**

```bash
nats pub maestra.to_artnet.universe.1 '{"channels": [255, 0, 0, 0, 0, 0, 0]}'
```

## NATS Topics

| Subject | Direction | Description |
|---------|-----------|-------------|
| `maestra.entity.state.>` | Inbound | Entity state changes (normal mode) |
| `maestra.to_artnet.universe.{n}` | Inbound | Raw 512-channel universe array (bypass mode) |
| `maestra.dmx.fixture.{path}` | Outbound | Resolved DMX channel values per fixture (debug) |

### Raw Universe Bypass

For direct low-level DMX control (e.g. from a lighting console or pre-computed array), publish a full universe channel array:

```json
{ "channels": [0, 255, 128, 64, 0, 0, 0, ...] }
```

```bash
nats pub maestra.to_artnet.universe.1 '{"channels": [255, 0, 0, 0, 0, 0, 0]}'
```

### Debug Channel Values

The gateway publishes resolved channel values after every state change. Subscribe to monitor what DMX bytes are being sent:

```bash
nats sub 'maestra.dmx.fixture.>'
```

## REST API Reference

All DMX configuration is managed via the Fleet Manager API. Full interactive docs at `http://localhost:8080/docs`.

### Art-Net Nodes (`/dmx/nodes`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/nodes` | List all configured Art-Net nodes |
| `POST` | `/dmx/nodes` | Register a new Art-Net node |
| `GET` | `/dmx/nodes/{id}` | Get a single node |
| `PUT` | `/dmx/nodes/{id}` | Update node configuration |
| `DELETE` | `/dmx/nodes/{id}` | Remove a node (fails if fixtures are assigned) |

### DMX Fixtures (`/dmx/fixtures`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/fixtures` | List all fixtures (optional `?node_id=` filter) |
| `POST` | `/dmx/fixtures` | Create a new fixture |
| `GET` | `/dmx/fixtures/{id}` | Get a single fixture |
| `PUT` | `/dmx/fixtures/{id}` | Update fixture config, position, or channel map |
| `DELETE` | `/dmx/fixtures/{id}` | Remove a fixture |
| `PUT` | `/dmx/fixtures/positions/bulk` | Bulk update canvas positions |

## Channel Map Reference

Each fixture has a `channel_map` that maps variable names to DMX channel offsets:

```json
{
  "intensity": { "offset": 1, "type": "range" },
  "red":       { "offset": 2, "type": "range" },
  "green":     { "offset": 3, "type": "range" },
  "blue":      { "offset": 4, "type": "range" },
  "color":     { "offset": 5, "type": "enum", "enum_dmx_values": { "white": 0, "red": 10, "blue": 30 } }
}
```

### Channel Types

| Type | Maestra Value | DMX Output | Notes |
|------|--------------|-----------|-------|
| `range` | `0.0` – `1.0` | `0` – `255` | Pan, tilt, intensity, zoom |
| `number` | `0` – `100` | `0` – `255` | Percentage-based controls |
| `boolean` | `true` / `false` | `255` / `0` | Lamp on/off, strobe enable |
| `enum` | string label | lookup value | Color wheels, gobos |
| `color` | `0.0` – `1.0` | `0` – `255` | Per-component (red, green, blue) |

## Make Targets

| Command | Description |
|---------|-------------|
| `make up-dmx` | Start full stack including DMX gateway |
| `make dev-dmx` | Start core services + DMX gateway |
| `make logs-dmx` | Tail DMX gateway logs |
| `make build-dmx` | Rebuild the DMX gateway image |
| `make test-dmx` | Publish a test entity state via NATS |

## Art-Net Packet Format

The gateway implements the Art-Net ArtDMX packet directly (no external library):

```
Bytes  Field
0–7    "Art-Net\0"      ID string
8–9    0x0050           OpCode (ArtDMX), little-endian
10–11  0x000E           Protocol version 14, big-endian
12     1–255            Sequence number (increments per universe per send)
13     0                Physical (not used)
14–15  universe         Art-Net universe number, little-endian
16–17  512              DMX data length, big-endian
18–529 channels[0..511] 512 DMX channel values
```

Total packet size: 530 bytes. Sent as UDP unicast to the configured node IP.

## Send Strategy

- **On-change:** A full 512-channel universe packet is sent immediately whenever any channel in that universe changes.
- **Keep-alive:** All universes are resent at 4 Hz (configurable via `KEEPALIVE_HZ`) regardless of changes. This prevents the Art-Net node from timing out and turning fixtures off.
- **Config refresh:** The gateway reloads its node/fixture configuration from the Fleet Manager API every 30 seconds (configurable via `CONFIG_REFRESH_INTERVAL`), picking up any changes made via the Dashboard.

## NATS Reconnection

The keep-alive loop runs independently of the NATS connection. If NATS disconnects, the gateway continues sending its last known universe state to the Art-Net node so fixtures hold their current values.

## Logs

```bash
make logs-dmx
```

Startup output includes a config summary:

```
DMX config loaded: 1 node(s), 12 fixture(s), 8 with entity routing
  'Stage PAR L1' → demo_venue.stage.par_l1 node=192.168.1.50 universe=1 start_ch=65 channels=7
  ...
DMX Gateway ready
  Nodes:    1
  Fixtures: 12
  Routable: 8
  Refresh:  every 30s
```

Set `DMX_LOG_LEVEL=DEBUG` in your `.env` for per-channel resolution logging.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLEET_MANAGER_URL` | `http://fleet-manager:8080` | Fleet Manager API base URL |
| `NATS_URL` | `nats://nats:4222` | NATS connection |
| `LOG_LEVEL` | `INFO` | Log verbosity |
| `CONFIG_REFRESH_INTERVAL` | `30` | Seconds between config reloads |
| `KEEPALIVE_HZ` | `4` | Universe resend rate |

## Troubleshooting

**Gateway starts but no light response:**

1. Check the Art-Net node IP — it must be reachable from the Docker container network
2. Verify Art-Net port 6454/UDP is not blocked by a firewall
3. Check `make logs-dmx` for NATS or Fleet Manager connection errors
4. Enable debug logging: set `DMX_LOG_LEVEL=DEBUG` and watch for channel resolution output

**Entity state changes not triggering DMX:**

1. Confirm the fixture has an `entity_id` set and that entity exists in Maestra
2. Subscribe to the debug subject to see what the gateway is resolving:
   ```bash
   nats sub 'maestra.dmx.fixture.>'
   ```
3. Check the gateway logs after a state change for `entity_path not found in fixture index`

**Wrong channels firing:**

1. Verify `start_channel` and channel `offset` values against the fixture manual
2. Check the fixture's DMX mode matches the channel map (e.g. `15ch` mode, not `8ch`)

**Art-Net node using zero-based universe numbering:**

In the Dashboard → DMX Lighting → Art-Net Node setup, set the universe's `Art-Net Universe` field to `0` for the first universe. The gateway uses the `artnet_universe` value from the database directly.
