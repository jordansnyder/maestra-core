# Maestra

**Infrastructure for immersive experiences.**

Connect any device to a shared creative nervous system. Control lights from a sensor. Stream live data between tools. Build experiences that span physical and digital worlds.

Maestra is a Docker-based platform that links your creative tools -- TouchDesigner, Max/MSP, Unreal Engine, Unity, Arduino, web apps -- through a central message bus. Every device can publish events, subscribe to state changes, stream data peer-to-peer, and be orchestrated together in real time.

## Quick Start

```bash
git clone https://github.com/maestra/maestra-core.git
cd maestra-core
make init       # Set up environment
make up         # Start all services
# Open http://localhost:3001 for the Dashboard
```

> **Prerequisites:** Docker Desktop (4.0+) and Git. See the [Installation Guide](docs/docs/getting-started/installation.md) for details.

## Architecture

```
+-----------------------------------------------------------------+
|  YOUR TOOLS: TouchDesigner | Max/MSP | Unreal | Unity | Web     |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  GATEWAYS: OSC | WebSocket | MQTT | DMX/Art-Net (opt-in)       |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  MESSAGE BUS: NATS (Pub/Sub) | Redis (State + Cache)            |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  SERVICES: Fleet Manager | Node-RED | Dashboard | Grafana       |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  STORAGE: PostgreSQL (TimescaleDB)                              |
+-----------------------------------------------------------------+
```

Your creative tools connect through gateways that translate their native protocols (OSC, MQTT, WebSocket) into a common message bus. Services manage device registration, state, visual programming, and monitoring. Everything persists to a time-series database for history and analytics.

## Choose Your Tool

| Your Tool | SDK | Install |
|---|---|---|
| TouchDesigner | Python | `pip install maestra[all]` |
| Max/MSP | Max/MSP abstractions | Copy from `sdks/maxmsp/` |
| Unity | Unity C# package | Add via Package Manager |
| Unreal Engine | C++ Plugin | Copy `MaestraPlugin` to `Plugins/` |
| Arduino / ESP32 | Arduino (MQTT) | PlatformIO `lib_deps` |
| Web / React / Node.js | JavaScript | `npm install @maestra/sdk` |
| Python scripting | Python | `pip install maestra[all]` |

Not sure which SDK to use? See the [Choose Your SDK](docs/docs/guides/choose-your-sdk.md) guide.

## Key Features

- **Device Management** -- Register any device, track its status, push configuration updates, and manage fleets of hardware from a single dashboard.
- **Entity State System** -- Define logical things in your experience (rooms, lights, sensors) with typed state that any connected device can read and write in real time.
- **Peer-to-Peer Streaming** -- Advertise and discover live data streams (sensor feeds, audio, video, NDI, texture) with control-plane negotiation and direct P2P data delivery.
- **Signal Routing** -- Patch inputs and outputs between devices like a virtual signal flow -- connect a sensor's output to a light's input without writing code.
- **Visual Programming** -- Use Node-RED's flow-based editor to build automation, orchestration, and show control logic with drag-and-drop nodes.
- **DMX / Art-Net Gateway** -- Control physical DMX lighting fixtures from any Maestra client via Art-Net. A venue patch map (YAML) translates entity state variables to DMX channel values. Opt-in Docker Compose profile, no code changes required between venues.
- **Monitoring** -- Eight pre-built Grafana dashboards give you real-time visibility into device health, message throughput, entity state history, and system performance.

## Services

Once running, these services are available on your local machine:

| Service | URL | Purpose |
|---|---|---|
| Dashboard | [localhost:3001](http://localhost:3001) | Web interface for device and entity management |
| Fleet Manager API | [localhost:8080/docs](http://localhost:8080/docs) | REST API with interactive Swagger docs |
| Node-RED | [localhost:1880](http://localhost:1880) | Visual flow-based programming |
| Grafana | [localhost:3000](http://localhost:3000) | Monitoring dashboards (admin / admin) |
| NATS Monitor | [localhost:8222](http://localhost:8222) | Message bus health |
| Documentation | [localhost:8000](http://localhost:8000) | Full platform documentation |

## Common Commands

```bash
make up              # Start all services
make down            # Stop all services
make dev-core        # Start core services only (lighter weight)
make logs            # View live logs
make health          # Check all service health
make ps              # Show service status
make test-mqtt       # Publish a test MQTT message

# DMX / Art-Net (requires DMX hardware)
make up-dmx          # Start full stack + DMX gateway
make bootstrap-venue # Create venue entities from config/dmx/patch.yaml
make test-dmx        # Send test state to a fixture
make logs-dmx        # View DMX gateway logs
```

## Documentation

Full documentation is served at [localhost:8000](http://localhost:8000) when the stack is running.

To get started quickly, see [QUICKSTART.md](QUICKSTART.md).

Key sections:

- [Installation](docs/docs/getting-started/installation.md) -- Prerequisites, setup, and troubleshooting
- [Architecture](docs/docs/getting-started/architecture.md) -- How the system fits together
- [Choose Your SDK](docs/docs/guides/choose-your-sdk.md) -- Find the right SDK for your tool
- [API Reference](docs/docs/api/) -- Fleet Manager, Entities, Streams, WebSocket, OSC
- [Guides](docs/docs/guides/) -- Device registration, MQTT, Streams, Node-RED, monitoring

## Roadmap

- Plugin ecosystem for custom high-performance modules in Python, Rust, or C++
- iOS and Android SDKs
- Secure cloud synchronization for multi-location, multi-device collaboration
- Support for n8n and ActionForge
- Fleet environment variable and OS image support (OTA upgrades)
- AI asynchronous workers for piping data and events to AI services

## License

MIT
