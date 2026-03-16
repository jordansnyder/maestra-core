-- 011_dmx_lighting_entity.sql
-- Add per-cue/sequence fade settings and create the singleton DMX Lighting entity.

-- 1. Add fade_duration to cues (seconds; 0 = hard cut, matches sidebar default)
ALTER TABLE dmx_cues ADD COLUMN IF NOT EXISTS fade_duration REAL NOT NULL DEFAULT 0;

-- 2. Add fade_out_duration to sequences (seconds; 3 = sidebar default)
ALTER TABLE dmx_sequences ADD COLUMN IF NOT EXISTS fade_out_duration REAL NOT NULL DEFAULT 3;

-- 3. Create dmx_controller entity type (idempotent)
INSERT INTO entity_types (name, display_name, description, icon, state_schema, default_state, metadata)
VALUES (
    'dmx_controller',
    'DMX Controller',
    'Singleton entity representing the DMX lighting system. Its state reflects the current cue and sequence list and can be used to trigger playback via entity state changes.',
    'zap',
    '{"type":"object","properties":{"cues":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"fade_duration":{"type":"number"}}}},"sequences":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"cue_count":{"type":"integer"},"fade_out_duration":{"type":"number"}}}},"active_cue_id":{"type":["string","null"]},"active_sequence_id":{"type":["string","null"]}}}',
    '{"cues":[],"sequences":[],"active_cue_id":null,"active_sequence_id":null}',
    '{"singleton": true}'
)
ON CONFLICT (name) DO NOTHING;

-- 4. Create the singleton DMX Lighting entity (idempotent)
INSERT INTO entities (name, slug, entity_type_id, path, state, metadata, status)
VALUES (
    'DMX Lighting',
    'dmx-lighting',
    (SELECT id FROM entity_types WHERE name = 'dmx_controller'),
    'dmx_lighting',
    '{"cues":[],"sequences":[],"active_cue_id":null,"active_sequence_id":null}',
    '{"dmx_controller": true, "singleton": true, "back_link": "/dmx"}',
    'active'
)
ON CONFLICT (slug) DO NOTHING;
