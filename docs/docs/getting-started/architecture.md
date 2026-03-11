# Architecture

Maestra connects your creative tools and devices through a shared message bus, giving every piece of your experience a common language. Any device that can speak MQTT, OSC, or WebSocket can publish state, subscribe to changes, and stream data to any other device -- in real time.

## System Overview

```
+-----------------------------------------------------------------+
|  YOUR TOOLS                                                     |
|  TouchDesigner | Max/MSP | Unreal | Unity | Arduino | Web      |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  GATEWAYS                                                       |
|  OSC Gateway (UDP 57120)                                        |
|  WebSocket Gateway (WS 8765)                                    |
|  MQTT Broker (TCP 1883 / WS 9001)                               |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  MESSAGE BUS                                                    |
|  NATS: Pub/Sub messaging + JetStream                            |
|  Redis: Real-time state cache                                   |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  SERVICES                                                       |
|  Fleet Manager (API) | Node-RED | Dashboard | Grafana           |
+-----------------------------------------------------------------+
                              |
+-----------------------------------------------------------------+
|  STORAGE                                                        |
|  PostgreSQL with TimescaleDB (time-series data)                 |
+-----------------------------------------------------------------+
```

### How it works

**Client Layer** -- Your creative applications and hardware. Each one connects through whichever protocol it naturally speaks: TouchDesigner and Max/MSP use OSC, Arduino and ESP32 use MQTT, web browsers use WebSocket, and Python or JavaScript apps can use any of the above.

**Gateway Layer** -- Protocol translators. The OSC Gateway converts OSC messages to NATS subjects. The MQTT-NATS Bridge routes MQTT topics to NATS and back. The WebSocket Gateway lets browser clients publish and subscribe directly. Your tools never need to know about each other's protocols.

**Message Bus** -- The nervous system. NATS handles all pub/sub messaging with nanosecond routing. Redis stores the current state of every entity so new connections immediately get the latest values. Together they ensure every message reaches every subscriber with minimal latency.

**Service Layer** -- The brain. The Fleet Manager provides a REST API for device registration, entity management, stream coordination, and routing. Node-RED offers visual flow programming for automation and show control. The Dashboard gives you a web interface to see and control everything. Grafana provides deep monitoring.

**Storage Layer** -- The memory. PostgreSQL with the TimescaleDB extension stores device metrics, events, and entity state history as time-series data. Automatic compression and retention policies keep the database fast even with millions of data points.

## Core Concepts

### Devices

A **device** is anything that connects to Maestra -- an ESP32 reading a temperature sensor, a Raspberry Pi driving LEDs, a laptop running TouchDesigner, or a phone displaying a web interface.

Devices connect through one of three gateways depending on their protocol:

| Protocol | Gateway | Best for |
|---|---|---|
| MQTT | Mosquitto broker (port 1883) | Arduino, ESP32, Raspberry Pi, IoT hardware |
| OSC | OSC Gateway (port 57120) | TouchDesigner, Max/MSP, SuperCollider |
| WebSocket | WebSocket Gateway (port 8765) | Browsers, web apps, custom software |

When a device connects, it registers with the Fleet Manager, which tracks its status, health, and configuration. You can see all your devices in the Dashboard, group them logically, and push configuration updates.

### Entities

An **entity** is a logical thing in your experience -- a room, a light, a sensor zone, a speaker, a projection surface. Entities have **typed state** that any device can read and write.

For example, a light entity might have this state:

```json
{
  "brightness": 75,
  "color": "#ff3300",
  "on": true
}
```

An ESP32 can set the brightness. TouchDesigner can read the color. A web dashboard can toggle it on and off. Every change is broadcast to all subscribers instantly.

Entities are organized in a **hierarchy** using path notation:

```
building
  building.floor1
    building.floor1.roomA
      building.floor1.roomA.light1
      building.floor1.roomA.light2
    building.floor1.roomB
```

This lets you query all entities in a room, all lights on a floor, or the full ancestor chain of any entity. The hierarchy uses PostgreSQL's LTREE extension for fast tree queries.

Entities also support **typed variables** -- you can define input and output fields with types like `number`, `color`, `vector3`, `boolean`, `enum`, and more. This gives your entities a structured interface that other systems can discover and validate against.

### Streams

**Streams** enable high-bandwidth, peer-to-peer data transfer between devices. The control plane (discovery, negotiation, session management) runs through Maestra, while the actual data flows directly between devices.

Supported stream types include: `sensor`, `audio`, `video`, `ndi`, `texture`, `osc`, `midi`, `data`, `srt`, `spout`, and `syphon`.

The lifecycle of a stream:

1. **Advertise** -- A device tells Maestra it has a stream available (e.g., "I have a 1080p NDI video feed")
2. **Discover** -- Other devices browse available streams and find ones they want
3. **Request** -- A consumer asks to connect to a specific stream
4. **Negotiate** -- Maestra brokers a handshake between producer and consumer (NATS request-reply, 5-second timeout)
5. **Session** -- The devices exchange data directly, peer-to-peer
6. **Heartbeat** -- Both sides refresh their presence every 10 seconds
7. **Withdraw** -- The producer removes the stream when done

Stream metadata is stored in Redis with a 30-second TTL, so stale streams automatically disappear if a device goes offline.

### Routing

**Routing** lets you patch signals between device inputs and outputs -- like a virtual patch bay. Connect a sensor's output to a light's input, and the data flows automatically. No custom code required.

Routes are defined through the Fleet Manager API and can be created, updated, and deleted at any time. The Dashboard provides a visual interface for building and managing signal flows.

### Events

The **event bus** lets any device or service publish messages that any other device or service can subscribe to. Events flow through NATS, which supports wildcard subscriptions and subject hierarchies.

All messages follow a standard envelope format:

```json
{
  "timestamp": "2026-02-27T10:30:00Z",
  "source": "mqtt",
  "topic": "maestra/sensors/temperature",
  "data": {
    "value": 23.5,
    "unit": "celsius"
  }
}
```

Topic naming follows a consistent pattern:

- **NATS**: `maestra.<protocol>.<resource>.<action>` (e.g., `maestra.mqtt.devices.esp32.temperature`)
- **MQTT**: `maestra/<resource>/<action>` (e.g., `maestra/devices/esp32/temperature`)

The MQTT-NATS Bridge translates between formats automatically. Messages published on MQTT appear on NATS and vice versa.

## Message Flow Example

Here is a concrete example of how data moves through Maestra. Imagine an ESP32 with a temperature sensor that controls a light's color in a TouchDesigner installation.

**Step 1: ESP32 publishes a temperature reading over MQTT**

The Arduino sketch calls `maestra.updateState("temperature", 23.5)`, which publishes to the MQTT topic `maestra/entity/state/update/sensor-1`.

**Step 2: MQTT-NATS Bridge routes the message**

The bridge translates the MQTT topic to a NATS subject: `maestra.mqtt.maestra.entity.state.update.sensor-1`. The message is now available to all NATS subscribers.

**Step 3: Fleet Manager processes the state update**

The Fleet Manager receives the message, validates the new state, updates the entity in PostgreSQL, and updates the Redis cache with the current value.

**Step 4: State change event is broadcast**

The Fleet Manager publishes a state change event to NATS and MQTT. Any device subscribed to `sensor-1` state changes receives the update.

**Step 5: TouchDesigner receives the update**

TouchDesigner is subscribed to the sensor entity via OSC. The OSC Gateway translates the NATS message into an OSC message and sends it to TouchDesigner on port 57121. A parameter expression reads the temperature value and maps it to a color gradient.

**Step 6: Dashboard updates in real time**

The Dashboard, connected via WebSocket, also receives the state change and updates its display. Grafana logs the metric to the time-series database for historical charting.

The whole chain -- sensor reading to visual output -- happens in milliseconds.

## Service Reference

| Service | Port(s) | Purpose |
|---|---|---|
| Fleet Manager | 8080 | REST API for devices, entities, streams, routing |
| Dashboard | 3001 | Web interface for management and monitoring |
| Node-RED | 1880 | Visual flow-based programming and automation |
| Grafana | 3000 | Monitoring dashboards and alerting |
| NATS | 4222 (client), 8222 (monitor) | Primary message bus with JetStream |
| Mosquitto | 1883 (TCP), 9001 (WebSocket) | MQTT broker for IoT devices |
| Redis | 6379 | Real-time state cache and ephemeral data |
| PostgreSQL | 5432 | TimescaleDB for time-series storage |
| OSC Gateway | 57120 (in), 57121 (out) | OSC protocol bridge for creative tools |
| WebSocket Gateway | 8765 | WebSocket bridge for browser clients |
| Documentation | 8000 | MkDocs documentation server |

## Technology Stack

| Component | Technology | Why |
|---|---|---|
| API Server | FastAPI (Python) | Async-first, automatic OpenAPI docs, Pydantic validation |
| Web Dashboard | Next.js 14 (React 18) | Server-side rendering, real-time updates via Socket.IO |
| Message Bus | NATS with JetStream | Sub-millisecond pub/sub, request-reply, message persistence |
| MQTT Broker | Eclipse Mosquitto | Standard IoT protocol, lightweight, battle-tested |
| State Cache | Redis | In-memory speed for real-time state, TTL for ephemeral data |
| Database | PostgreSQL + TimescaleDB | Time-series hypertables, automatic compression, SQL familiarity |
| Visual Programming | Node-RED | Low-code automation, hundreds of community nodes |
| Monitoring | Grafana | Rich dashboards, alerting, TimescaleDB integration |
| Orchestration | Docker Compose | Single-command deployment, reproducible environments |
