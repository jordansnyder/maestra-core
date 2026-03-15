-- Migration 009: DMX Sequences
-- Ordered lists of cue placements with per-cue transition and hold timing.

CREATE TABLE IF NOT EXISTS dmx_sequences (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each row is one cue slot inside a sequence.
-- ON DELETE CASCADE for sequence_id (sequence deleted → placements gone).
-- ON DELETE CASCADE for cue_id (cue deleted → removed from all sequences).
CREATE TABLE IF NOT EXISTS dmx_sequence_cues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id     UUID NOT NULL REFERENCES dmx_sequences(id) ON DELETE CASCADE,
    cue_id          UUID NOT NULL REFERENCES dmx_cues(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    transition_time FLOAT   NOT NULL DEFAULT 0,   -- seconds; 0 = hard cut
    hold_duration   FLOAT   NOT NULL DEFAULT 5    -- seconds to hold before advancing
);

CREATE INDEX IF NOT EXISTS idx_dmx_seq_cues_seq ON dmx_sequence_cues (sequence_id, position);

DROP TRIGGER IF EXISTS trg_dmx_sequences_updated_at ON dmx_sequences;
CREATE TRIGGER trg_dmx_sequences_updated_at
    BEFORE UPDATE ON dmx_sequences
    FOR EACH ROW EXECUTE FUNCTION update_dmx_updated_at();
