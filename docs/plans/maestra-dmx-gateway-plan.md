# Maestra — DMX / Art-Net Gateway Service
## Architecture & Build Plan

**Version:** 1.0  
**Project:** `maestra-core`  
**Reference Venue:** Relay Santa Fe

---

## 1. Overview

The DMX Gateway is a new Maestra gateway service that bridges the NATS message bus to physical DMX lighting fixtures via the Art-Net protocol. It follows the identical architectural pattern as the existing OSC, WebSocket, and MQTT gateways, and is added to the Maestra stack as a Docker Compose profile so it is opt-in per deployment.

The gateway enables any Maestra client — TouchDesigner, Node-RED, Unreal Engine, a browser, or a custom script — to control physical lights in real time by publishing entity state changes to NATS. A per-venue patch map translates abstract fixture variables (`intensity`, `color`, `pan`, `tilt`) into concrete DMX universe and channel assignments.

**Design Principles:**

- Follows existing Maestra gateway conventions exactly — no new patterns introduced
- Hardware-agnostic: works with any Art-Net node on the network, not tied to a specific device
- Venue-portable: only the `patch.yaml` changes per location, no code changes required
- Bidirectional: reads Art-Net feedback from the node back into NATS entity state
- Profile-gated: excluded from the default stack and enabled only when DMX hardware is present

---

## 2. Architecture

### 2.1 System Context

```
Maestra Clients (TouchDesigner, Node-RED, Unreal, Browser, etc.)
         |  PATCH /entities/{id}/state   →   entity state change
         ↓
     NATS Bus   maestra.entity.state.venue.stage.spot_l1
         |
         ↓
  ┌─────────────────────────────────────────┐
  │  DMX Gateway Service  (new)             │
  │  ├── NATS subscriber                    │
  │  ├── Patch Map Loader   (patch.yaml)    │
  │  ├── Channel Mapper                     │
  │  └── Art-Net Sender    (UDP port 6454)  │
  └─────────────────────────────────────────┘
         |  Art-Net UDP unicast to node IP
         ↓
  ┌────────────────────────────────┐
  │  Art-Net Node  (4-universe)    │
  │  Static IP via DHCP lease      │
  │  PoE powered                   │
  └────────────────────────────────┘
         |  XLR DMX512
         ↓
  Physical Fixtures (spots, washes, pars, dimmers)
```

### 2.2 NATS Topic Conventions

The gateway follows Maestra's standard topic naming convention: `maestra.<layer>.<path>`

| NATS Subject | Direction | Purpose |
|---|---|---|
| `maestra.entity.state.>` | Inbound | Entity state changes from any Maestra client |
| `maestra.to_artnet.universe.{n}` | Inbound | Raw 512-channel universe array (bypass mode) |
| `maestra.artnet.universe.{n}` | Outbound | Art-Net feedback received from node (bidirectional) |
| `maestra.dmx.fixture.{path}` | Outbound | Resolved DMX channel values per fixture (debug/monitoring) |

### 2.3 Message Envelope

All messages use the standard Maestra JSON envelope. Entity state change messages arriving on NATS carry the full entity path and changed state variables:

```json
{
  "timestamp": "2026-01-01T12:00:00.000Z",
  "source": "api",
  "entity_path": "venue.stage.frontlight.spot_l1",
  "state": {
    "intensity": 0.85,
    "color": { "r": 255, "g": 140, "b": 60, "a": 255 },
    "pan": 0.5,
    "tilt": 0.3
  }
}
```

### 2.4 Art-Net Packet Output

The gateway sends standard Art-Net DMX512 packets (OpCode `0x5000`, ArtDMX) as UDP unicast to the node's configured IP address on port `6454`.

**Send strategy:**
- A full 512-channel universe array is sent on every state change that affects any channel in that universe (on-change sending)
- A keep-alive packet is sent at 4 Hz regardless of changes to prevent the node from timing out
- No Art-Net library dependency — the ArtDMX packet format is implemented directly (~30 lines), giving full control over timing, sequence numbers, and universe offset

> **Universe Zero-Offset Note:** Many Art-Net nodes use zero-indexed universes internally. Universe 1 in Maestra's patch map corresponds to Art-Net universe 0 in the packet. The gateway handles this offset automatically based on the `node_universe_offset` setting in config.

---

## 3. Service Structure

### 3.1 File Layout

```
maestra-core/
├── services/
│   └── dmx-gateway/              ← new service
│       ├── Dockerfile
│       ├── requirements.txt
│       ├── main.py               ← entry point, NATS lifecycle
│       ├── artnet_sender.py      ← Art-Net UDP packet builder & sender
│       ├── patch_loader.py       ← loads & validates patch.yaml
│       ├── channel_mapper.py     ← entity state → DMX channel values
│       └── universe_buffer.py   ← per-universe 512-byte arrays + diff
│
├── config/
│   └── dmx/
│       ├── patch.yaml            ← venue fixture map (changes per location)
│       └── patch.example.yaml    ← documented reference template
│
└── docker-compose.yml            ← dmx-gateway added under 'dmx' profile
```

### 3.2 Component Responsibilities

#### `main.py` — Entry Point & NATS Lifecycle

Follows the identical async pattern used by the OSC gateway and MQTT-NATS bridge. Connects to NATS, subscribes to entity state subjects, and dispatches incoming messages to the channel mapper. Manages the 4 Hz Art-Net keep-alive tick loop.

```python
async def main():
    nc = await nats.connect(os.getenv('NATS_URL', 'nats://nats:4222'))
    patch = load_patch(os.getenv('PATCH_MAP_PATH', '/config/patch.yaml'))
    mapper = ChannelMapper(patch)
    sender = ArtNetSender(patch.node.ip, patch.node.port)
    buffers = UniverseBufferSet()

    async def on_entity_state(msg):
        data = json.loads(msg.data.decode())
        updates = mapper.resolve(data['entity_path'], data['state'])
        for universe, channels in updates.items():
            buffers.apply(universe, channels)
            sender.send(universe, buffers.get(universe))

    async def on_raw_universe(msg):
        universe = int(msg.subject.split('.')[-1])
        dmx_array = json.loads(msg.data.decode())['channels']
        buffers.set(universe, dmx_array)
        sender.send(universe, dmx_array)

    await nc.subscribe('maestra.entity.state.>', cb=on_entity_state)
    await nc.subscribe('maestra.to_artnet.universe.*', cb=on_raw_universe)
    asyncio.create_task(keepalive_loop(sender, buffers, hz=4))
    await asyncio.Event().wait()
```

#### `artnet_sender.py` — UDP Packet Builder

Builds and sends Art-Net ArtDMX packets (OpCode `0x5000`). Handles the universe zero-offset, sequence number incrementing, and UDP socket lifecycle. Sends unicast to the configured node IP.

```python
ARTNET_HEADER = b'Art-Net\x00'
ARTNET_OPCODE_DMX = 0x5000

def build_artdmx(universe: int, dmx: bytes, sequence: int) -> bytes:
    length = len(dmx)
    return (
        ARTNET_HEADER +
        struct.pack('<H', ARTNET_OPCODE_DMX) +  # OpCode LE
        struct.pack('>H', 14) +                  # ProtVer 14
        bytes([sequence & 0xFF, 0]) +            # Sequence, Physical
        struct.pack('<H', universe) +             # Universe LE
        struct.pack('>H', length) +              # Length BE
        dmx
    )
```

#### `patch_loader.py` — Configuration Loader

Loads and validates `patch.yaml` at startup using Pydantic models. Fails loudly with a clear error if the patch map is invalid, missing required fields, or references DMX channels outside 1–512. Exposes a typed `PatchMap` dataclass to the rest of the service.

#### `channel_mapper.py` — Entity State to DMX Translation

The core translation layer. Given an entity path and a state dict, returns a mapping of `universe → {channel: value}` for every DMX channel affected by that state change.

| Entity Variable Type | DMX Range | Conversion |
|---|---|---|
| `range` (0.0–1.0) | 0–255 | `value × 255`, clamped |
| `color` (RGBA) | 0–255 each | r, g, b, a mapped to consecutive channels per patch |
| `number` (0–100) | 0–255 | `(value / 100) × 255` |
| `boolean` | 0 or 255 | `false → 0`, `true → 255` |
| `enum` | 0–255 | Mapped via `enum_dmx_values` table in patch config |

#### `universe_buffer.py` — Universe State Buffer

Maintains a 512-byte array per configured universe. Applies channel updates as diffs — only changed channels trigger a new Art-Net packet. Provides the current full array for keep-alive sends.

---

## 4. Configuration

### 4.1 Design Philosophy

The patch map is the only thing that changes between venue deployments. All service code stays identical. The YAML file describes the physical reality of a specific venue: which fixtures are present, their DMX addresses, and how Maestra entity variables map to those channels.

Fixture entity paths in the patch map must match the entities created in Maestra's entity system for that venue. The gateway does not create entities — it only listens for state changes on paths it knows about.

### 4.2 `patch.yaml` Schema

```yaml
# ─────────────────────────────────────────────────────────
# Maestra DMX Gateway — Venue Patch Map
# ─────────────────────────────────────────────────────────

venue: relay-santa-fe          # Identifier for logging / monitoring

node:
  ip: 192.168.1.50             # Static IP via DHCP lease on node MAC address
  port: 6454                   # Standard Art-Net UDP port
  universe_offset: 0           # 0 = node universe 0 = Maestra universe 1
  keepalive_hz: 4              # Keep-alive send rate (Hz) when no changes occur
  mode: unicast                # unicast to node IP (not broadcast)

universes:
  - id: 1                      # Maestra universe number
    artnet_universe: 0         # Corresponding Art-Net universe on node
    port: 1                    # Physical DMX port on the node (1–4)

fixtures:                      # One entry per logical fixture
  - id: spot_l1
    label: Moving Spot 1
    model: Eliminator Stealth Spot
    entity_path: venue.stage.spot_l1
    universe: 1
    start_channel: 1           # DMX address of first channel
    mode: 15ch                 # Verify against fixture manual
    channel_map:               # variable name → channel offset (1-indexed from start_channel)
      intensity:  { offset: 1, type: range }
      shutter:    { offset: 2, type: range }
      color:      { offset: 3, type: enum,
                    enum_dmx_values: { white: 0, red: 10, blue: 30,
                    green: 50, amber: 70, uv: 90 } }
      gobo:       { offset: 5, type: enum,
                    enum_dmx_values: { open: 0, gobo1: 16, gobo2: 32 } }
      pan:        { offset: 8,  type: range }
      pan_fine:   { offset: 9,  type: range }
      tilt:       { offset: 10, type: range }
      tilt_fine:  { offset: 11, type: range }
      speed:      { offset: 12, type: range }
      lamp:       { offset: 15, type: boolean }
```

### 4.3 Relay Santa Fe Full Patch Map

> **Note:** Channel maps for the Eliminator Stealth Spot and Stealth Zoom Wash are based on typical fixture profiles and must be verified against the actual fixture manuals before use. The Chauvet SlimPAR T12BT and DMX-4 Dimmer channel maps are standard and reliable.

```yaml
venue: relay-santa-fe

node:
  ip: 192.168.1.50
  port: 6454
  universe_offset: 0
  keepalive_hz: 4
  mode: unicast

universes:
  - id: 1
    artnet_universe: 0
    port: 1

fixtures:

  # ── Moving Spots (Eliminator Stealth Spot) ──────────────────────────────
  # VERIFY: channel map against fixture manual before use

  - id: spot_l1
    label: Moving Spot 1
    model: Eliminator Stealth Spot
    entity_path: venue.stage.spot_l1
    universe: 1
    start_channel: 1
    mode: 15ch
    channel_map:
      intensity:   { offset: 1,  type: range }
      shutter:     { offset: 2,  type: range }
      color:       { offset: 3,  type: enum,
                     enum_dmx_values: { white: 0, red: 10, blue: 30, green: 50, amber: 70, uv: 90 } }
      gobo:        { offset: 5,  type: enum,
                     enum_dmx_values: { open: 0, gobo1: 16, gobo2: 32, gobo3: 48 } }
      pan:         { offset: 8,  type: range }
      pan_fine:    { offset: 9,  type: range }
      tilt:        { offset: 10, type: range }
      tilt_fine:   { offset: 11, type: range }
      speed:       { offset: 12, type: range }
      lamp:        { offset: 15, type: boolean }

  - id: spot_l2
    label: Moving Spot 2
    model: Eliminator Stealth Spot
    entity_path: venue.stage.spot_l2
    universe: 1
    start_channel: 17
    mode: 15ch
    channel_map:
      intensity:   { offset: 1,  type: range }
      shutter:     { offset: 2,  type: range }
      color:       { offset: 3,  type: enum,
                     enum_dmx_values: { white: 0, red: 10, blue: 30, green: 50, amber: 70, uv: 90 } }
      gobo:        { offset: 5,  type: enum,
                     enum_dmx_values: { open: 0, gobo1: 16, gobo2: 32, gobo3: 48 } }
      pan:         { offset: 8,  type: range }
      pan_fine:    { offset: 9,  type: range }
      tilt:        { offset: 10, type: range }
      tilt_fine:   { offset: 11, type: range }
      speed:       { offset: 12, type: range }
      lamp:        { offset: 15, type: boolean }

  # ── Moving Zoom Washes (Eliminator Stealth Zoom Wash) ───────────────────
  # VERIFY: channel map against fixture manual before use

  - id: wash_l1
    label: Moving Zoom Wash 1
    model: Eliminator Stealth Zoom Wash
    entity_path: venue.stage.wash_l1
    universe: 1
    start_channel: 33
    mode: 16ch
    channel_map:
      intensity:   { offset: 1,  type: range }
      red:         { offset: 2,  type: range }
      green:       { offset: 3,  type: range }
      blue:        { offset: 4,  type: range }
      white:       { offset: 5,  type: range }
      color:       { offset: 6,  type: range }
      zoom:        { offset: 7,  type: range }
      pan:         { offset: 9,  type: range }
      pan_fine:    { offset: 10, type: range }
      tilt:        { offset: 11, type: range }
      tilt_fine:   { offset: 12, type: range }
      speed:       { offset: 13, type: range }

  - id: wash_l2
    label: Moving Zoom Wash 2
    model: Eliminator Stealth Zoom Wash
    entity_path: venue.stage.wash_l2
    universe: 1
    start_channel: 49
    mode: 16ch
    channel_map:
      intensity:   { offset: 1,  type: range }
      red:         { offset: 2,  type: range }
      green:       { offset: 3,  type: range }
      blue:        { offset: 4,  type: range }
      white:       { offset: 5,  type: range }
      color:       { offset: 6,  type: range }
      zoom:        { offset: 7,  type: range }
      pan:         { offset: 9,  type: range }
      pan_fine:    { offset: 10, type: range }
      tilt:        { offset: 11, type: range }
      tilt_fine:   { offset: 12, type: range }
      speed:       { offset: 13, type: range }

  # ── SlimPARs (Chauvet SlimPAR T12BT, 7ch mode) ──────────────────────────

  - id: par_l1
    label: SlimPAR 1
    model: Chauvet SlimPAR T12BT
    entity_path: venue.stage.par_l1
    universe: 1
    start_channel: 65
    mode: 7ch
    channel_map:
      intensity:   { offset: 1, type: range }
      red:         { offset: 2, type: range }
      green:       { offset: 3, type: range }
      blue:        { offset: 4, type: range }
      amber:       { offset: 5, type: range }
      white:       { offset: 6, type: range }
      uv:          { offset: 7, type: range }

  - id: par_l2
    label: SlimPAR 2
    model: Chauvet SlimPAR T12BT
    entity_path: venue.stage.par_l2
    universe: 1
    start_channel: 72
    mode: 7ch
    channel_map:
      intensity:   { offset: 1, type: range }
      red:         { offset: 2, type: range }
      green:       { offset: 3, type: range }
      blue:        { offset: 4, type: range }
      amber:       { offset: 5, type: range }
      white:       { offset: 6, type: range }
      uv:          { offset: 7, type: range }

  - id: par_l3
    label: SlimPAR 3
    model: Chauvet SlimPAR T12BT
    entity_path: venue.stage.par_l3
    universe: 1
    start_channel: 79
    mode: 7ch
    channel_map:
      intensity:   { offset: 1, type: range }
      red:         { offset: 2, type: range }
      green:       { offset: 3, type: range }
      blue:        { offset: 4, type: range }
      amber:       { offset: 5, type: range }
      white:       { offset: 6, type: range }
      uv:          { offset: 7, type: range }

  - id: par_l4
    label: SlimPAR 4
    model: Chauvet SlimPAR T12BT
    entity_path: venue.stage.par_l4
    universe: 1
    start_channel: 86
    mode: 7ch
    channel_map:
      intensity:   { offset: 1, type: range }
      red:         { offset: 2, type: range }
      green:       { offset: 3, type: range }
      blue:        { offset: 4, type: range }
      amber:       { offset: 5, type: range }
      white:       { offset: 6, type: range }
      uv:          { offset: 7, type: range }

  # ── 4-Channel Dimmer (Chauvet DMX-4) ────────────────────────────────────
  # VERIFY: confirm channel layout and dimmer curve mode before use
  # Each channel controls one dimmer output (0 = off, 255 = full)

  - id: dimmer_ch1
    label: Dimmer Channel 1
    model: Chauvet DMX-4 Dimmer
    entity_path: venue.stage.dimmer_rack.ch1
    universe: 1
    start_channel: 100
    mode: 4ch
    channel_map:
      intensity:   { offset: 1, type: range }

  - id: dimmer_ch2
    label: Dimmer Channel 2
    model: Chauvet DMX-4 Dimmer
    entity_path: venue.stage.dimmer_rack.ch2
    universe: 1
    start_channel: 100
    mode: 4ch
    channel_map:
      intensity:   { offset: 2, type: range }

  - id: dimmer_ch3
    label: Dimmer Channel 3
    model: Chauvet DMX-4 Dimmer
    entity_path: venue.stage.dimmer_rack.ch3
    universe: 1
    start_channel: 100
    mode: 4ch
    channel_map:
      intensity:   { offset: 3, type: range }

  - id: dimmer_ch4
    label: Dimmer Channel 4
    model: Chauvet DMX-4 Dimmer
    entity_path: venue.stage.dimmer_rack.ch4
    universe: 1
    start_channel: 100
    mode: 4ch
    channel_map:
      intensity:   { offset: 4, type: range }
```

### 4.4 Entity Schema for Fixtures

Each fixture in the patch map requires a corresponding entity in Maestra. These are created once per venue via the Fleet Manager API or via the venue bootstrap script (Phase 3). The entity type defines the variable schema; fixture entities are instances of that type.

**Recommended entity types to seed in Maestra:**

| Entity Type | Variables (direction: input) |
|---|---|
| `dmx_moving_spot` | `intensity` (range), `shutter` (range), `color` (enum), `gobo` (enum), `pan` (range), `pan_fine` (range), `tilt` (range), `tilt_fine` (range), `speed` (range), `lamp` (boolean) |
| `dmx_moving_wash` | `intensity` (range), `red` (range), `green` (range), `blue` (range), `white` (range), `color` (range), `zoom` (range), `pan` (range), `tilt` (range), `speed` (range) |
| `dmx_par` | `intensity` (range), `red` (range), `green` (range), `blue` (range), `amber` (range), `white` (range), `uv` (range) |
| `dmx_dimmer_channel` | `intensity` (range) |

**Relay Santa Fe entity hierarchy:**

```
venue                              (type: venue)
└── stage                          (type: zone)
    ├── spot_l1                    (type: dmx_moving_spot)
    ├── spot_l2                    (type: dmx_moving_spot)
    ├── wash_l1                    (type: dmx_moving_wash)
    ├── wash_l2                    (type: dmx_moving_wash)
    ├── par_l1                     (type: dmx_par)
    ├── par_l2                     (type: dmx_par)
    ├── par_l3                     (type: dmx_par)
    ├── par_l4                     (type: dmx_par)
    └── dimmer_rack                (type: zone)
        ├── ch1                    (type: dmx_dimmer_channel)
        ├── ch2                    (type: dmx_dimmer_channel)
        ├── ch3                    (type: dmx_dimmer_channel)
        └── ch4                    (type: dmx_dimmer_channel)
```

---

## 5. Docker & Compose Integration

### 5.1 `docker-compose.yml` Addition

```yaml
services:
  dmx-gateway:
    build: ./services/dmx-gateway
    profiles: ["dmx"]
    container_name: maestra-dmx-gateway
    restart: unless-stopped
    environment:
      - NATS_URL=nats://nats:4222
      - PATCH_MAP_PATH=/config/patch.yaml
      - LOG_LEVEL=INFO
    volumes:
      - ./config/dmx:/config:ro
    networks:
      - maestra-network
    depends_on:
      - nats
```

No `devices:` key is needed. The gateway communicates with the Art-Net node over the existing Docker bridge network via standard UDP — identical to how the OSC gateway sends UDP packets today.

### 5.2 Makefile Additions

```makefile
up-dmx:
	docker compose --profile dmx up -d

dev-dmx:
	docker compose --profile dmx up nats redis postgres fleet-manager dmx-gateway

logs-dmx:
	docker compose logs -f dmx-gateway

test-dmx:
	# Publish a test entity state to par_l1 and confirm the channel fires
	docker compose exec nats nats pub maestra.to_artnet.universe.1 \
	  '{"channels": [0,0,...,255,0,0,0,0,0,0,0]}'
```

---

## 6. Build Plan

### Phase 1 — Core Gateway Service

**Deliverable:** Art-Net packets reaching the node from a NATS message. No entity system integration yet — raw universe array mode only (`maestra.to_artnet.universe.*`).

1. Create `services/dmx-gateway/` directory with `Dockerfile` and `requirements.txt`
2. Implement `artnet_sender.py`: UDP socket, ArtDMX packet builder, unicast send to node IP
3. Implement `universe_buffer.py`: 512-byte array per universe, diff tracking for on-change sends
4. Implement `main.py`: NATS connect, subscribe to `maestra.to_artnet.universe.*`, dispatch to sender, 4 Hz keep-alive loop
5. Add `dmx-gateway` to `docker-compose.yml` under `dmx` profile
6. Add `make` targets: `up-dmx`, `dev-dmx`, `logs-dmx`
7. Manual test: publish raw universe array to NATS, confirm light channel responds

### Phase 2 — Patch Map & Channel Mapper

**Deliverable:** Entity state changes on NATS control fixtures by name via the patch map.

1. Define `patch.yaml` schema; create `config/dmx/patch.example.yaml` with full inline documentation
2. Implement `patch_loader.py`: YAML parse, Pydantic validation, typed `PatchMap` dataclass; fail loudly on bad config
3. Implement `channel_mapper.py`: entity path lookup, variable type conversions, channel offset resolution
4. Integrate mapper into `main.py`: subscribe to `maestra.entity.state.>`, dispatch to mapper → buffer → sender
5. Create `config/dmx/patch.yaml` for Relay Santa Fe using the full fixture list above
6. Add `make test-dmx` target: patch an entity state change and verify the correct DMX channel fires

### Phase 3 — Venue Entity Bootstrap

**Deliverable:** Relay Santa Fe entities exist in Maestra and are controllable end-to-end from the Fleet Manager API or Dashboard.

1. Create DMX entity types in Maestra via Fleet Manager API: `dmx_moving_spot`, `dmx_moving_wash`, `dmx_par`, `dmx_dimmer_channel`
2. Write a venue bootstrap script (`scripts/bootstrap_venue.py`) that reads `patch.yaml` and creates all entities and their variables via the Fleet Manager API
3. Run bootstrap for Relay Santa Fe — verify all entities appear in the correct hierarchy
4. End-to-end test: `PATCH /entities/venue.stage.par_l1/state { "intensity": 0.8, "red": 1.0, "green": 0, "blue": 0 }` → SlimPAR 1 turns red at 80%

### Phase 4 — Monitoring & Hardening

**Deliverable:** DMX gateway is production-ready with observability and graceful error handling.

1. Add structured logging: startup patch summary (fixture count, universe count, node IP), per-send channel diffs, NATS reconnect events
2. Handle NATS reconnection gracefully — resume sending on reconnect without losing universe buffer state
3. Publish `maestra.dmx.fixture.{path}` debug messages so resolved channel values are visible on the NATS bus
4. Add Grafana dashboard panel: DMX packet send rate, active universes, last channel update timestamps per fixture
5. Document the service in `docs/docs/guides/dmx-gateway.md`

### Phase 5 — Cognito 2 Coexistence (Optional / Future)

**Deliverable:** Cognito 2 and Maestra can both drive the same fixtures simultaneously via the Art-Net node's HTP merge capability, with Maestra taking priority when active.

1. Configure the Art-Net node's merge mode to HTP (highest takes precedence)
2. Connect Cognito 2 sACN/Art-Net output to the same network as the node
3. Assign Cognito a lower Art-Net priority; Maestra outputs at higher priority
4. Test coexistence: Maestra blackout overrides Cognito; Cognito operates freely when Maestra is idle or not sending
5. Optionally implement the Cognito Bridge service (MSC/MIDI cue control from NATS) as a further Layer 3 integration

---

## 7. Dependencies

| Package | Version | Purpose |
|---|---|---|
| `nats-py` | >=2.3 | NATS client — already used by all Maestra Python services |
| `pyyaml` | >=6.0 | Patch map YAML loading |
| `pydantic` | >=2.0 | Patch map schema validation and typed models |
| `python-dotenv` | >=1.0 | Environment variable loading |
| `socket` | stdlib | UDP socket for Art-Net — no extra dependency needed |

No Art-Net library dependency is required. The ArtDMX packet format is simple enough to implement directly (~30 lines), avoiding an unnecessary external dependency and giving full control over timing, sequence numbers, and universe offset handling.

---

## 8. Confirmed Decisions

| Decision | Resolution |
|---|---|
| Art-Net node IP | Static DHCP lease reserved for node MAC address |
| Send mode | Unicast to node IP — no broadcast |
| Fixture channel maps | To be verified against physical fixture manuals before use |
| Dimmer rack entity model | 4 individual `dmx_dimmer_channel` entities (ch1–ch4) under a `dimmer_rack` zone for per-channel control from Node-RED |
| DMX refresh strategy | On-change sending + 4 Hz keep-alive |

---

*maestra-core · services/dmx-gateway · v1.0*
