# SDK Overview

Maestra provides SDKs for multiple platforms to integrate with the entity state system.

## Available SDKs

| Platform | Transport | Location |
|----------|-----------|----------|
| [Python](python.md) | HTTP, NATS, MQTT | `sdks/python/` |
| [JavaScript/TypeScript](javascript.md) | HTTP, WebSocket, MQTT | `sdks/js/` |
| [Arduino/ESP32](arduino.md) | MQTT | `sdks/arduino/` |
| [TouchDesigner](touchdesigner.md) | HTTP, OSC | `sdks/touchdesigner/` |
| [Max/MSP](maxmsp.md) | OSC | `sdks/maxmsp/` |
| [Unreal Engine](unreal.md) | HTTP | `sdks/unreal/` |
| [Unity](unity.md) | HTTP | `sdks/unity/` |

## Common Interface

All SDKs provide a similar interface:

```
MaestraClient
  connect(options)
  getEntity(slug): Entity

Entity
  getState(): object
  updateState(patch): void
  setState(state): void
  onStateChange(callback)
```
