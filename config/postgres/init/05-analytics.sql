-- =============================================================================
-- Maestra Show Analytics & Entity State History
-- 05-analytics.sql
-- Runs after 04-streams.sql. Reuses update_updated_at_column() from 01-init-db.sql.
-- =============================================================================

-- =============================================================================
-- 1. ENTITY STATE HISTORY HYPERTABLE
-- =============================================================================
-- Records every entity state change for historical queries and post-show analysis.
-- No FK to entities(id): preserves history for deleted entities and avoids write overhead.

CREATE TABLE IF NOT EXISTS entity_states (
    time            TIMESTAMPTZ NOT NULL,
    entity_id       UUID NOT NULL,
    entity_slug     VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_path     TEXT,
    state           JSONB NOT NULL DEFAULT '{}',
    previous_state  JSONB DEFAULT '{}',
    changed_keys    TEXT[] DEFAULT '{}',
    source          VARCHAR(255),               -- 'mqtt', 'osc', 'websocket', 'api', etc.
    PRIMARY KEY (time, entity_id)
);

SELECT create_hypertable('entity_states', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_entity_states_entity_time
    ON entity_states (entity_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_entity_states_slug_time
    ON entity_states (entity_slug, time DESC);
CREATE INDEX IF NOT EXISTS idx_entity_states_type_time
    ON entity_states (entity_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_entity_states_state
    ON entity_states USING GIN (state);

-- No automatic retention -- managed by application / manual cleanup.
-- For a month-long show this table stays small.

-- =============================================================================
-- 2. ENTITY STATE CONTINUOUS AGGREGATES
-- =============================================================================

-- Hourly state change counts per entity
CREATE MATERIALIZED VIEW IF NOT EXISTS entity_states_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    entity_id,
    entity_slug,
    entity_type,
    COUNT(*) AS change_count
FROM entity_states
GROUP BY bucket, entity_id, entity_slug, entity_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('entity_states_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

-- Daily state change counts per entity
CREATE MATERIALIZED VIEW IF NOT EXISTS entity_states_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    entity_id,
    entity_slug,
    entity_type,
    COUNT(*) AS change_count
FROM entity_states
GROUP BY bucket, entity_id, entity_slug, entity_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('entity_states_daily',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE);

-- =============================================================================
-- 3. SHOW ANNOTATIONS TABLE
-- =============================================================================
-- For tagging meaningful moments: "opening night", "peak crowd", "tech failure"
-- Regular table (not hypertable) -- will have at most a few dozen rows.

CREATE TABLE IF NOT EXISTS show_annotations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    category    VARCHAR(100) DEFAULT 'general',
                -- e.g. 'milestone', 'technical', 'audience', 'general'
    tags        TEXT[] DEFAULT '{}',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_time ON show_annotations(time DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_category ON show_annotations(category);
CREATE INDEX IF NOT EXISTS idx_annotations_tags ON show_annotations USING GIN (tags);

CREATE TRIGGER update_annotations_updated_at
    BEFORE UPDATE ON show_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. COLLECTION VERBOSITY CONFIG TABLE
-- =============================================================================
-- Per-entity-type or per-device collection level.
-- Lookup order at runtime: device-specific > entity_type-specific > global.

CREATE TABLE IF NOT EXISTS collection_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type      VARCHAR(50) NOT NULL,       -- 'entity_type', 'device', 'global'
    scope_id        VARCHAR(255),               -- entity_type name or device UUID; NULL for global
    verbosity       VARCHAR(20) NOT NULL DEFAULT 'standard',
                    -- 'minimal'  = skip state history (only metrics/events)
                    -- 'standard' = store state changes + metrics + events
                    -- 'verbose'  = store everything + full previous_state snapshots
    config          JSONB DEFAULT '{}',         -- future: per-metric filters, sample rates
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scope_type, scope_id)
);

CREATE TRIGGER update_collection_config_updated_at
    BEFORE UPDATE ON collection_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed global default
INSERT INTO collection_config (scope_type, scope_id, verbosity)
VALUES ('global', NULL, 'standard')
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- =============================================================================
-- 5. FIX DEVICE_EVENTS RETENTION (30 days -> 90 days)
-- =============================================================================
-- 30 days barely covers a month-long show. Extend to match device_metrics.

SELECT remove_retention_policy('device_events', if_exists => TRUE);
SELECT add_retention_policy('device_events', INTERVAL '90 days', if_not_exists => TRUE);

-- =============================================================================
-- Done
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Maestra Analytics schema initialized: entity_states, show_annotations, collection_config';
END $$;
