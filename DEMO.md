# Demoing Maestra

A ~7-minute walkthrough that shows Maestra's full value with **zero physical hardware**. Everything below runs on one laptop.

## Setup (before the demo)

```bash
make init   # first time only
make demo
```

`make demo` starts the full stack with `DEMO_MODE=true`, runs database migrations, and seeds:

- 3 demo devices (projector, sensor hub, stage controller) with 24h of metric history
- A venue entity hierarchy (venue → lobby / gallery / stage)
- A complete virtual DMX rig: 1 Art-Net node, 8 fixtures (4 RGB washes, 2 moving spots, 2 house dimmers), a "Demo Stage" group, 4 cues, and an "Evening Loop" sequence — **which starts looping automatically**
- A live simulator publishing device metrics, events, and entity state to the real message bus

Open http://localhost:3001 and you're ready. No Art-Net hardware is required — DMX playback runs server-side and every fade is visible in the UI.

## The walkthrough

### 1. Dashboard home (30s) — "everything in one place"

Devices online, entity tree, live activity feed scrolling on the right. Point out that this traffic is flowing through the same NATS/MQTT bus a real installation uses — nothing here is mocked in the browser.

### 2. DMX Lighting (2 min) — the money shot

The canvas is already alive: fixtures glowing and crossfading through cues, moving spots sweeping.

- Fixtures render their **live color and intensity** from entity state; the loop runs the Warm Welcome → Deep Blue → Sunset Chase sequence
- Click **Pause** / **Blackout** in the toolbar for instant global control
- Double-click a moving spot → **Adjust** → toggle the **Pan/Tilt joystick** and drag; the beam offset follows on the canvas in real time
- Show the sidebar: nodes, fixtures, groups, cues, sequences — a full lighting console, configured entirely in the browser

Key line: *"Every fixture here is an entity on the bus. Anything that can publish a message — a sensor, TouchDesigner, a phone — can drive these lights."*

### 3. Console → Ambient (1.5 min) — "the nervous system"

Switch Console to **Ambient** mode (fullscreen icon for effect). The bus is the center; gateways (OSC / MQTT / WebSocket / DMX) orbit it; every entity and device drifts in the outer ring. Particles are real messages — the amber stream is the DMX playback you just watched. Active nodes pull inward; idle ones drift out.

This view doubles as an installation piece — venues run it on a spare display.

### 4. Prove the openness (1.5 min) — any protocol in, any protocol out

In a terminal:

```bash
make test-mqtt-state SLUG=stage-wash-1
```

An MQTT message — the same thing an ESP32 would send — updates a light's entity state. The same works from OSC (`/entity/update/stage-wash-1/dimmer 0.5` from TouchDesigner/Max) and from the WebSocket SDK in a browser. One state model, every protocol.

### 5. Show Control (1 min) — "run the venue, not the devices"

Open Show Control: the venue lifecycle state machine (idle → pre-show → active → post-show), scheduled transitions, and side effects (e.g. shutdown triggers DMX blackout). This is the operator's view — one button starts the whole space.

### 6. Close (30s)

- 9 SDKs: Python, JS/TS, Unity, Unreal, TouchDesigner, Arduino, Processing, OpenFrameworks, Max/MSP
- Desktop app: one-click stack for non-technical operators
- Grafana + TimescaleDB observability included

## Resetting between demos

```bash
make restart          # keeps all data, restarts the loop
```

or for a fully fresh slate:

```bash
make clean-all && make demo
```

## Troubleshooting

- **Fixtures not animating?** Check the sequence transport (DMX page → Sequences tab). Restarting Fleet Manager (`docker compose restart fleet-manager`) re-arms the demo loop.
- **No live activity?** `DEMO_MODE` must be true — `make demo` sets it; plain `make up` does not.
- **Demo data missing?** `make migrate` seeds the DMX rig; `make seed-demo` re-seeds devices/entities/metrics.
