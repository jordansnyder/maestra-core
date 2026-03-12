# DMX / Art-Net Gateway

The DMX Gateway bridges the Maestra NATS message bus to physical DMX lighting fixtures via the **Art-Net** protocol. It enables any Maestra client — TouchDesigner, Node-RED, Unreal Engine, a browser, or a custom script — to control real lights in real time by publishing entity state changes.

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
  ├── looks up fixture in patch.yaml by entity_path
  ├── converts variable values → DMX channel bytes
  └── sends Art-Net ArtDMX UDP packets to node
        │
        ▼  UDP port 6454
  Art-Net Node (e.g. Enttec ODE, Pathway, etc.)
        │  XLR DMX512
        ▼
  Physical Fixtures
```

The gateway is **hardware-agnostic** — it works with any Art-Net node on the network. Only the `patch.yaml` configuration changes between venue deployments.

## Prerequisites

- An Art-Net node connected to your network with a known static IP address
- DMX fixtures patched to the node's output ports
- Maestra running with NATS available

## Quick Start

### 1. Configure your patch map

Copy the example patch map and edit it for your venue:

```bash
cp config/dmx/patch.example.yaml config/dmx/patch.yaml
```

Edit `config/dmx/patch.yaml` and set:

- `node.ip` — your Art-Net node's IP address
- `universes` — which Art-Net universes you're using
- `fixtures` — one entry per fixture with its entity path and DMX address

See [Patch Map Reference](#patch-map-reference) below for the full schema.

### 2. Bootstrap venue entities

Create the entity types and entities in Maestra that correspond to your fixtures:

```bash
# Preview what will be created (no changes made)
make bootstrap-venue-dry

# Create entity types and entities
make bootstrap-venue
```

This reads your `patch.yaml` and calls the Fleet Manager API to create the entities. Run it once per venue.

### 3. Start the DMX gateway

The DMX gateway is an opt-in service — it is not started by `make up`. Enable it with:

```bash
make up-dmx          # Full stack + DMX gateway
make dev-dmx         # Core services + DMX gateway (lighter)
```

### 4. Control a fixture

Use any Maestra client to send an entity state change. The gateway translates it to DMX automatically.

**Via curl:**

```bash
curl -X PATCH http://localhost:8080/entities/venue-stage-par-l1/state \
  -H "Content-Type: application/json" \
  -d '{"intensity": 0.8, "red": 1.0, "green": 0.0, "blue": 0.0}'
```

**Via Node-RED:** Use an HTTP request node targeting `PATCH /entities/{slug}/state`.

**Via the test target:**

```bash
make test-dmx
# Publishes intensity=0.8, red=1.0 to par_l1
```

## NATS Topics

| Subject | Direction | Description |
|---------|-----------|-------------|
| `maestra.entity.state.>` | Inbound | Entity state changes (normal mode) |
| `maestra.to_artnet.universe.{n}` | Inbound | Raw 512-channel universe array (bypass mode) |
| `maestra.artnet.universe.{n}` | Outbound | Art-Net feedback from node (future) |
| `maestra.dmx.fixture.{path}` | Outbound | Resolved DMX channel values per fixture (debug) |

### Raw Universe Bypass

For direct low-level DMX control (e.g. from a lighting console or a pre-computed array), publish a full universe array directly:

```json
{
  "channels": [0, 255, 128, 64, 0, 0, 0, ...]
}
```

```bash
# Publish raw universe array to universe 1
nats pub maestra.to_artnet.universe.1 '{"channels": [255, 0, 0, 0, 0, 0, 0]}'
```

### Debug Channel Values

The gateway publishes resolved channel values to `maestra.dmx.fixture.{entity_path}` after every state change. Subscribe to monitor what DMX bytes are actually being sent:

```bash
nats sub 'maestra.dmx.fixture.>'
```

## Patch Map Reference

The patch map (`config/dmx/patch.yaml`) is the only file that changes between venues.

### Top-Level Structure

```yaml
venue: relay-santa-fe        # Venue identifier for logging

node:
  ip: 192.168.1.50           # Art-Net node IP (set via static DHCP lease)
  port: 6454                  # Art-Net UDP port (standard, rarely changes)
  universe_offset: 0          # Subtracted from Maestra universe → Art-Net universe
                               # 0 = Maestra universe 1 = Art-Net universe 1
  keepalive_hz: 4             # Resend rate when no changes occur
  mode: unicast               # unicast (direct to IP) or broadcast

universes:
  - id: 1                     # Maestra universe number (used in fixtures)
    artnet_universe: 0        # Art-Net universe on the node
    port: 1                   # Physical DMX port on the node

fixtures:
  - id: par_l1
    label: SlimPAR 1
    model: Chauvet SlimPAR T12BT
    entity_path: venue.stage.par_l1   # Must match an entity in Maestra
    universe: 1
    start_channel: 65
    mode: 7ch
    channel_map:
      intensity: { offset: 1, type: range }
      red:       { offset: 2, type: range }
      ...
```

### Channel Types

| Type | Maestra Value | DMX Output | Notes |
|------|--------------|-----------|-------|
| `range` | `0.0` – `1.0` | `0` – `255` | Pan, tilt, intensity, zoom |
| `number` | `0` – `100` | `0` – `255` | Percentage-based controls |
| `boolean` | `true` / `false` | `255` / `0` | Lamp on/off, strobe enable |
| `enum` | string label | lookup value | Color wheels, gobos |
| `color` | `0.0` – `1.0` | `0` – `255` | Per-component (red, green, blue) |

### Enum Channel Example

```yaml
color:
  offset: 3
  type: enum
  enum_dmx_values:
    white: 0
    red: 10
    blue: 30
    green: 50
    amber: 70
    uv: 90
```

Send `"color": "amber"` in the entity state and the gateway outputs DMX value `70` on that channel.

## Entity Types

The bootstrap script creates four DMX entity types in Maestra:

| Entity Type | Variables |
|-------------|-----------|
| `dmx_moving_spot` | `intensity`, `shutter`, `color`, `gobo`, `pan`, `pan_fine`, `tilt`, `tilt_fine`, `speed`, `lamp` |
| `dmx_moving_wash` | `intensity`, `red`, `green`, `blue`, `white`, `color`, `zoom`, `pan`, `pan_fine`, `tilt`, `tilt_fine`, `speed` |
| `dmx_par` | `intensity`, `red`, `green`, `blue`, `amber`, `white`, `uv` |
| `dmx_dimmer_channel` | `intensity` |

All variables have direction `input` (values flow Maestra → DMX).

## Venue Bootstrap Script

`scripts/bootstrap_venue.py` reads your `patch.yaml` and creates entity types and entities via the Fleet Manager API.

```bash
# Preview (dry run)
python3 scripts/bootstrap_venue.py --dry-run

# Run against default API (localhost:8080) and default patch map
python3 scripts/bootstrap_venue.py

# Custom paths
python3 scripts/bootstrap_venue.py \
  --patch config/dmx/my-venue.yaml \
  --api http://192.168.1.10:8080
```

The script:

1. Creates DMX entity types if they don't exist
2. Creates entity variables for each type
3. Creates the full entity hierarchy from the patch map (parent containers first)
4. Skips entities and types that already exist (safe to re-run)

## Make Targets

| Command | Description |
|---------|-------------|
| `make up-dmx` | Start full stack including DMX gateway |
| `make dev-dmx` | Start core services + DMX gateway |
| `make logs-dmx` | Tail DMX gateway logs |
| `make build-dmx` | Rebuild the DMX gateway image |
| `make test-dmx` | Publish test state to par_l1 |
| `make bootstrap-venue` | Create venue entities from patch.yaml |
| `make bootstrap-venue-dry` | Preview bootstrap without changes |

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

Total packet size: 530 bytes. Sent as UDP unicast to `node.ip:node.port`.

## Send Strategy

- **On-change:** A full 512-channel universe packet is sent immediately whenever any channel in that universe changes.
- **Keep-alive:** All universes are resent at `keepalive_hz` (default: 4 Hz) regardless of changes. This prevents the Art-Net node from timing out and turning fixtures off.
- **Universe zero-offset:** Maestra uses 1-indexed universe numbers by convention. Set `node.universe_offset: 1` if your Art-Net node uses zero-based universe numbering.

## NATS Reconnection

The keep-alive loop runs independently of the NATS connection. If NATS disconnects, the gateway continues sending its last known universe state to the Art-Net node so fixtures hold their current values. On NATS reconnect, entity state updates resume normally without losing the universe buffer state.

## Logs

```bash
make logs-dmx
```

Startup output includes a patch summary:

```
Patch map loaded: venue='relay-santa-fe' node=192.168.1.50:6454 universes=[1] fixtures=12
  Fixture 'spot_l1' (Eliminator Stealth Spot) → venue.stage.spot_l1 universe=1 start_ch=1 channels=10
  Fixture 'par_l1' (Chauvet SlimPAR T12BT) → venue.stage.par_l1 universe=1 start_ch=65 channels=7
  ...
```

Set `DMX_LOG_LEVEL=DEBUG` in your `.env` for per-channel resolution logging.

## Troubleshooting

**Gateway starts but no light response:**

1. Check the Art-Net node IP: `node.ip` must be reachable from the Docker container network (`ping 192.168.1.50` from host)
2. Verify Art-Net port 6454/UDP is not blocked
3. Check `make logs-dmx` for NATS connection errors
4. Enable debug logging: set `DMX_LOG_LEVEL=DEBUG` and check channel resolution output

**Entity state changes not triggering DMX:**

1. Confirm the entity path in your state change matches `entity_path` in `patch.yaml` exactly
2. Subscribe to the debug subject to see what the gateway is resolving:
   ```bash
   nats sub 'maestra.dmx.fixture.>'
   ```

**Wrong channels firing:**

1. Verify `start_channel` and channel `offset` values against the fixture manual
2. Check the fixture's DMX mode matches the channel map (e.g. `15ch` mode, not `8ch`)

**Art-Net node using zero-based universes:**

Set `node.universe_offset: 1` in `patch.yaml`. Maestra universe 1 will map to Art-Net universe 0.
