-- Migration 015: Show Control System
-- Adds show_control entity type, singleton show entity, schedules, and side effects tables

-- 1. Create show_control entity type (idempotent)
INSERT INTO entity_types (name, display_name, description, icon, state_schema, default_state, metadata)
VALUES (
    'show_control',
    'Show Control',
    'Singleton entity representing the show lifecycle. State reflects the current show phase (idle, pre_show, active, paused, post_show, shutdown).',
    'play',
    '{"type":"object","properties":{"phase":{"type":"string","enum":["idle","pre_show","active","paused","post_show","shutdown"]},"previous_phase":{"type":["string","null"]},"transition_time":{"type":"string"},"source":{"type":["string","null"]},"context":{"type":"object"}}}',
    '{"phase":"idle","previous_phase":null,"transition_time":null,"source":null,"context":{}}',
    '{"singleton": true, "back_link": "/show-control"}'
)
ON CONFLICT (name) DO NOTHING;

-- 2. Create singleton Show entity (idempotent)
INSERT INTO entities (name, slug, entity_type_id, path, state, metadata, status)
VALUES (
    'Show',
    'show',
    (SELECT id FROM entity_types WHERE name = 'show_control'),
    'show',
    '{"phase":"idle","previous_phase":null,"transition_time":null,"source":null,"context":{}}',
    '{"show_control": true, "singleton": true, "back_link": "/show-control"}',
    'active'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Create show_schedules table
CREATE TABLE IF NOT EXISTS show_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    entries JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reuse the update_updated_at_column() trigger function from 01-init-db.sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_show_schedules_updated_at'
    ) THEN
        CREATE TRIGGER update_show_schedules_updated_at
            BEFORE UPDATE ON show_schedules
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- 4. Create show_side_effects table
CREATE TABLE IF NOT EXISTS show_side_effects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_phase VARCHAR(50) NOT NULL,
    to_phase VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('entity_state_update', 'nats_publish', 'internal_call')),
    action_config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_show_side_effects_updated_at'
    ) THEN
        CREATE TRIGGER update_show_side_effects_updated_at
            BEFORE UPDATE ON show_side_effects
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- 5. Seed default DMX side effects (idempotent via from_phase+to_phase+action_config check)
INSERT INTO show_side_effects (from_phase, to_phase, action_type, action_config, description, sort_order)
SELECT v.from_phase, v.to_phase, v.action_type, v.action_config::jsonb, v.description, v.sort_order
FROM (VALUES
    ('*', 'shutdown', 'internal_call', '{"function": "dmx_blackout"}', 'Blackout all DMX fixtures on shutdown', 0),
    ('*', 'shutdown', 'internal_call', '{"function": "playback_stop"}', 'Stop DMX sequence playback on shutdown', 1),
    ('active', 'paused', 'internal_call', '{"function": "dmx_pause"}', 'Pause DMX output when show is paused', 0),
    ('paused', 'active', 'internal_call', '{"function": "dmx_resume"}', 'Resume DMX output when show resumes', 0),
    ('*', 'idle', 'internal_call', '{"function": "dmx_resume"}', 'Reset DMX pause state on idle', 0)
) AS v(from_phase, to_phase, action_type, action_config, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM show_side_effects LIMIT 1);
