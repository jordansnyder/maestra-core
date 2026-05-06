# TODOS

## Full Message Routing Test Suite

**What:** Add comprehensive tests for all 18 untested message routing code paths across the WebSocket gateway, OSC gateway, MQTT-NATS bridge, and Fleet Manager state manager.

**Why:** The performance fix PR (single-publish, topic filtering, backpressure) added targeted tests for the specific changes, but the broader message routing code has zero coverage. One wrong NATS wildcard pattern and messages silently stop flowing. A full test suite catches regressions before they reach a live show.

**Pros:**
- Catches silent routing failures before they affect artists during shows
- Enables confident refactoring of gateway code
- Documents the expected message flow behavior

**Cons:**
- Significant scope (18 code paths across 4 services)
- Requires mocking NATS, MQTT, and WebSocket connections

**Context:** Identified during eng review for performance optimization (2026-04-06). Coverage audit found 0/18 performance-critical paths tested. The targeted tests in this PR cover 6 paths. Remaining 12 include: MQTT-NATS bridge topic transformation (both directions), OSC gateway entity state parsing (3 input formats), OSC outbound N+1 message generation, OSC loop prevention, WebSocket publish flow, full round-trip E2E test, ConsoleProvider message buffer management, protocol detection, and source/target resolution.

**Effort:** M (human: ~3 days / CC: ~1 hour)

**Priority:** P1 — should be done before any further gateway changes

**Depends on:** Performance fix PR merged first (tests should verify the new single-publish behavior)

## Fleet Manager Test Infrastructure (pytest)

**What:** Add pytest + pytest-asyncio to Fleet Manager and create the test directory structure. Currently the Fleet Manager has zero test framework configured.

**Why:** The show control feature (state machine, side effects, scheduler) needs unit and integration tests. Without a test framework, we can't write them. This isn't just for show control, every Fleet Manager feature (entity CRUD, stream negotiation, DMX playback) is untested at the Python level.

**Pros:**
- Enables testing for ALL Fleet Manager features, not just show control
- pytest-asyncio handles async FastAPI endpoint testing naturally
- Foundation for CI/CD test gates

**Cons:**
- Minimal: just adding dependencies and directory structure
- Existing code has no tests, so "test infrastructure" without tests is incomplete

**Context:** Identified during eng review for show control (2026-03-29). The Dashboard has vitest bootstrapped (commit `76f0665`). The Fleet Manager has nothing. Should be done as part of the show control implementation, but the test infra itself benefits all features.

**Effort:** S (human: ~2 hours / CC: ~10 min)

**Priority:** P1 — Required before show control ships

**Depends on:** Nothing

## Background Health Daemon (Desktop App)

**What:** Add a background thread to the desktop app that continuously monitors Docker state, image freshness, and service health while running.

**Why:** The startup readiness gate catches issues at launch time, but services can crash, Docker can stop, or images can become stale while the app is running. A background daemon would detect these issues proactively and either auto-fix them (restart crashed services) or notify the artist before they notice something is broken.

**Pros:**
- True self-healing: detects and fixes problems in real-time
- Could auto-restart crashed services without user action
- Could surface "updates available" while running, not just at startup
- Foundation for future operational intelligence (health scoring, performance monitoring)

**Cons:**
- Significantly more complex (background tokio task, state synchronization with React, notification system)
- Risk of fighting Docker Compose's own `restart: unless-stopped` policy
- CPU/memory overhead of continuous monitoring on artist machines

**Context:** This was Approach C in the CEO review for desktop app resilience. The readiness gate (Approach B, now implemented) is the foundation layer. The daemon layers on top and can reuse `ReadinessReport`, `check_images_present`, and the structured error types already in place. The existing `health.rs` concurrent check pattern is the right starting point.

**Effort:** L (human: ~2 weeks / CC: ~1 hour)

**Priority:** P2 — Nice to have after the readiness gate is battle-tested

**Depends on:** Desktop app startup resilience (readiness gate) shipping first

## Multi-Zone Show Coordination

**What:** Support multiple show entities with different slugs for different rooms/zones. Room A in "active", Room B in "intermission". Coordinated transitions across zones (e.g., "start all zones" or "shutdown building").

**Why:** Permanent installations and museums often have multiple rooms or zones that need independent show control but coordinated lifecycle. The single-show architecture supports this naturally (just more show entities), but the Dashboard UI, zone grouping, and cross-zone coordination logic are separate features.

**Pros:**
- Natural extension of show control architecture (entity per zone)
- Dashboard could show a multi-zone overview with per-zone controls
- Coordinated transitions enable "start the whole building" workflows
- Zone hierarchy could use existing LTREE entity paths

**Cons:**
- Dashboard complexity increases (multi-zone layout, zone selector)
- Cross-zone coordination needs careful ordering (which zone shuts down first?)
- More entities = more state to track and more broadcasts

**Context:** Identified during the CEO review for show control (2026-03-29). The entity-backed state machine architecture already supports multiple show entities by design. Each zone would be a separate entity with type `show_control` and a unique slug (e.g., `show-gallery-a`, `show-gallery-b`). The scheduling engine could reference zone slugs.

**Effort:** M (human: ~1 week / CC: ~30 min)

**Priority:** P2 — After show control v1 is battle-tested

**Depends on:** Show control v1 shipping first
