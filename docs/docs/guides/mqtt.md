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

## Publishing from Arduino/ESP32

Basic example:

```cpp
#include <PubSubClient.h>
WiFiClient espClient;
PubSubClient client(espClient);

client.setServer("192.168.1.100", 1883);  // Maestra host IP
client.connect("ESP32_Device");
client.publish("maestra/devices/esp32/temp", "23.5");
```

## Wildcards

- `+` - Single level: `maestra/devices/+/temperature`
- `#` - Multi-level: `maestra/devices/#`

## Testing

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -t '#' -v

# Publish test message
mosquitto_pub -h localhost -t 'maestra/test' -m 'Hello'
```

See [Device Registration Guide](device-registration.md) for complete examples.
