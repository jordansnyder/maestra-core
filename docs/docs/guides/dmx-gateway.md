# DMX / Art-Net Gateway

The DMX Gateway bridges the Maestra NATS message bus to physical DMX lighting fixtures via the **Art-Net** protocol. It enables any Maestra client — TouchDesigner, Node-RED, Unreal Engine, a browser, or a custom script — to control real lights in real time by publishing entity state changes.

Configuration is **database-driven**: all Art-Net nodes, fixture assignments, cues, and sequences are managed through the Dashboard → **DMX Lighting** interface (or the Fleet Manager REST API). No YAML files required.

---

## How It Works

```
Maestra Client (any SDK or tool)
        │  PATCH /entities/{id}/state  ─or─  POST /dmx/playback/play
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

---

## Prerequisites

- An Art-Net node connected to your network with a known static IP address
- DMX fixtures patched to the node's output ports
- Maestra running with NATS and Fleet Manager available

---

## Quick Start

### 1. Configure via the Dashboard

Open the Dashboard → **DMX Lighting** and:

1. Add an **Art-Net Node** (hardware device): enter IP address, port, manufacturer, and universe assignments
2. Add **DMX Fixtures**: select the node, universe, start channel, and channel count — pick the fixture model from the Open Fixture Library to auto-populate the channel map
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

---

## Dashboard UI Reference

### DMX Lighting Page (`/dmx`)

The DMX Lighting page is the primary interface for configuring your rig and programming looks.

#### Canvas

The main canvas displays all configured fixtures as nodes arranged spatially. You can drag fixtures to set their visual positions (positions are persisted). Node size can be toggled between **S / M / L** using the scale picker in the toolbar.

Each fixture node shows:
- Fixture name and channel info
- A small **LED indicator** that flashes when DMX data is being sent to that fixture via its linked entity
- Universe color coding that matches the sidebar universe groups

**Selecting fixtures:**
- Click a fixture to select it
- Shift-click fixtures of the same OFL model + universe to multi-select
- Click empty canvas to deselect all
- Double-click a fixture to open the DMX Adjust modal directly

**Group mode (when a group is selected in the Groups tab):**

The canvas switches into group assignment mode. Fixtures render differently based on their group membership:

| State | Visual |
|---|---|
| In the selected group | Bright colored ring with glow |
| Not in any group (eligible) | Faint dashed ring |
| In a different group | Dimmed, cursor shows not-allowed |

Shift-click any eligible or in-group fixture to toggle its membership. Ineligible fixtures (in a different group) cannot be shift-clicked.

When viewing the Cues or Sequences tab, the canvas shows the same group highlight for the selected group context (read-only — shift-click assignment is only active in the Groups tab).

**Multi-select actions:**
- Select multiple fixtures to reveal an **Adjust DMX** button in the top-center of the canvas
- All selected fixtures are adjusted simultaneously

**Context menu (right-click):**
- Edit fixture settings
- Adjust DMX channels (opens the channel slider modal)
- Delete fixture

#### Toolbar Controls

| Control | Description |
|---------|-------------|
| **Pause / Resume Listening** | Pauses all external entity state sources from driving DMX output. Manual Adjust DMX sliders, cue recall, and sequence playback continue to work while paused. |
| **Clear** | *(only visible when paused)* Zeros all DMX channel values across every fixture and universe immediately. Requires confirmation. |
| **Blackout** | Instantly zeros all DMX channels across all universes without pausing. Double-click to blackout and pause simultaneously. |
| **S / M / L** | Node size picker — persisted in localStorage. |

When external signals are paused, an amber **"External signals paused"** badge appears in the toolbar as a persistent reminder.

Recalling a cue while paused automatically resumes output first, since cue recall is an intentional fire action.

#### Right Sidebar

The sidebar has five collapsible tabs:

**Art-Net Nodes**

Lists all configured Art-Net nodes. Each node shows its IP address and universe labels. You can drag to reorder, click the edit icon to open the node editor, or click **+ Add Node** at the top to add another.

**Fixtures**

Lists all fixtures, color-coded by universe. You can:
- Drag fixtures to reorder them
- Click a fixture to select it on the canvas
- Filter by universe using the dropdown
- Click the edit icon to open the fixture editor

**Groups**

Groups (also called layers) let you organize fixtures, cues, and sequences into independent playback lanes. Each group has its own playback engine — sequences in different groups run simultaneously without interfering with each other.

| Action | How |
|--------|-----|
| Create a group | Click **+ New Group**, enter a name, pick a color |
| Select a group | Click the group row — the canvas highlights which fixtures are in the group |
| Assign fixtures to a group | Select the group, then **shift-click** fixtures on the canvas |
| Remove a fixture from a group | Select the group, shift-click the fixture again (toggles) |
| Rename / recolor a group | Click the pencil icon on the group row |
| Delete a group | Click the trash icon — fixtures and cues are unlinked, not deleted |

While a group is selected, fixture nodes on the canvas render in three states:

| Canvas state | Meaning |
|---|---|
| Bright colored ring + glow | In this group |
| Faint dashed ring | Unassigned — eligible to add |
| Dimmed, no-drop cursor | Belongs to another group — cannot be shift-clicked |

Selecting **All** at the top of the group list clears the selection and shows the full canvas without any highlighting.

A green pulse indicator appears on each group row whenever that group has an active sequence engine running, so you can see what's playing across all groups at a glance.

**Cues**

Cues are snapshots of all linked fixture states at a moment in time. Cues can optionally belong to a group.

| Action | How |
|--------|-----|
| Save current state as cue | Pause signals first, then click **+ Save Cue** at the top of the Cues panel |
| Recall a cue | Click the cue row — a fade-progress bar shows cross-fade progress |
| Recall with custom fade | Set the **Fade** duration (seconds) at the top of the panel, then click any cue |
| Edit a cue (update snapshot) | Click the pencil icon → adjust DMX sliders → click **Update Cue** |
| Rename a cue | Click the rename icon on the cue row |
| Reorder cues | Drag the handle on the left of each cue row |
| Delete a cue | Click the trash icon on the cue row |

The group context pill bar at the top of the Cues section filters the cue list to a specific group. Clicking **All** shows all cues across all groups. The canvas reflects the selected group context even while browsing cues.

The currently active cue is highlighted in amber. Moving any DMX slider while not in Edit Mode clears the active cue highlight.

**Sequences**

Sequences chain cues together for automated playback with configurable transitions and hold durations. Each sequence belongs to a group (or is ungrouped), and sequences in different groups play simultaneously on independent engines.

| Action | How |
|--------|-----|
| Create sequence | Click **+** next to the Sequences header |
| Add cue to sequence | Open the sequence, click **+ Add Cue**, pick from the list (filtered to the sequence's group) |
| Set transition time | Click the transition field on a cue placement row (seconds) |
| Set hold duration | Click the hold field on a cue placement row (seconds; `0` = advance immediately) |
| Reorder cues in sequence | Drag the handle on each placement row |
| Remove cue from sequence | Click the × on a placement row |
| Play sequence | Click **▶** on the sequence header |
| Pause / Resume | Click **⏸** or **▶** while playing |
| Stop | Click **⏹** |
| Toggle loop | Click the loop icon — loops indefinitely when enabled |
| Fade out | Click the sunset icon — fades dimmer/intensity channels to zero then stops; duration set by the **Fade Out** control at the top of the section |
| Rename sequence | Click the pencil icon on the sequence header |
| Reorder sequences | Drag the sequence header row |
| Delete sequence | Click the trash icon (requires confirmation if sequence has cues) |

The group context pill bar at the top filters visible sequences to one group while still showing green pulse dots on all pills that have an active engine running. Clicking **All** shows every sequence across all groups. Because each group has an independent playback engine, you can play sequences from multiple groups at the same time — they do not interrupt each other.

A green pulse dot appears on the Sequences tab header when any group engine is active.

#### DMX Adjust Modal

Select one or more fixtures on the canvas, then click **Adjust DMX** (toolbar or context menu) to open the channel slider panel. Each channel from the fixture's channel map is shown as a labeled slider (`0–255`). Changes are sent to the linked entity in real time.

Multi-selected fixtures of the same OFL model and universe can be adjusted simultaneously.

#### Add / Edit Fixture Modal

When adding a fixture you can:
1. Pick a manufacturer from the **Open Fixture Library** dropdown
2. Pick the fixture model — the channel map is auto-populated from the OFL database
3. Select the fixture mode if the model supports multiple channel modes
4. Choose the Art-Net node, universe, and start channel
5. Optionally link to an existing Maestra entity (or let the system auto-create one)

Editing an existing fixture uses the same form. Deleting a fixture optionally deletes its linked entity as well.

#### Art-Net Node Setup

When no nodes exist, the page shows a first-run setup form. Once configured, nodes are managed via the sidebar edit icon or the **+ Add Node** button.

Node configuration includes:
- IP address and Art-Net port (default `6454`)
- Manufacturer and model (informational)
- Universe list: each universe gets a numeric Art-Net universe number, a label, and an optional color
- PoE status and firmware version (informational)

Adding a node automatically creates a linked Maestra **Device** for it, which appears in the Devices page and can be monitored for connectivity.

---

## DMX Lighting Entity

Maestra automatically creates a singleton entity called **DMX Lighting** (`slug: dmx-lighting`, type: `dmx_controller`). This entity:

- **Reflects the full catalog** — groups, cues (with group membership), and sequences (with group membership) are all exposed in the entity state
- **Enables external triggering** — any SDK, OSC message, MQTT topic, or NATS subject can start/stop playback by patching the entity state
- **Supports simultaneous multi-group control** — each group has an independent playback engine; the `group_playback` field lets you address them independently
- **Updates in real time** — the entity state is synced on every group/cue/sequence create, rename, reorder, or delete

### Entity state shape

```json
{
  "groups": [
    { "id": "uuid", "name": "Center Grid", "color": "#ef4444" }
  ],
  "cues": [
    { "id": "uuid", "name": "Warm Stage", "fade_duration": 2.5, "group_id": "uuid-or-null" }
  ],
  "sequences": [
    { "id": "uuid", "name": "Opening Show", "cue_count": 4, "fade_out_duration": 3.0, "group_id": "uuid-or-null" }
  ],
  "active_cue_id": "uuid-or-null",
  "active_sequence_id": "uuid-or-null-or-control-object",
  "group_playback": {
    "<group-uuid>": {
      "active_sequence_id": "uuid-or-null-or-control-object",
      "active_cue_id": "uuid-or-null"
    }
  }
}
```

### Sequence playback options

`active_sequence_id` (both at the top level and inside each `group_playback` entry) accepts either a plain string UUID **or** a control object with additional playback parameters:

**Plain string** — play once, hold last DMX values when the final cue completes:
```json
"active_sequence_id": "<sequence-uuid>"
```

**Control object** — specify loop or fade-out behavior:
```json
"active_sequence_id": {
  "id": "<sequence-uuid>",
  "loop": true
}
```

```json
"active_sequence_id": {
  "id": "<sequence-uuid>",
  "fadeout": 3.0
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | required | UUID of the sequence to play |
| `loop` | boolean | `false` | Repeat indefinitely once the last cue completes |
| `fadeout` | number | omit | After the final cue, fade all dimmer/intensity channels to zero over this many seconds, then stop |

**Behavior summary:**

| `loop` | `fadeout` | On completion |
|--------|-----------|---------------|
| `false` | omitted | Last DMX values remain in place |
| `true` | omitted | Sequence restarts from the first cue |
| `false` | `N` seconds | Dimmer channels fade to zero over N seconds, then playback stops |

> `loop` and `fadeout` are mutually exclusive — if `loop: true` is set, `fadeout` is ignored because the sequence never completes.

Set `active_sequence_id` to `null` to stop playback at any time regardless of which form was used to start it.

### Ungrouped (legacy) control

Set `active_cue_id` to recall a cue on the ungrouped engine, or `active_sequence_id` to play a sequence. Set either to `null` to clear/stop. This is backward-compatible with any integration built before Groups were introduced.

```bash
# Recall a cue
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"active_cue_id": "<cue-uuid>"}}'

# Play a sequence (plain UUID — holds last values on completion)
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"active_sequence_id": "<sequence-uuid>"}}'

# Play a sequence that loops
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"active_sequence_id": {"id": "<sequence-uuid>", "loop": true}}}'

# Play a sequence that fades out over 4 seconds when it ends
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"active_sequence_id": {"id": "<sequence-uuid>", "fadeout": 4.0}}}'

# Stop ungrouped playback
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"active_sequence_id": null, "active_cue_id": null}}'
```

### Per-group control

Use the `group_playback` field to address any group engine independently. Multiple groups can be started or stopped in a single state update. The same plain-string or control-object format applies inside each group entry:

```bash
# Play different sequences on two groups simultaneously (both looping)
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "group_playback": {
        "<group-a-uuid>": { "active_sequence_id": {"id": "<seq-uuid-A>", "loop": true} },
        "<group-b-uuid>": { "active_sequence_id": {"id": "<seq-uuid-B>", "fadeout": 2.5} }
      }
    }
  }'

# Play one group with a plain UUID, another with loop
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "group_playback": {
        "<group-a-uuid>": { "active_sequence_id": "<seq-uuid-A>" },
        "<group-b-uuid>": { "active_sequence_id": {"id": "<seq-uuid-B>", "loop": true} }
      }
    }
  }'

# Stop one group while leaving the other running
curl -X PATCH http://localhost:8080/entities/dmx-lighting/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "group_playback": {
        "<group-a-uuid>": { "active_sequence_id": null, "active_cue_id": null }
      }
    }
  }'
```

The same control is available via any Maestra gateway:

- **OSC:** `/entity/update/dmx-lighting/group_playback` with a JSON object value
- **MQTT:** publish to `maestra/entity/state/update/dmx-lighting`
- **NATS:** publish to `maestra.entity.state.update.dmx-lighting`

The `group_playback` field in the entity state is hydrated from the live engine registry on every catalog sync, so external tools can read it to know what is currently playing on each group engine.

The Dashboard subscribes to `maestra.entity.state.dmx_controller.dmx-lighting` via WebSocket and updates cue/sequence highlights and group activity indicators in real time when triggered externally.

---

## NATS Topics

| Subject | Direction | Description |
|---------|-----------|-------------|
| `maestra.entity.state.>` | Inbound | Entity state changes (normal mode) |
| `maestra.to_artnet.universe.{n}` | Inbound | Raw 512-channel universe array (bypass mode) |
| `maestra.dmx.control` | Inbound | Internal pause/resume signals from Fleet Manager |
| `maestra.dmx.fixture.{path}` | Outbound | Resolved DMX channel values per fixture (debug) |
| `maestra.entity.state.dmx_controller.dmx-lighting` | Outbound | Cue/sequence catalog + active state |

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

---

## REST API Reference

All DMX configuration is managed via the Fleet Manager API. Full interactive docs at `http://localhost:8080/docs`.

### Groups (`/dmx/groups`)

Groups organize fixtures, cues, and sequences into independent playback layers. Each group runs its own playback engine, allowing simultaneous sequence playback across groups.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/groups` | List all groups ordered by sort_order |
| `POST` | `/dmx/groups` | Create a new group (`{"name": "Stage Left", "color": "#ef4444"}`) |
| `GET` | `/dmx/groups/{id}` | Get a group with fixture/cue/sequence counts |
| `PATCH` | `/dmx/groups/{id}` | Update name, color, or sort_order |
| `DELETE` | `/dmx/groups/{id}` | Delete a group (fixtures/cues/sequences are unlinked, not deleted) |
| `PUT` | `/dmx/groups/{id}/fixtures` | Bulk assign fixtures to this group (body: `["fixture-id", ...]`; empty list unassigns all) |

### Art-Net Nodes (`/dmx/nodes`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/nodes` | List all configured Art-Net nodes |
| `PUT` | `/dmx/nodes/reorder` | Reorder nodes (body: `["id1","id2",...]`) |
| `POST` | `/dmx/nodes` | Register a new Art-Net node |
| `GET` | `/dmx/nodes/{id}` | Get a single node |
| `PUT` | `/dmx/nodes/{id}` | Update node configuration |
| `DELETE` | `/dmx/nodes/{id}` | Remove a node (fails if fixtures are assigned) |

### DMX Fixtures (`/dmx/fixtures`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/fixtures` | List all fixtures (optional `?node_id=`, `?entity_id=` filter) |
| `POST` | `/dmx/fixtures` | Create a new fixture |
| `PUT` | `/dmx/fixtures/reorder` | Reorder fixtures (body: `["id1","id2",...]`) |
| `GET` | `/dmx/fixtures/{id}` | Get a single fixture |
| `PUT` | `/dmx/fixtures/{id}` | Update fixture config, position, or channel map |
| `DELETE` | `/dmx/fixtures/{id}` | Remove a fixture |
| `PUT` | `/dmx/fixtures/positions/bulk` | Bulk update canvas positions |
| `GET` | `/dmx/entities/{entity_id}/fixture` | Look up the fixture linked to an entity |

### Output Control (`/dmx/pause`, `/dmx/resume`, `/dmx/clear`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/pause-state` | Returns `{"paused": bool}` |
| `POST` | `/dmx/pause` | Pause all external entity-driven DMX output |
| `POST` | `/dmx/resume` | Resume normal DMX output |
| `POST` | `/dmx/clear` | Zero all DMX channels (only while paused) |

### Cues (`/dmx/cues`)

Cues are named snapshots of all linked fixture states. Each cue optionally belongs to a group.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/cues` | List all cues ordered by sort_order |
| `POST` | `/dmx/cues` | Save current entity states as a new cue (`{"name": "My Cue", "group_id": "uuid-or-omit"}`) |
| `PUT` | `/dmx/cues/reorder` | Reorder cues (body: `["id1","id2",...]`) |
| `POST` | `/dmx/cues/{id}/recall` | Instantly restore all fixture states from this cue |
| `POST` | `/dmx/cues/{id}/snapshot` | Replace cue fixture data with current entity states (Edit Mode save) |
| `PUT` | `/dmx/cues/{id}` | Rename a cue (`{"name": "New Name"}`) |
| `DELETE` | `/dmx/cues/{id}` | Delete a cue (also removes it from all sequences) |
| `GET` | `/dmx/cues/{id}/fixtures` | List fixture snapshots stored in a cue |

### Sequences (`/dmx/sequences`)

Sequences chain cues with configurable transitions and hold durations. Each sequence optionally belongs to a group — sequences in different groups run on independent engines and play simultaneously.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/sequences` | List all sequences with their cue placements |
| `POST` | `/dmx/sequences` | Create a new empty sequence (`{"name": "My Sequence", "group_id": "uuid-or-omit"}`) |
| `PUT` | `/dmx/sequences/reorder` | Reorder sequences (body: `["id1","id2",...]`) |
| `PUT` | `/dmx/sequences/{id}` | Rename a sequence |
| `DELETE` | `/dmx/sequences/{id}` | Delete a sequence |
| `POST` | `/dmx/sequences/{id}/cues` | Add a cue to a sequence (`{"cue_id": "uuid"}`) |
| `PUT` | `/dmx/sequences/{id}/cues/reorder` | Reorder cue placements (body: `["placement_id1",...]`) |
| `PUT` | `/dmx/sequences/{id}/cues/{placement_id}` | Update transition/hold timing |
| `DELETE` | `/dmx/sequences/{id}/cues/{placement_id}` | Remove a cue from a sequence |

**Cue placement update body:**
```json
{
  "transition_time": 2.5,
  "hold_duration": 5.0
}
```

### Playback Engine (`/dmx/playback`)

The backend playback engine runs sequence playback at 80ms intervals, interpolating fixture states between cues and broadcasting entity state changes via NATS.

All playback endpoints accept an optional `?group_id=<uuid>` query parameter to target a specific group's engine. Omitting `group_id` targets the ungrouped (legacy) engine. Pass `?group_id=all` to `GET /dmx/playback/status` to retrieve statuses for all active engines in one request.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dmx/playback/status` | Get ungrouped engine state (add `?group_id=<uuid>` for a specific group, `?group_id=all` for all) |
| `POST` | `/dmx/playback/play` | Start sequence playback (`?group_id=<uuid>` to target a group engine) |
| `POST` | `/dmx/playback/pause` | Pause playback |
| `POST` | `/dmx/playback/resume` | Resume paused playback |
| `POST` | `/dmx/playback/stop` | Stop playback |
| `POST` | `/dmx/playback/toggle-loop` | Toggle loop mode, returns `{"loop": bool}` |
| `POST` | `/dmx/playback/fadeout` | Fade dimmer channels to zero then stop |
| `POST` | `/dmx/playback/cue-fade` | Cross-fade from one cue snapshot to another |
| `POST` | `/dmx/playback/blackout` | Zero all DMX channels immediately across all universes |

**Play request:**
```json
{ "sequence_id": "uuid" }
```

Optional playback parameters can be included to control loop and fade-out behavior:

```json
{ "sequence_id": "uuid", "loop": true }
```

```json
{ "sequence_id": "uuid", "fadeout_ms": 3000.0 }
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sequence_id` | string | required | UUID of the sequence to play |
| `loop` | boolean | `false` | Repeat indefinitely after the final cue |
| `fadeout_ms` | number | `null` | After the final cue, fade dimmer channels to zero over this many milliseconds, then stop |

**Single-engine status response (`GET /dmx/playback/status`):**
```json
{
  "group_id": "uuid-or-null",
  "sequence_id": "uuid-or-null",
  "play_state": "stopped | playing | paused",
  "phase": "idle | transitioning | holding",
  "cue_index": 2,
  "progress": 0.65,
  "hold_progress": 0.3,
  "loop": false,
  "fade_progress": null
}
```

**All-engines status response (`GET /dmx/playback/status?group_id=all`):**
```json
{
  "engines": [
    { "group_id": null, "sequence_id": null, "play_state": "stopped", ... },
    { "group_id": "abc-uuid", "sequence_id": "seq-uuid", "play_state": "playing", ... }
  ]
}
```

**Fade out request:**
```json
{ "duration_ms": 3000.0 }
```

**Cue fade request:**
```json
{
  "from_cue_id": "uuid-or-null",
  "to_cue_id": "uuid",
  "duration_ms": 2500.0
}
```

`from_cue_id` defaults to the current live entity states when omitted.

### Open Fixture Library (`/ofl`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ofl/manufacturers` | List all synced manufacturers |
| `GET` | `/ofl/fixtures` | List fixtures (query params: `?manufacturer_key=`, `?search=`) |
| `GET` | `/ofl/fixtures/by-id/{fixture_id}` | Get a fixture by internal ID |
| `GET` | `/ofl/fixtures/{manufacturer_key}/{fixture_key}` | Get a fixture by OFL path |
| `GET` | `/ofl/sync/status` | Show last sync time and fixture count |

To sync the OFL catalog locally:

```bash
make sync-ofl
```

---

## Open Fixture Library Integration

Maestra ships the [Open Fixture Library](https://open-fixture-library.org/) as a git submodule and syncs it into the `ofl_manufacturers` and `ofl_fixtures` tables. When you add a fixture in the Dashboard, you can search manufacturers and models; the channel map is auto-generated from the OFL fixture definition and the selected mode.

The OFL catalog is **never synced automatically** — run `make sync-ofl` manually to pull the latest fixture definitions. Check sync status with `make ofl-status` or `GET /ofl/sync/status`.

---

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

Fixtures linked to entities via the entity linker are **locked to DMX-only control** — their entity variables can only be updated via the DMX gateway or playback engine, preventing conflicting state sources.

---

## Make Targets

| Command | Description |
|---------|-------------|
| `make up-dmx` | Start full stack including DMX gateway |
| `make dev-dmx` | Start core services + DMX gateway |
| `make logs-dmx` | Tail DMX gateway logs |
| `make build-dmx` | Rebuild the DMX gateway image |
| `make test-dmx` | Publish a test entity state via NATS |
| `make sync-ofl` | Sync the Open Fixture Library into the database |
| `make update-ip` | Detect current LAN IP and update `HOST_IP` in `.env`, then restart dashboard |

---

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

---

## Send Strategy

- **On-change:** A full 512-channel universe packet is sent immediately whenever any channel in that universe changes.
- **Keep-alive:** All universes are resent at 4 Hz (configurable via `KEEPALIVE_HZ`) regardless of changes. This prevents the Art-Net node from timing out and turning fixtures off.
- **Config refresh:** The gateway reloads its node/fixture configuration from the Fleet Manager API every 30 seconds (configurable via `CONFIG_REFRESH_INTERVAL`), picking up any changes made via the Dashboard.

---

## NATS Reconnection

The keep-alive loop runs independently of the NATS connection. If NATS disconnects, the gateway continues sending its last known universe state to the Art-Net node so fixtures hold their current values.

---

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

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLEET_MANAGER_URL` | `http://fleet-manager:8080` | Fleet Manager API base URL |
| `NATS_URL` | `nats://nats:4222` | NATS connection |
| `LOG_LEVEL` | `INFO` | Log verbosity |
| `CONFIG_REFRESH_INTERVAL` | `30` | Seconds between config reloads |
| `KEEPALIVE_HZ` | `4` | Universe resend rate |

---

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

**Cue recall has no visible effect:**

1. Verify fixtures are linked to entities (`entity_id` is set)
2. Verify the channel map has entries — an empty channel map produces no state change
3. Check `GET /dmx/cues/{id}/fixtures` to see what was snapshotted when the cue was saved

**Playback engine stops advancing cues:**

1. Check `GET /dmx/playback/status` — if `phase` is `holding` and `hold_progress` is not advancing, the hold duration may be very long or zero
2. A `hold_duration` of `0` means the cue holds indefinitely; set a positive value or stop and replay

**Wrong channels firing:**

1. Verify `start_channel` and channel `offset` values against the fixture manual
2. Check the fixture's DMX mode matches the channel map (e.g. `15ch` mode, not `8ch`)

**Art-Net node using zero-based universe numbering:**

In the Dashboard → DMX Lighting → Art-Net Node setup, set the universe's `Art-Net Universe` field to `0` for the first universe. The gateway uses the `artnet_universe` value from the database directly.
