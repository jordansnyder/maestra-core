# Events & Messages

## What are events?

**Events** are the messages that flow through Maestra whenever something happens — a state change, a sensor reading, a device coming online, a stream being advertised. Every piece of data in Maestra travels as an event.

You usually don't need to think about events directly. When you update an entity's state or subscribe to changes, events are happening behind the scenes. But understanding them helps when you want to do more advanced things, like building custom automations in Node-RED or subscribing to specific types of activity.

## How messages flow

When a device sends an update, here's what happens:

1. The device sends its message using whatever protocol it speaks (OSC from Max/MSP, MQTT from an Arduino, WebSocket from a browser, HTTP from a Python script)
2. Maestra's **gateway** translates it into a common format
3. The **message bus** delivers it to every device or service that's listening
4. Each subscriber receives the update in its own protocol

The key idea: **your tools don't need to know about each other's protocols.** An Arduino sending MQTT and a TouchDesigner patch receiving OSC can exchange data seamlessly — Maestra handles the translation.

## The message envelope

Every message in Maestra follows a standard format:

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

This consistency means any tool can understand any message, regardless of where it came from.

## Subscribing to events

Most of the time, you subscribe to entity state changes through your SDK (see [Connect Your Tool](../connect/touchdesigner.md)). For more advanced use cases, you can subscribe to raw events:

- **Node-RED** — drag MQTT or NATS input nodes onto the canvas and filter by topic
- **WebSocket** — subscribe to specific patterns from a browser
- **MQTT** — subscribe with wildcards like `maestra/entity/state/#`

??? info "Technical details"
    **Topic naming conventions:**

    - NATS: `maestra.<protocol>.<resource>.<action>` (e.g., `maestra.mqtt.devices.esp32.temperature`)
    - MQTT: `maestra/<resource>/<action>` (e.g., `maestra/devices/esp32/temperature`)

    **Protocol translation:**

    - MQTT `maestra/x/y` becomes NATS `maestra.mqtt.maestra.x.y`
    - NATS `maestra.to_mqtt.x.y` becomes MQTT `x/y`
    - NATS `maestra.to_osc.*` becomes OSC output on port 57121
    - NATS `maestra.entity.state.>` triggers DMX channel updates (if DMX gateway is enabled)

    **Message bus:** Maestra uses [NATS](https://nats.io) as its primary message bus, with an MQTT broker (Mosquitto) for IoT devices and bidirectional bridging between the two. NATS supports wildcard subscriptions, request-reply patterns, and sub-millisecond routing.

## Next steps

- [Entities & State](entities.md) — the most common thing events carry
- [Routing](routing.md) — automatically connect event sources to destinations
- [Node-RED Automation](../guides/nodered.md) — build visual event-processing flows
- [Architecture Overview](../architecture/overview.md) — full technical system design
