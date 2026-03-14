-- Migration 004: Open Fixture Library (OFL) fixture catalog tables
-- Idempotent — safe to run on databases that already have these tables.

-- ============================================================
-- fixture_source enum
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fixture_source') THEN
    CREATE TYPE fixture_source AS ENUM ('ofl', 'custom');
  END IF;
END
$$;

-- ============================================================
-- ofl_manufacturers
-- ============================================================
CREATE TABLE IF NOT EXISTS ofl_manufacturers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  website          TEXT,
  ofl_last_modified DATE,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ofl_fixtures
-- search_vector is a regular tsvector column maintained by trigger
-- (avoids GENERATED ALWAYS AS immutability requirements)
-- ============================================================
CREATE TABLE IF NOT EXISTS ofl_fixtures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_key    TEXT NOT NULL REFERENCES ofl_manufacturers(key) ON DELETE CASCADE,
  fixture_key         TEXT NOT NULL,
  name                TEXT NOT NULL,
  source              fixture_source NOT NULL DEFAULT 'ofl',
  categories          TEXT[] NOT NULL DEFAULT '{}',
  channel_count_min   INT,
  channel_count_max   INT,
  physical            JSONB NOT NULL DEFAULT '{}',
  modes               JSONB NOT NULL DEFAULT '[]',
  ofl_last_modified   DATE,
  ofl_schema_version  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at           TIMESTAMPTZ,
  search_vector       tsvector,
  UNIQUE(manufacturer_key, fixture_key)
);

-- Add search_vector column to ofl_fixtures if missing (idempotent for pre-existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ofl_fixtures' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE ofl_fixtures ADD COLUMN search_vector tsvector;
  END IF;
END
$$;

-- Trigger function to keep search_vector up to date
CREATE OR REPLACE FUNCTION ofl_fixtures_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.name, '') || ' ' ||
      coalesce(NEW.manufacturer_key, '') || ' ' ||
      coalesce(array_to_string(NEW.categories, ' '), '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ofl_fixtures_search_vector ON ofl_fixtures;
CREATE TRIGGER trg_ofl_fixtures_search_vector
  BEFORE INSERT OR UPDATE ON ofl_fixtures
  FOR EACH ROW EXECUTE FUNCTION ofl_fixtures_search_vector_update();

-- GIN index on search_vector for fast full-text queries
CREATE INDEX IF NOT EXISTS ofl_fixtures_search_vector_idx
  ON ofl_fixtures USING GIN (search_vector);

-- GIN index on categories array
CREATE INDEX IF NOT EXISTS ofl_fixtures_categories_idx
  ON ofl_fixtures USING GIN (categories);

-- ============================================================
-- ofl_sync_log
-- ============================================================
CREATE TABLE IF NOT EXISTS ofl_sync_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ofl_commit_sha     TEXT,
  ofl_schema_version TEXT,
  fixtures_added     INT NOT NULL DEFAULT 0,
  fixtures_updated   INT NOT NULL DEFAULT 0,
  fixtures_skipped   INT NOT NULL DEFAULT 0,
  fixtures_errored   INT NOT NULL DEFAULT 0,
  errors             JSONB NOT NULL DEFAULT '[]',
  status             TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed'))
);

-- ============================================================
-- Add ofl_fixture_id to dmx_fixtures (if column missing)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dmx_fixtures' AND column_name = 'ofl_fixture_id'
  ) THEN
    ALTER TABLE dmx_fixtures
      ADD COLUMN ofl_fixture_id UUID REFERENCES ofl_fixtures(id) ON DELETE SET NULL;
  END IF;
END
$$;
