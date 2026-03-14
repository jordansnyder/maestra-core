# OFL Git Sync Integration Plan — Maestra DMX

**Version:** 2.0  
**Project:** `maestra-core`  
**Stack:** Python / FastAPI (Fleet Manager), Next.js 14 (Dashboard), PostgreSQL 16 + TimescaleDB + LTREE

---

## Overview

This plan integrates the Open Fixture Library (OFL) into Maestra as a local, offline-capable fixture reference database. Fixture data is synced from the OFL GitHub repository into Maestra's PostgreSQL instance at deploy time and on a scheduled basis — no live internet connection is required at runtime. The library also supports custom fixtures defined locally, allowing teams to describe fixtures not present in OFL without breaking sync behavior.

The fixture library feeds directly into the DMX Gateway's `patch.yaml` workflow and the venue entity bootstrap process, giving operators a structured reference for channel maps, modes, and physical properties when patching lights.

**Design goals:**

- Fully offline at runtime — all fixture data lives in local PostgreSQL
- OFL sync is a background/deploy-time operation, never a runtime dependency
- Custom fixtures are first-class citizens, never overwritten by OFL sync
- Integrates naturally with the existing entity system, patch.yaml, and bootstrap script
- No multi-tenancy — single shared fixture library per Maestra instance

---

## How OFL Fixture Data Connects to Maestra

The fixture library is a reference layer that sits between OFL and Maestra's operational systems. Here is how data flows:

```
OFL GitHub repo (vendor/ofl submodule)
         ↓  scripts/sync-ofl.js
   ofl_fixtures table (PostgreSQL)
         ↓  Fleet Manager API
   /api/fixtures  (browse, search, select a fixture)
         ↓  operator selects fixture for a venue
   patch.yaml  (channel map populated from fixture modes)
         ↓  scripts/bootstrap_venue.py
   Maestra entity system  (entities created with typed variables)
         ↓  NATS → DMX Gateway
   Physical lights
```

The key integration points are:

1. **Patch map authoring** — When writing `patch.yaml` for a venue, operators can look up a fixture by name, get its available modes and channel offsets, and copy that into the patch map rather than manually transcribing from a PDF manual.
2. **Bootstrap script** — `bootstrap_venue.py` (Phase 3 of the DMX gateway plan) can be extended to read fixture data from the database when creating entity variables, instead of hardcoding them.
3. **Dashboard** — A fixture browser in the Dashboard gives operators a searchable interface to find fixtures and view their channel maps.

---

## Phase 1 — Database Schema

These tables extend Maestra's existing PostgreSQL schema. They follow the same JSONB-heavy, LTREE-compatible conventions already in use.

> **Migration:** Add these to `config/postgres/init/` as `05-ofl-fixtures.sql`, following the existing numbered init script convention.

### `ofl_manufacturers`

```sql
CREATE TABLE ofl_manufacturers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT UNIQUE NOT NULL,   -- OFL slug, e.g. 'chauvet'
  name            TEXT NOT NULL,
  website         TEXT,
  ofl_last_modified DATE,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ofl_manufacturers_key_idx ON ofl_manufacturers(key);
```

### `ofl_fixtures`

The central table. `source` distinguishes OFL-synced rows from custom fixtures. OFL sync never touches rows where `source = 'custom'`.

```sql
CREATE TYPE fixture_source AS ENUM ('ofl', 'custom');

CREATE TABLE ofl_fixtures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_key      TEXT NOT NULL REFERENCES ofl_manufacturers(key),
  fixture_key           TEXT NOT NULL,          -- OFL slug or user-defined key
  name                  TEXT NOT NULL,
  source                fixture_source NOT NULL DEFAULT 'ofl',
  categories            TEXT[] DEFAULT '{}',
  channel_count_min     INT,
  channel_count_max     INT,
  physical              JSONB DEFAULT '{}',      -- weight, dimensions, lens, bulb
  modes                 JSONB DEFAULT '[]',      -- array of mode objects with channel maps
  ofl_last_modified     DATE,                   -- NULL for custom fixtures
  ofl_schema_version    TEXT,                   -- NULL for custom fixtures
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  synced_at             TIMESTAMPTZ,            -- NULL for custom fixtures
  UNIQUE (manufacturer_key, fixture_key)
);

-- GIN index for full-text search
ALTER TABLE ofl_fixtures
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(manufacturer_key, '') || ' ' ||
      coalesce(array_to_string(categories, ' '), '')
    )
  ) STORED;

CREATE INDEX ofl_fixtures_search_idx  ON ofl_fixtures USING GIN(search_vector);
CREATE INDEX ofl_fixtures_source_idx  ON ofl_fixtures(source);
CREATE INDEX ofl_fixtures_mfr_idx     ON ofl_fixtures(manufacturer_key);
CREATE INDEX ofl_fixtures_categories  ON ofl_fixtures USING GIN(categories);
```

### `ofl_sync_log`

Every sync run writes a row here. Surface this in the Maestra dashboard so operators know the fixture library is healthy.

```sql
CREATE TABLE ofl_sync_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at              TIMESTAMPTZ DEFAULT NOW(),
  ofl_commit_sha      TEXT,
  ofl_schema_version  TEXT,
  fixtures_added      INT DEFAULT 0,
  fixtures_updated    INT DEFAULT 0,
  fixtures_skipped    INT DEFAULT 0,
  fixtures_errored    INT DEFAULT 0,
  errors              JSONB DEFAULT '[]',
  status              TEXT CHECK (status IN ('success', 'partial', 'failed'))
);
```

---

## Phase 2 — OFL Repository as Git Submodule

Because Maestra must work offline at venues, fixture data cannot be fetched at runtime. The OFL repository is vendored as a git submodule — it travels with the Maestra codebase and is available on disk wherever Maestra is deployed.

```bash
# From maestra-core project root
git submodule add https://github.com/OpenLightingProject/open-fixture-library.git vendor/ofl
git submodule update --init --depth 1
```

Using `--depth 1` keeps the clone shallow (OFL has a large history). The submodule is pinned to a specific OFL commit. Every OFL update is a deliberate, auditable decision in Maestra's git history.

**To update OFL to latest:**

```bash
git submodule update --remote --depth 1 vendor/ofl
git add vendor/ofl
git commit -m "chore: update OFL to $(cd vendor/ofl && git rev-parse --short HEAD)"
```

**Docker Compose consideration:** The `dmx-gateway` service already mounts `./config/dmx` as a volume. The sync script runs in a dedicated init container, not inside the gateway container itself. The gateway only reads from PostgreSQL at runtime — it never touches the submodule directly.

---

## Phase 3 — The Ingestion Script (`scripts/sync-ofl.js`)

A Node.js script that walks the OFL submodule and upserts fixture data into PostgreSQL. It is the only thing that writes to `ofl_fixtures` rows where `source = 'ofl'`.

### Key OFL files

- `vendor/ofl/manufacturers.json` — manufacturer map
- `vendor/ofl/fixtures/<manufacturer-key>/<fixture-key>.json` — one file per fixture
- `vendor/ofl/schemas/fixture.json` — JSON Schema with `version` field

### Schema version guard

OFL documents that its JSON format can have incompatible changes. Read the schema version before ingesting anything:

```javascript
const schema = JSON.parse(
  fs.readFileSync(path.join(OFL_PATH, 'schemas/fixture.json'), 'utf-8')
);
const [major] = schema.version.split('.');
const expected = process.env.OFL_EXPECTED_MAJOR_VERSION;

if (major !== expected) {
  console.error(`OFL schema major version changed: got ${major}, expected ${expected}.`);
  console.error('Review OFL changelog before updating OFL_EXPECTED_MAJOR_VERSION.');
  process.exit(1);
}
```

Set `OFL_EXPECTED_MAJOR_VERSION` in `.env`. When OFL bumps its major version, the job exits 1 and the sync halts — no silent data corruption.

### Upsert logic (OFL rows only)

The `WHERE` clause on `ofl_last_modified` means unchanged fixtures are skipped, keeping syncs fast.

```javascript
await db.query(`
  INSERT INTO ofl_fixtures
    (manufacturer_key, fixture_key, name, source, categories,
     channel_count_min, channel_count_max, physical, modes,
     ofl_last_modified, ofl_schema_version, synced_at, updated_at)
  VALUES ($1,$2,$3,'ofl',$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
  ON CONFLICT (manufacturer_key, fixture_key)
  DO UPDATE SET
    name                = EXCLUDED.name,
    categories          = EXCLUDED.categories,
    channel_count_min   = EXCLUDED.channel_count_min,
    channel_count_max   = EXCLUDED.channel_count_max,
    physical            = EXCLUDED.physical,
    modes               = EXCLUDED.modes,
    ofl_last_modified   = EXCLUDED.ofl_last_modified,
    ofl_schema_version  = EXCLUDED.ofl_schema_version,
    synced_at           = NOW(),
    updated_at          = NOW()
  WHERE
    ofl_fixtures.source = 'ofl'
    AND ofl_fixtures.ofl_last_modified < EXCLUDED.ofl_last_modified
`, values);
```

The `WHERE ofl_fixtures.source = 'ofl'` guard means custom fixtures with a clashing key are never touched by sync.

### Per-fixture error isolation

```javascript
for (const fixturePath of fixturePaths) {
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    await ingestFixture(db, raw, schemaVersion);
    stats.updated++;
  } catch (err) {
    stats.errors.push({ path: fixturePath, message: err.message });
    stats.errored++;
  }
}
```

One malformed fixture file doesn't abort the run. All errors are collected and written to `ofl_sync_log`.

### Sync log write

```javascript
await db.query(`
  INSERT INTO ofl_sync_log
    (ofl_commit_sha, ofl_schema_version, fixtures_added, fixtures_updated,
     fixtures_skipped, fixtures_errored, errors, status)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
`, [
  commitSha, schemaVersion,
  stats.added, stats.updated, stats.skipped, stats.errored,
  JSON.stringify(stats.errors),
  stats.errored > 0 && stats.updated === 0 ? 'failed' :
  stats.errored > 0 ? 'partial' : 'success'
]);
```

---

## Phase 4 — Scheduling: Docker Init Container

Because offline support is a hard requirement, the sync runs as part of Maestra's startup sequence. The cleanest pattern is a Docker Compose init service that runs the sync script before the rest of the stack becomes available.

### `docker-compose.yml` additions

```yaml
services:

  ofl-sync:
    build:
      context: ./scripts
      dockerfile: Dockerfile.sync
    container_name: maestra-ofl-sync
    restart: 'no'            # Run once and exit
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - OFL_EXPECTED_MAJOR_VERSION=${OFL_EXPECTED_MAJOR_VERSION:-12}
      - OFL_PATH=/vendor/ofl
    volumes:
      - ./vendor/ofl:/vendor/ofl:ro   # Mount the submodule read-only
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - maestra-network
    profiles: ["dmx"]        # Only runs with the dmx profile

  dmx-gateway:
    # ... existing config ...
    depends_on:
      - nats
      - ofl-sync             # Gateway waits for sync to complete
```

When you run `make up-dmx`, PostgreSQL starts, the sync runs and loads OFL fixture data, then the DMX gateway and the rest of the stack start. No internet required after the initial `git submodule update`.

### Supplemental: GitHub Actions for hosted deployments

For deployments that do have internet access, a weekly scheduled Action keeps the submodule pointer current:

```yaml
name: Update OFL Submodule
on:
  schedule:
    - cron: '0 3 * * 1'   # Monday 3am UTC
  workflow_dispatch:

jobs:
  update-ofl:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          token: ${{ secrets.GITHUB_TOKEN }}
      - run: |
          git submodule update --remote --depth 1 vendor/ofl
          if git diff --quiet vendor/ofl; then
            echo "OFL unchanged, no commit needed."
          else
            git config user.name 'github-actions'
            git config user.email 'actions@github.com'
            git add vendor/ofl
            git commit -m "chore: update OFL to $(cd vendor/ofl && git rev-parse --short HEAD)"
            git push
          fi
```

### Makefile additions

```makefile
sync-ofl:          ## Run OFL fixture sync manually
	docker compose run --rm ofl-sync

ofl-status:        ## Show last OFL sync result
	docker compose exec postgres psql -U maestra -d maestra \
	  -c "SELECT ran_at, ofl_commit_sha, fixtures_added, fixtures_updated, fixtures_errored, status FROM ofl_sync_log ORDER BY ran_at DESC LIMIT 5;"
```

---

## Phase 5 — Custom Fixtures

Custom fixtures are written directly to `ofl_fixtures` with `source = 'custom'`. They follow the same schema as OFL fixtures — the `modes` and `physical` JSONB fields are identical — so the Fleet Manager API and Dashboard treat them identically. The only differences are that `ofl_last_modified`, `ofl_schema_version`, and `synced_at` are NULL, and they are never touched by the OFL sync script.

### Fleet Manager API endpoints

Add these to the Fleet Manager under a new `/fixtures` router:

```
GET    /fixtures                   List and search (OFL + custom)
GET    /fixtures/:mfr/:key         Get a specific fixture with full mode detail
GET    /manufacturers              List manufacturers with fixture counts

POST   /fixtures/custom            Create a custom fixture
PUT    /fixtures/custom/:mfr/:key  Update a custom fixture
DELETE /fixtures/custom/:mfr/:key  Delete a custom fixture

GET    /fixtures/sync/status       Last sync log entry
POST   /fixtures/sync/trigger      Manually trigger sync (admin only)
```

OFL-sourced fixtures are read-only via the API. Custom fixtures are fully CRUD.

### Custom fixture structure

Custom fixtures use the same `modes` JSONB shape as OFL. A minimal example for a fixture not in OFL:

```json
{
  "manufacturer_key": "house",
  "fixture_key": "lobby-sconce",
  "name": "Lobby Sconce Dimmer",
  "source": "custom",
  "categories": ["Dimmer"],
  "channel_count_min": 1,
  "channel_count_max": 1,
  "modes": [
    {
      "shortName": "1ch",
      "name": "1-Channel Dimmer",
      "channels": [
        { "name": "Dimmer", "type": "range" }
      ]
    }
  ]
}
```

The `manufacturer_key` for custom fixtures that don't belong to a real manufacturer should use a venue-specific slug (e.g., `relay-santa-fe`, `house`) — add a corresponding row to `ofl_manufacturers`.

### Integration with `bootstrap_venue.py`

Extend the bootstrap script to look up fixture mode data from the database instead of using hardcoded variable definitions:

```python
# Instead of hardcoded variable definitions, look up the fixture
fixture = fleet_manager.get_fixture(manufacturer_key, fixture_key)
mode = next(m for m in fixture['modes'] if m['shortName'] == config['mode'])

for ch in mode['channels']:
    fleet_manager.create_entity_variable(entity_id, {
        'name': ch['name'].lower().replace(' ', '_'),
        'type': ch['type'],    # 'range', 'enum', 'boolean', etc.
        'direction': 'input'
    })
```

This eliminates the hardcoded entity type definitions (`dmx_moving_spot`, `dmx_par`, etc.) from the DMX gateway plan — the fixture library becomes the source of truth for what variables a fixture has.

---

## Phase 6 — Fleet Manager Integration (FastAPI)

The Fleet Manager is Python/FastAPI with async SQLAlchemy. Add a `fixtures` router following the same patterns as the existing `entities` and `devices` routers.

### SQLAlchemy model

```python
class OFLFixture(Base):
    __tablename__ = 'ofl_fixtures'

    id                 = Column(UUID, primary_key=True, default=uuid4)
    manufacturer_key   = Column(Text, ForeignKey('ofl_manufacturers.key'), nullable=False)
    fixture_key        = Column(Text, nullable=False)
    name               = Column(Text, nullable=False)
    source             = Column(Enum('ofl', 'custom', name='fixture_source'), default='ofl')
    categories         = Column(ARRAY(Text), default=[])
    channel_count_min  = Column(Integer)
    channel_count_max  = Column(Integer)
    physical           = Column(JSONB, default={})
    modes              = Column(JSONB, default=[])
    ofl_last_modified  = Column(Date)
    ofl_schema_version = Column(Text)
    created_at         = Column(TIMESTAMPTZ, default=func.now())
    updated_at         = Column(TIMESTAMPTZ, default=func.now())
    synced_at          = Column(TIMESTAMPTZ)

    __table_args__ = (UniqueConstraint('manufacturer_key', 'fixture_key'),)
```

### Search endpoint

```python
@router.get('/fixtures')
async def list_fixtures(
    q: str | None = None,
    manufacturer: str | None = None,
    category: str | None = None,
    source: str | None = None,
    channels: int | None = None,
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(OFLFixture)
    if q:
        query = query.where(OFLFixture.search_vector.op('@@')(
            func.plainto_tsquery('english', q)
        ))
    if manufacturer:
        query = query.where(OFLFixture.manufacturer_key == manufacturer)
    if category:
        query = query.where(OFLFixture.categories.contains([category]))
    if source:
        query = query.where(OFLFixture.source == source)
    if channels:
        query = query.where(
            OFLFixture.channel_count_min <= channels,
            OFLFixture.channel_count_max >= channels
        )
    # pagination...
    return await db.execute(query)
```

---

## Phase 7 — Dashboard UI (Next.js 14)

Add a **Fixture Library** section to the Maestra Dashboard at `/fixtures`. This gives operators a searchable interface for finding fixtures and reviewing channel maps — essential when authoring `patch.yaml` at a venue without access to physical manuals.

### Pages / components

- `/fixtures` — Searchable list with filters: manufacturer, category, channel count, source (OFL / custom)
- `/fixtures/:mfr/:key` — Fixture detail: name, categories, all modes with channel tables, physical specs
- `/fixtures/custom/new` — Form to create a custom fixture
- `/fixtures/custom/:mfr/:key/edit` — Edit a custom fixture

### Sync status widget

Add to the existing Dashboard status area:

```
🔧 Fixture Library
Last sync: 3 days ago (commit a4f2c1b)
6,421 OFL fixtures  ·  12 custom fixtures
Status: ✅ Success
```

Pull from `GET /fixtures/sync/status`.

---

## Environment Variables

Add to `.env.example`:

```bash
# OFL Fixture Sync
OFL_EXPECTED_MAJOR_VERSION=12   # Update only after reviewing OFL changelog
OFL_PATH=/vendor/ofl            # Path to the submodule inside the sync container
```

---

## Implementation Checklist

### Phase 1 — Schema
- [ ] Write `config/postgres/init/05-ofl-fixtures.sql`
- [ ] Add `fixture_source` enum, `ofl_manufacturers`, `ofl_fixtures`, `ofl_sync_log` tables
- [ ] Add GIN indexes for full-text search and categories

### Phase 2 — Submodule
- [ ] `git submodule add` OFL repo at `vendor/ofl`
- [ ] Add `--depth 1` and commit the submodule pointer
- [ ] Update `.gitmodules` and confirm `vendor/ofl` is excluded from Docker build context

### Phase 3 — Sync Script
- [ ] Write `scripts/sync-ofl.js` with schema version guard
- [ ] Implement manufacturer upsert
- [ ] Implement fixture upsert (OFL-only, skips custom rows)
- [ ] Per-fixture error isolation with `ofl_sync_log` write
- [ ] Add `OFL_EXPECTED_MAJOR_VERSION` to `.env.example`

### Phase 4 — Docker & Make
- [ ] Add `ofl-sync` init service to `docker-compose.yml` under `dmx` profile
- [ ] Wire `dmx-gateway` to depend on `ofl-sync`
- [ ] Add `sync-ofl` and `ofl-status` make targets
- [ ] (Optional) Add GitHub Actions workflow for submodule auto-update

### Phase 5 — Custom Fixtures
- [ ] Add `POST/PUT/DELETE /fixtures/custom` endpoints to Fleet Manager
- [ ] Extend `bootstrap_venue.py` to look up fixture modes from DB
- [ ] Test: custom fixture with same key as OFL fixture survives sync

### Phase 6 — Fleet Manager
- [ ] Add `OFLFixture` SQLAlchemy model
- [ ] Implement `GET /fixtures` with q, manufacturer, category, source, channels filters
- [ ] Implement `GET /fixtures/:mfr/:key`
- [ ] Implement `GET /manufacturers`
- [ ] Implement `GET /fixtures/sync/status`

### Phase 7 — Dashboard
- [ ] `/fixtures` list page with search and filters
- [ ] `/fixtures/:mfr/:key` detail page with mode channel tables
- [ ] `/fixtures/custom/new` and `/edit` forms
- [ ] Sync status widget on main Dashboard

---

## Runbook: What to Do When the Schema Guard Fires

If `ofl-sync` exits with `OFL schema major version changed`:

1. Check OFL's GitHub for the changelog — look at commits since the last pinned SHA
2. Identify what changed in the fixture JSON format
3. Update the normalization logic in `scripts/sync-ofl.js` to handle the new structure
4. Test against a sample of fixtures locally
5. Update `OFL_EXPECTED_MAJOR_VERSION` in `.env`
6. Re-run `make sync-ofl` and confirm `ofl_sync_log` shows `status = success`
7. Commit the updated submodule pointer + env change together
