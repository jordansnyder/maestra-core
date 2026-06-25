# Changelog

All notable changes to Maestra will be documented in this file.

## [0.22.0.0] - 2026-06-25

### Added
- **Light/dark theme toggle** in the dashboard. Your choice is remembered across sessions and defaults to your operating system preference, with no flash of the wrong theme on load.
- **maestra.cc brand identity** across the dashboard and documentation: Space Grotesk and JetBrains Mono typography, a warm paper light theme and a matching dark theme, the red-orange brand accent, square corners, monospace HUD labels, and a subtle graph-paper texture.

### Changed
- The dashboard now resolves all colors through a semantic theme layer, so both themes stay consistent as the UI grows.
- The documentation site (MkDocs) adopts the same brand fonts, colors, and light/dark toggle.

## [0.21.0.0] - 2026-06-25

### Added
- **Maestra Desktop auto-updater**: The desktop app checks for and installs new releases, with hardened security (signed/notarized macOS builds) and more robust Docker lifecycle handling.
- **Distribution pipeline**: CI now builds and publishes the OpenFrameworks addon, the desktop updater artifacts, and enforces an SDK version gate so releases stay in sync.
- **RELEASE.md operator runbook**: Step-by-step guide for cutting SDK, desktop, and Docker distribution releases.

### Fixed
- **Dashboard loses devices/entities after an IP change**: The dashboard no longer bakes the host machine's LAN IP into its browser bundle. It resolves every service host from `window.location.hostname` at runtime, so it keeps working at `localhost` or over the LAN and survives DHCP/network IP changes that previously left it pointing at a dead address.

## [0.20.2.0] - 2026-04-06

### Changed
- **7x message amplification fix**: Entity state updates now publish to 1 NATS subject and 1 MQTT topic instead of 3 each. NATS/MQTT wildcards handle consumer filtering. Reduces WebSocket traffic from ~1,400 msg/sec to ~200 msg/sec during active shows with 20 entities at 10 Hz.
- **WebSocket Gateway rewrite**: Per-client topic filtering (clients subscribe to specific NATS patterns) and bounded send queues with drop-oldest policy. Slow WiFi clients see gaps instead of accumulating unbounded lag.
- **OSC Gateway subscription tightened**: Changed from `maestra.entity.state.>` to `maestra.entity.state.*.*` to prevent double-processing of entity state broadcasts and matching raw command subjects.
- **DMX playback status push**: Fleet Manager now pushes playback status to NATS at 10 Hz during sequence playback instead of the dashboard polling at 150ms intervals (~7 HTTP req/sec eliminated).
- **Docker healthcheck optimization**: Added `start_period` to all healthchecked services (NATS, Mosquitto, Redis, PostgreSQL, Node-RED) and added a healthcheck to Fleet Manager. Startup time reduced by ~25 seconds.

### Added
- **Entity metadata cache** in state manager: In-memory slug-to-entity lookup cache eliminates a DB SELECT per state update. Invalidated on entity CRUD.
- **Networking best practices guide**: New documentation covering Ethernet vs WiFi tradeoffs, dedicated SSID recommendations, protocol selection, and bandwidth estimates for installations.
- **Targeted routing tests**: pytest tests for single-publish verification, entity cache, and NATS pattern matching.

### Fixed
- **Broadcast payload size**: `previous_state` sent as empty `{}` instead of full state copy, reducing broadcast payload size by ~50%.
- **Gateway logging**: Replaced per-message `print()` calls with Python `logging` module across all gateways (WebSocket, OSC, MQTT bridge, state manager). No more stdout blocking on the async event loop.
- **WebSocket subscribe API**: Gateway now accepts both legacy `{"type": "subscribe", "subject": "..."}` and new `{"type": "subscribe", "subjects": [...]}` formats.
- **DMXChannelModal subscription**: Updated from exact `maestra.entity.state` subject (no longer published) to `maestra.entity.state.>` wildcard.

## [0.20.1.0] - 2026-03-29

### Added
- **Show Control System**: System-wide show lifecycle management for installations
  - State machine with 6 phases: idle, pre_show, active, paused, post_show, shutdown
  - 9 REST endpoints with state machine validation and optional API key auth
  - Configurable side effects per transition (entity state updates, NATS publishes, internal calls)
  - Default DMX side effects: shutdown triggers blackout, pause/resume controls DMX output
  - Show scheduling engine with cron-based entries, timezone support, and missed-fire catch-up
  - Dashboard page with phase hero indicator, lifecycle buttons, device health panel, transition timeline, and schedule panel
  - Inbound show commands via NATS/MQTT for external control (QLab, Isadora, custom controllers)
  - Node-RED Show Control tab with MQTT listener and phase routing
  - All 9 SDKs: Python, JS/TS, Unity, Unreal, TouchDesigner, Arduino, Processing, OpenFrameworks, Max/MSP
  - API reference and user guide documentation
  - pytest test infrastructure for Fleet Manager

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
