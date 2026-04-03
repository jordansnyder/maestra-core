-- Migration 018: DMX Groups & Layer System
-- Adds dmx_groups table and group_id FK columns on fixtures, cues, and sequences.
-- All existing rows get group_id = NULL (ungrouped), preserving full backward compatibility.

-- ── Groups table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dmx_groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    color       TEXT,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dmx_groups_sort_order ON dmx_groups (sort_order);

-- ── group_id on fixtures ──────────────────────────────────────────────────────

ALTER TABLE dmx_fixtures
    ADD COLUMN IF NOT EXISTS group_id UUID
        REFERENCES dmx_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dmx_fixtures_group_id ON dmx_fixtures (group_id);

-- ── group_id on cues ──────────────────────────────────────────────────────────

ALTER TABLE dmx_cues
    ADD COLUMN IF NOT EXISTS group_id UUID
        REFERENCES dmx_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dmx_cues_group_id ON dmx_cues (group_id);

-- ── group_id on sequences ─────────────────────────────────────────────────────

ALTER TABLE dmx_sequences
    ADD COLUMN IF NOT EXISTS group_id UUID
        REFERENCES dmx_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dmx_sequences_group_id ON dmx_sequences (group_id);
