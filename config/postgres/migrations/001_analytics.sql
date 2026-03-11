-- Migration 001: Analytics & Entity State History
-- Adds entity_states hypertable, show_annotations, collection_config,
-- continuous aggregates, and fixes device_events retention.
-- Fully idempotent — safe to run on both fresh and existing databases.

-- =============================================================================
-- 1. ENTITY STATE HISTORY HYPERTABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_states (
    time            TIMESTAMPTZ NOT NULL,
    entity_id       UUID NOT NULL,
    entity_slug     VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_path     TEXT,
    state           JSONB NOT NULL DEFAULT '{}',
    previous_state  JSONB DEFAULT '{}',
    changed_keys    TEXT[] DEFAULT '{}',
    source          VARCHAR(255),
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

-- =============================================================================
-- 2. ENTITY STATE CONTINUOUS AGGREGATES
-- =============================================================================

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

CREATE TABLE IF NOT EXISTS show_annotations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    category    VARCHAR(100) DEFAULT 'general',
    tags        TEXT[] DEFAULT '{}',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_time ON show_annotations(time DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_category ON show_annotations(category);
CREATE INDEX IF NOT EXISTS idx_annotations_tags ON show_annotations USING GIN (tags);

DROP TRIGGER IF EXISTS update_annotations_updated_at ON show_annotations;
CREATE TRIGGER update_annotations_updated_at
    BEFORE UPDATE ON show_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. COLLECTION VERBOSITY CONFIG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS collection_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type      VARCHAR(50) NOT NULL,
    scope_id        VARCHAR(255),
    verbosity       VARCHAR(20) NOT NULL DEFAULT 'standard',
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scope_type, scope_id)
);

DROP TRIGGER IF EXISTS update_collection_config_updated_at ON collection_config;
CREATE TRIGGER update_collection_config_updated_at
    BEFORE UPDATE ON collection_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO collection_config (scope_type, scope_id, verbosity)
VALUES ('global', NULL, 'standard')
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- =============================================================================
-- 5. FIX DEVICE_EVENTS RETENTION (30 days -> 90 days)
-- =============================================================================

SELECT remove_retention_policy('device_events', if_exists => TRUE);
SELECT add_retention_policy('device_events', INTERVAL '90 days', if_not_exists => TRUE);
