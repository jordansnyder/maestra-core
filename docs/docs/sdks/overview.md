# SDK Overview

Maestra provides SDKs for multiple platforms to integrate with the entity state system and stream discovery.

## Available SDKs

| Platform | Transport | Location |
|----------|-----------|----------|
| [Python](python.md) | HTTP, NATS, MQTT | `sdks/python/` |
| [JavaScript/TypeScript](javascript.md) | HTTP, WebSocket, MQTT | `sdks/js/` |
| [Arduino/ESP32](arduino.md) | MQTT | `sdks/arduino/` |
| [TouchDesigner](touchdesigner.md) | HTTP, OSC | `sdks/touchdesigner/` |
| [Max/MSP](max-msp.md) | OSC | `sdks/maxmsp/` |
| [Unreal Engine](unreal.md) | HTTP | `sdks/unreal/` |
| [Unity](unity.md) | HTTP | `sdks/unity/` |

## Common Interface

All SDKs provide a similar interface:

```
MaestraClient
  connect(options)
  getEntity(slug): Entity
  getStreams(type?): StreamInfo[]
  advertiseStream(params): StreamInfo
  requestStream(id, params): StreamOffer

Entity
  getState(): object
  updateState(patch): void
  setState(state): void
  onStateChange(callback)
```

## Stream Interface

SDKs with HTTP support provide stream discovery and advertisement:

| Method | Python | JS/TS | Unity | Unreal | TouchDesigner | Arduino |
|--------|--------|-------|-------|--------|---------------|---------|
| List streams | `get_streams()` | `getStreams()` | `GetStreams()` | `GetStreams()` | `ListStreams()` | MQTT subscribe |
| Advertise | `advertise_stream()` | `advertiseStream()` | `AdvertiseStream()` | `AdvertiseStream()` | `AdvertiseStream()` | `advertiseStream()` |
| Request | `request_stream()` | `requestStream()` | `RequestStream()` | `RequestStream()` | `RequestStream()` | N/A |
| Heartbeat | `stream_heartbeat()` | `streamHeartbeat()` | `StreamHeartbeat()` | `StreamHeartbeat()` | `StreamHeartbeat()` | `streamHeartbeat()` |
| Withdraw | `withdraw_stream()` | `withdrawStream()` | `WithdrawStream()` | `WithdrawStream()` | `WithdrawStream()` | `withdrawStream()` |

Python also provides `StreamPublisher` and `StreamConsumer` helper classes with automatic heartbeat management.
