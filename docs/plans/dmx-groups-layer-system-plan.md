# DMX Groups & Layer System — Option C
## Full Architecture & Implementation Plan

**Version:** 1.0  
**Branch:** `feature/dmx-library-and-renaming`  
**Status:** Approved — implementation in progress

---

## 1. Problem Statement

The current DMX playback engine is a **single global instance** (`playback_engine` in `dmx_playback_engine.py`). It tracks one active sequence at a time. This creates three problems:

1. **Universe collisions** — Recalling a cue or playing a sequence always affects all fixtures in the snapshot. If two cues share fixtures (or overlap on a universe), the second recall clobbers values set by the first.
2. **No simultaneous playback** — You cannot run an ambient sequence on wash fixtures while triggering spot cues independently.
3. **No safety scoping** — A programming error in one sequence can accidentally write state to fixtures that belong to a different lighting area.

**Option C solves this** by introducing **DMX Groups** — named scopes that each own a set of fixtures, a set of cues/sequences, and an independent playback engine. Groups run concurrently. Outputs merge via LTP (Last Takes Precedence), which is how physical DMX consoles work. A fixture can belong to at most one group; unassigned fixtures live in an implicit "ungrouped" pool compatible with the current API.

---

## 2. Design Principles

- **Backward compatibility** — All existing API endpoints continue to work unchanged. Ungrouped fixtures/cues/sequences are first-class citizens, not deprecated.
- **Atomic state writes** — Use PostgreSQL `jsonb_set` to merge per-key entity state updates, so two engines writing different keys on the same entity never produce torn state.
- **LTP merge** — The last engine to write a given channel key wins. No new merge layer is needed; the database merge is the merge.
- **One engine per group** — Each `DMXGroupEngine` instance has its own tick loop, sequence/cue state, and fade tasks. They never share mutable state.
- **Registry pattern** — `DMXEngineRegistry` (singleton) owns all `DMXGroupEngine` instances. Routes API calls to the correct engine by `group_id`. `None` key → ungrouped legacy engine.

---

## 3. Database Schema

### 3.1 New Table: `dmx_groups`

```sql
CREATE TABLE dmx_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    color       TEXT,               -- hex color for UI badge
    sort_order  INTEGER NOT NULL DEFAULT 0,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Foreign Key Columns Added

```sql
-- Fixtures belong to a group (optional — NULL = ungrouped)
ALTER TABLE dmx_fixtures
    ADD COLUMN group_id UUID REFERENCES dmx_groups(id) ON DELETE SET NULL;

-- Cues belong to a group (optional — NULL = ungrouped)
ALTER TABLE dmx_cues
    ADD COLUMN group_id UUID REFERENCES dmx_groups(id) ON DELETE SET NULL;

-- Sequences belong to a group (optional — NULL = ungrouped)
ALTER TABLE dmx_sequences
    ADD COLUMN group_id UUID REFERENCES dmx_groups(id) ON DELETE SET NULL;
```

**Cascade rules:**
- `ON DELETE SET NULL` on all three — deleting a group does not cascade-delete its fixtures, cues, or sequences. They become ungrouped instead (graceful degradation).

### 3.3 Snapshot Scoping

When a cue is snapshotted (`POST /dmx/cues/{id}/snapshot`), only fixtures belonging to the **same group** as the cue are captured. If the cue is ungrouped, only ungrouped fixtures are captured.

This is the core safety guarantee: **a group's cues can only affect its own fixtures**.

---

## 4. Backend Architecture

### 4.1 `DMXEngineRegistry`

```python
class DMXEngineRegistry:
    """
    Singleton registry of per-group playback engines.
    Key None = ungrouped (legacy) engine.
    """
    _engines: dict[Optional[str], DMXGroupEngine] = {}
    _lock: asyncio.Lock

    def get(self, group_id: Optional[str]) -> DMXGroupEngine: ...
    def all_engines(self) -> list[DMXGroupEngine]: ...
    async def shutdown_all(self) -> None: ...
```

### 4.2 `DMXGroupEngine`

Identical interface to the current `DMXPlaybackEngine`:

| Method | Description |
|--------|-------------|
| `play(sequence_id)` | Load and play a sequence scoped to this group |
| `pause()` | Pause current sequence |
| `resume()` | Resume paused sequence |
| `stop()` | Stop playback |
| `toggle_loop()` | Toggle loop on/off |
| `fade_out(duration_ms)` | Fade dimmer channels and stop |
| `recall_cue_fade(from, to, duration_ms)` | Fade between cues |
| `.status` | Current playback state dict |

**Key difference from current engine:** `_batch_update` uses `jsonb_set` merge semantics instead of full state replacement:

```sql
UPDATE entities
SET state = state || CAST(:patch AS jsonb),
    state_updated_at = NOW()
WHERE id = CAST(:id AS uuid)
```

This means two group engines writing *different* keys on the same entity do not interfere. Writing the same key is fine — LTP means the last write wins, which is correct DMX behavior.

### 4.3 Status API Changes

`GET /dmx/playback/status` currently returns a single engine's status. After migration:

```json
{
  "engines": [
    { "group_id": null,  "group_name": "Ungrouped", "sequence_id": "...", "play_state": "playing", ... },
    { "group_id": "abc", "group_name": "Washes",    "sequence_id": null,  "play_state": "stopped", ... }
  ]
}
```

All existing playback action endpoints (`/play`, `/pause`, etc.) gain an optional `group_id` query parameter. If omitted, they target the ungrouped engine (backward compatible).

### 4.4 Snapshot Scoping (Backend)

`POST /dmx/cues/{id}/snapshot` currently captures all fixtures with linked entities. After migration:

```sql
SELECT f.id, f.entity_id, f.channel_map, e.state
FROM dmx_fixtures f
JOIN entities e ON e.id = f.entity_id
WHERE f.group_id IS NOT DISTINCT FROM :cue_group_id   -- NULL = NULL match
```

Ungrouped cues only capture ungrouped fixtures. Group cues only capture their group's fixtures.

---

## 5. API Endpoints

### 5.1 New Group CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dmx/groups` | List all groups |
| `POST` | `/dmx/groups` | Create group |
| `GET` | `/dmx/groups/{id}` | Get group + member summary |
| `PATCH` | `/dmx/groups/{id}` | Update name/color/sort_order |
| `DELETE` | `/dmx/groups/{id}` | Delete group (fixtures/cues/sequences become ungrouped) |

### 5.2 Fixture Assignment

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/dmx/fixtures/{id}` | Updated to accept `group_id` (null to ungroup) |
| `POST` | `/dmx/groups/{id}/fixtures` | Bulk assign fixtures to group |

### 5.3 Playback Routing

All existing playback endpoints gain optional `?group_id=<uuid>` parameter. Examples:

```
POST /dmx/playback/play?group_id=abc123     → play on group "abc123" engine
POST /dmx/playback/play                     → play on ungrouped engine (legacy)
GET  /dmx/playback/status                   → returns all engines
```

---

## 6. Frontend Architecture

### 6.1 New Types (`src/lib/types.ts`)

```typescript
export interface DMXGroup {
  id: string
  name: string
  color?: string
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Updated
export interface DMXFixture {
  // ... existing fields ...
  group_id?: string
}
export interface DMXCue {
  // ... existing fields ...
  group_id?: string
}
export interface DMXSequence {
  // ... existing fields ...
  group_id?: string
}
```

### 6.2 Hooks

- **`useDMXGroups()`** — Fetches and manages group list, exposes create/update/delete mutations
- **`useGroupPlayback(groupId: string | null)`** — Wraps existing `usePlayback` with group routing

### 6.3 Sidebar Refactor

The DMX sidebar currently shows a flat list of cues and sequences. After migration it shows groups as collapsible sections:

```
[+] Add Group

▼ Washes  ●──────────────
   Cues:   [Sunrise] [Sunset]
   Seqs:   [▶ Morning Loop]

▼ Spots  ●──────────────
   Cues:   [Beam 1] [Beam 2]
   Seqs:   [▶ Strobe]

▼ Ungrouped
   Cues:   [Test Cue]
```

Each group section has its own playback transport controls (play/stop/pause/loop).

### 6.4 `DMXGroupRow` Component

A collapsible group section header showing:
- Color dot badge
- Group name
- Compact transport controls
- Cue/sequence count badge
- Expand/collapse toggle

### 6.5 Canvas Group Indicators

Each `FixtureNode` on the canvas gets a small color dot in the corner matching its group color. Ungrouped fixtures show no dot.

### 6.6 Fixture Assignment in `AddFixtureModal`

A group selector dropdown is added to the fixture form. Defaults to "Ungrouped". Shows group color badges.

---

## 7. Implementation Phases

### Phase 1 — Database (migration `018_dmx_groups.sql`)

- [ ] Create `dmx_groups` table
- [ ] Add `group_id` to `dmx_fixtures`, `dmx_cues`, `dmx_sequences`
- [ ] Add `ON DELETE SET NULL` foreign keys
- [ ] Add indexes on `group_id` columns

### Phase 2 — Backend API

- [ ] Group CRUD endpoints in `dmx_router.py`
- [ ] Update `list_fixtures`, `list_cues`, `list_sequences` to include `group_id`
- [ ] `DMXFixtureCreate/Update` models get optional `group_id`
- [ ] Update cue snapshot to scope by group
- [ ] Bulk fixture assignment endpoint

### Phase 3 — Playback Engine Refactor

- [ ] Extract `DMXGroupEngine` from current `DMXPlaybackEngine` (minimal changes — same logic, new name)
- [ ] Add `jsonb_set` merge semantics to `_batch_update`
- [ ] Implement `DMXEngineRegistry` singleton
- [ ] Update all playback endpoints to accept optional `group_id`
- [ ] Update status endpoint to return all engines
- [ ] Update `main.py` startup/shutdown to use registry

### Phase 4 — Frontend Types & API Client

- [ ] Add `DMXGroup` type, update fixture/cue/sequence types with `group_id`
- [ ] Add group CRUD methods to `dmxApi`
- [ ] Update playback API methods to accept optional `groupId`
- [ ] `useDMXGroups` hook
- [ ] `useGroupPlayback` hook wrapper

### Phase 5 — Frontend UI

- [ ] `DMXGroupRow` component (collapsible section, transport controls)
- [ ] Sidebar refactor: group sections replace flat cue/sequence lists
- [ ] `AddFixtureModal`: group selector dropdown
- [ ] `FixtureNode` canvas: group color dot indicator
- [ ] Group management UI (create/rename/delete/reorder)

---

## 8. Migration & Backward Compatibility

- All existing fixtures, cues, and sequences start with `group_id = NULL` (ungrouped)
- All existing API calls that omit `group_id` continue to work exactly as before
- The ungrouped engine (`None` key in registry) replaces the current global singleton with zero behavior change
- Snapshot scoping: ungrouped cues continue to capture all ungrouped fixtures (same as current behavior)
- `GET /dmx/playback/status` old format is preserved as `engines[0]` for the ungrouped engine; clients that read the first engine's status see no change

---

## 9. Key Files

| File | Change |
|------|--------|
| `config/postgres/migrations/018_dmx_groups.sql` | New — groups schema |
| `services/fleet-manager/dmx_router.py` | Group CRUD, `group_id` on fixtures/cues/sequences, snapshot scoping, playback routing |
| `services/fleet-manager/dmx_playback_engine.py` | Rename to `DMXGroupEngine`, add `DMXEngineRegistry`, switch to `jsonb_set` merge |
| `services/dashboard/src/lib/types.ts` | `DMXGroup`, `group_id` fields |
| `services/dashboard/src/lib/dmxApi.ts` | Group CRUD, `groupId` params |
| `services/dashboard/src/hooks/useDMXGroups.ts` | New hook |
| `services/dashboard/src/hooks/useGroupPlayback.ts` | New hook |
| `services/dashboard/src/components/dmx/DMXGroupRow.tsx` | New component |
| `services/dashboard/src/components/dmx/DMXSidebar.tsx` | Group-sectioned layout |
| `services/dashboard/src/components/dmx/AddFixtureModal.tsx` | Group selector |
| `services/dashboard/src/components/dmx/FixtureNode.tsx` | Group color dot |

---

## 10. LTP Semantics Example

Suppose two groups are running simultaneously:

| Group | Fixture | Channel | Value |
|-------|---------|---------|-------|
| Washes | par-01 | `intensity` | 0.8 |
| Spots | par-01 | `color_r` | 1.0 |

With `jsonb_set` merge, the entity state becomes:

```json
{ "intensity": 0.8, "color_r": 1.0 }
```

Both engines write their own keys atomically. Neither overwrites the other's channels. This is correct LTP behavior — the last write on any given channel wins.

If both groups write `intensity` simultaneously, the last DB write wins. At 50 Hz tick rates this produces a ~20 ms flicker window, which is imperceptible. True HTP (Highest Takes Precedence) is out of scope for this iteration.
