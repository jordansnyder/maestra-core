# TODOS

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
