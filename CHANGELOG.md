# Changelog

All notable changes to Maestra will be documented in this file.

## [0.20.0.0] - 2026-03-25

### Added
- **Data Console**: New `/console` page with dual-mode real-time message visualization
  - Debug Mode: Virtualized message feed with protocol color-coding (OSC/MQTT/WS), expandable JSON payloads, subject filtering, and D3 force-directed network graph
  - Ambient Mode: Canvas-based particle visualization with radial node layout, glowing effects, and breathing animations for installation display
  - Two-tier toolbar with connection status, pause/resume, protocol toggles, and heartbeat filtering
  - Error boundaries per panel, connection loss/recovery dividers, and empty states
- Stream multicast support for device-to-device streaming
- OSC entity interface improvements with `/entity/update` and `/entity/set` address patterns
- Arduino SDK convenience functions for entity wildcard subscriptions

### Changed
- WebSocket gateway now uses concurrent broadcast (`websockets.broadcast`) instead of sequential fan-out for better performance at high message rates
- WebSocket gateway handles non-JSON NATS payloads gracefully instead of crashing
- OSC gateway expanded with configurable address mappings and entity state broadcast support

### Fixed
- MQTT-NATS bridge crash on malformed messages
- OSC gateway crash on invalid address patterns
- Removed orphaned documentation pages
