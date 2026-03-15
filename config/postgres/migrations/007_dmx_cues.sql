-- Migration 007: DMX Cues
-- Named snapshots of the full DMX fixture state for one-click recall.

CREATE TABLE IF NOT EXISTS dmx_cues (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-fixture state rows for each cue; cascade-deleted with the parent cue.
-- fixture_id and entity_id are stored for recall but are NOT foreign keys —
-- fixtures/entities may be deleted after the cue is saved; recall skips missing ones.
CREATE TABLE IF NOT EXISTS dmx_cue_fixtures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cue_id      UUID NOT NULL REFERENCES dmx_cues(id) ON DELETE CASCADE,
    fixture_id  TEXT NOT NULL,   -- dmx_fixtures.id at snapshot time (informational)
    entity_id   TEXT NOT NULL,   -- entities.id — used for recall
    state       JSONB NOT NULL   -- {channel_key: 0-255} snapshot
);

CREATE INDEX IF NOT EXISTS idx_dmx_cue_fixtures_cue    ON dmx_cue_fixtures (cue_id);
CREATE INDEX IF NOT EXISTS idx_dmx_cue_fixtures_entity ON dmx_cue_fixtures (entity_id);

-- Reuse the trigger function from migration 003
DROP TRIGGER IF EXISTS trg_dmx_cues_updated_at ON dmx_cues;
CREATE TRIGGER trg_dmx_cues_updated_at
    BEFORE UPDATE ON dmx_cues
    FOR EACH ROW EXECUTE FUNCTION update_dmx_updated_at();
