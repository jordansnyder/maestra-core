# Maestra Documentation

Welcome to the **Maestra** documentation - your guide to building immersive experiences with connected devices, visual programming, and real-time communication.

## What is Maestra?

Maestra is a comprehensive infrastructure platform that connects devices, enables event pub/sub, peer-to-peer networking, and integrates with show control systems. It's designed for creative professionals building multi-device, multi-location, multi-platform immersive experiences.

## Key Features

### 🎯 **Device & Fleet Management**
Manage hundreds of connected devices (Arduino, ESP32, Raspberry Pi, TouchDesigner, Max/MSP, etc.) from a central dashboard.

### 📡 **Message Bus Infrastructure**
Multiple messaging protocols:
- **MQTT** - For IoT devices
- **NATS** - High-performance service communication
- **OSC** - Creative tools integration
- **WebSocket** - Browser and mobile apps

### 🎨 **Visual Programming**
Node-RED integration for no-code experience design and automation.

### 📊 **Real-time Monitoring**
Grafana dashboards, device telemetry, and event tracking with TimescaleDB.

### 🐳 **Cloud-Ready**
Complete Docker infrastructure for local development and cloud deployment.

## Quick Start

Get up and running in 5 minutes:

```bash
# Clone the repository
git clone <repo-url>
cd maestra-core

# Initialize environment
make init

# Start all services
make up

# Access the dashboard
open http://localhost:3001
```

See the [Quick Start Guide](getting-started/quickstart.md) for detailed instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  TouchDesigner │ Max/MSP │ Unreal │ Arduino │ Web │ Mobile  │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GATEWAY LAYER                            │
│    OSC Gateway  │  WebSocket Gateway  │  MQTT (Mosquitto)  │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  MESSAGE BUS LAYER                          │
│         NATS (Pub/Sub) │ Redis (Cache/State)               │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                             │
│  Fleet Manager │ Node-RED Logic │ Dashboard │ Grafana       │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PERSISTENCE LAYER                         │
│             PostgreSQL (TimescaleDB)                        │
└─────────────────────────────────────────────────────────────┘
```

See the [Architecture Guide](getting-started/architecture.md) for more details.

## SDK Support

Maestra provides SDKs and integration guides for:

- **IoT Devices**: [Arduino/ESP32](sdks/arduino.md), [Raspberry Pi](sdks/raspberry-pi.md)
- **Creative Tools**: [TouchDesigner](sdks/touchdesigner.md), [Max/MSP](sdks/max-msp.md), [Unreal Engine](sdks/unreal.md)
- **Web & Mobile**: [JavaScript/WebSocket](sdks/web.md)

## Services

### Dashboard (Port 3001)
Web-based control panel for device management, monitoring, and configuration.

### Fleet Manager API (Port 8080)
REST API for device registration, metrics, and events.
[API Documentation](http://localhost:8080/docs)

### Node-RED (Port 1880)
Visual flow-based programming for experience logic.

### Grafana (Port 3000)
Real-time monitoring and analytics dashboards.

### MQTT Broker (Port 1883)
Message broker for IoT device communication.

## Use Cases

### Interactive Installations
Connect sensors, lights, and displays to create responsive environments.

### Multi-Location Experiences
Synchronize experiences across multiple physical locations.

### Show Control
Orchestrate complex multimedia performances with precise timing.

### IoT Fleet Management
Monitor and control hundreds of connected devices in real-time.

## Next Steps

1. [Install Maestra](getting-started/installation.md)
2. [Register your first device](guides/device-registration.md)
3. [Create a Node-RED flow](guides/nodered.md)
4. [Integrate with your creative tools](sdks/overview.md)

## Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/jordansnyder/maestra-core/issues)
- **Documentation**: You're reading it!
- **API Reference**: [Fleet Manager API](api/fleet-manager.md)

---

**Let's build something amazing together.** 🚀
