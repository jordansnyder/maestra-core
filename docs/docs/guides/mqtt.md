# MQTT Integration Guide

MQTT (Message Queuing Telemetry Transport) is a lightweight protocol ideal for IoT devices. Maestra includes Mosquitto broker with automatic bridging to NATS.

## Connection Details

| Location | Host | Port | Protocol |
|----------|------|------|----------|
| Inside Docker | `mosquitto` | 1883 | MQTT/TCP |
| Host machine | `localhost` | 1883 | MQTT/TCP |
| External device | `<host-ip>` | 1883 | MQTT/TCP |
| Web browser | `localhost` | 9001 | MQTT/WebSocket |

## Topic Conventions

Maestra uses a structured topic hierarchy:

```
maestra/<resource>/<action>/<details>
```

**Examples**:
```
maestra/devices/esp32/temperature
maestra/devices/esp32/status
maestra/lights/room1/brightness
maestra/control/all/power
```

## Entity State via MQTT

Devices can update entity state by publishing to MQTT topics. The Fleet Manager subscribes to these topics and processes updates automatically — no HTTP required.

### Update Topics (device → Maestra)

| Topic | Semantics | Description |
|-------|-----------|-------------|
| `maestra/entity/state/update/<slug>` | PATCH (merge) | Merges payload into existing state |
| `maestra/entity/state/set/<slug>` | PUT (replace) | Replaces entire entity state |

**Payload format** (recommended):
```json
{
  "state": { "temperature": 23.5, "humidity": 65 },
  "source": "esp32-sensor-01"
}
```

**Simplified payload** (also accepted — `source` defaults to `"mqtt"`):
```json
{ "temperature": 23.5, "humidity": 65 }
```

### Event Topics (Maestra → device)

Subscribe to these topics to receive state change notifications:

| Topic | Description |
|-------|-------------|
| `maestra/entity/state/<type>/<slug>` | Changes for a specific entity |
| `maestra/entity/state/<type>` | All changes for an entity type |
| `maestra/entity/state` | All state changes (all entities) |

**Event payload**:
```json
{
  "type": "state_changed",
  "entity_id": "uuid",
  "entity_slug": "my-sensor",
  "entity_type": "sensor",
  "previous_state": { "temperature": 22.0 },
  "current_state": { "temperature": 23.5 },
  "changed_keys": ["temperature"],
  "source": "esp32-sensor-01",
  "timestamp": "2026-03-15T12:00:00Z"
}
```

### Example: Arduino/ESP32

```cpp
#include <PubSubClient.h>
#include <ArduinoJson.h>

WiFiClient espClient;
PubSubClient client(espClient);

// Connect
client.setServer("192.168.1.100", 1883);
client.connect("ESP32_Sensor");

// Update entity state (merge)
StaticJsonDocument<256> doc;
JsonObject state = doc.createNestedObject("state");
state["temperature"] = 23.5;
state["humidity"] = 65;
doc["source"] = "esp32-sensor-01";

char buffer[256];
serializeJson(doc, buffer);
client.publish("maestra/entity/state/update/my-sensor", buffer);

// Subscribe to state changes
client.subscribe("maestra/entity/state/+/my-sensor");
```

### Example: Python (paho-mqtt)

```python
import json
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.connect("localhost", 1883)

# Update state
client.publish(
    "maestra/entity/state/update/my-light",
    json.dumps({
        "state": {"brightness": 75, "color": "#ff9900"},
        "source": "python-controller"
    })
)

# Subscribe to changes
def on_message(client, userdata, msg):
    event = json.loads(msg.payload)
    print(f"State changed: {event['changed_keys']}")

client.on_message = on_message
client.subscribe("maestra/entity/state/+/my-light")
client.loop_forever()
```

### Example: Command Line

```bash
# Update entity state
mosquitto_pub -h localhost -t 'maestra/entity/state/update/my-sensor' \
  -m '{"state": {"temperature": 23.5}, "source": "cli"}'

# Replace entity state
mosquitto_pub -h localhost -t 'maestra/entity/state/set/my-sensor' \
  -m '{"state": {"temperature": 23.5, "active": true}}'

# Subscribe to state changes for a specific entity
mosquitto_sub -h localhost -t 'maestra/entity/state/+/my-sensor' -v

# Subscribe to all state changes
mosquitto_sub -h localhost -t 'maestra/entity/state/#' -v
```

## NATS Equivalent

The same state update commands are also available via NATS subjects:

| NATS Subject | Equivalent MQTT Topic |
|-------------|----------------------|
| `maestra.entity.state.update.<slug>` | `maestra/entity/state/update/<slug>` |
| `maestra.entity.state.set.<slug>` | `maestra/entity/state/set/<slug>` |

## General Topics

Beyond entity state, you can publish arbitrary messages:

```
maestra/devices/esp32/temperature   → raw sensor data
maestra/control/all/power           → control commands
```

## Wildcards

- `+` - Single level: `maestra/entity/state/+/my-sensor`
- `#` - Multi-level: `maestra/entity/state/#`

## Testing

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -t '#' -v

# Publish test message
mosquitto_pub -h localhost -t 'maestra/test' -m 'Hello'

# Test entity state update
mosquitto_pub -h localhost -t 'maestra/entity/state/update/my-entity' \
  -m '{"state": {"test": true}, "source": "test"}'
```

See [Device Registration Guide](device-registration.md) for complete examples.
