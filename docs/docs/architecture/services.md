# Services

## Service Map

| Service | Port | Description |
|---------|------|-------------|
| Fleet Manager | 8080 | REST API |
| Dashboard | 3001 | Web UI |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| NATS | 4222 | Message bus |
| Mosquitto | 1883 | MQTT broker |
| Node-RED | 1880 | Automation |
| Grafana | 3000 | Monitoring |
| OSC Gateway | 57120/57121 UDP | OSC ↔ NATS bridge |
| WebSocket Gateway | 8765 | WebSocket ↔ NATS bridge |
| MQTT-NATS Bridge | internal | MQTT ↔ NATS bridge |
| DMX Gateway *(opt-in)* | — | Art-Net UDP → DMX fixtures |

## Gateway Services

### OSC Gateway (port 57120/57121 UDP)

Bridges OSC messages to NATS and back. Used by TouchDesigner, Max/MSP, SuperCollider, and any OSC-capable tool.

- Inbound: OSC `/device/sensor/temp` → NATS `maestra.osc.device.sensor.temp`
- Outbound: NATS `maestra.to_osc.*` → OSC UDP

### WebSocket Gateway (port 8765)

Allows browser clients and web apps to publish and subscribe to NATS subjects directly over WebSocket.

### MQTT-NATS Bridge (internal)

Bidirectional routing between the Mosquitto MQTT broker and NATS. Used by Arduino, ESP32, and all embedded devices.

- Inbound: MQTT `maestra/#` → NATS `maestra.mqtt.*`
- Outbound: NATS `maestra.to_mqtt.*` → MQTT

### DMX Gateway (opt-in, no fixed port)

Bridges Maestra entity state changes to physical DMX lighting fixtures via the Art-Net protocol over UDP. Not started by default — enable with `make up-dmx` or `make dev-dmx`.

- Subscribes to `maestra.entity.state.>` on NATS
- Translates entity variable values to DMX channel bytes using the database patch map (nodes + fixtures configured via Dashboard → DMX Lighting)
- Sends Art-Net ArtDMX UDP packets to configured node IPs on port 6454
- Supports bypass mode via `maestra.to_artnet.universe.{n}` for raw 512-channel arrays
- Keep-alive at 4 Hz prevents the Art-Net node from timing out
- Reloads fixture config from Fleet Manager every 30 seconds (no restart required)

**DMX Lighting features (managed via Dashboard):**

- **Fixtures**: place fixtures on a spatial canvas, link to Maestra entities, auto-populate channel maps from the Open Fixture Library
- **Cues**: snapshot current fixture states as named cues; recall instantly or with a configurable cross-fade
- **Sequences**: chain cues with per-step transition time and hold duration, play/pause/stop/loop via the sidebar or REST API
- **Playback Engine**: backend asyncio engine running at 80ms intervals — interpolates fixture states between cues and broadcasts entity state changes so external tools see playback in real time
- **DMX Lighting Entity**: a singleton `dmx_controller` entity (`slug: dmx-lighting`) that reflects the cue/sequence catalog and active IDs; any client can trigger playback by patching this entity's state

See the [DMX Gateway Guide](../guides/dmx-gateway.md) for full configuration, UI reference, and API documentation.
