-- Show Control System
-- Entity type, singleton entity, schedules, and side effects tables
-- This runs on fresh database creation; for existing databases use migration 015

-- =============================================================================
-- SHOW CONTROL ENTITY TYPE + SINGLETON ENTITY
-- =============================================================================

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

-- =============================================================================
-- SHOW SCHEDULES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS show_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    entries JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_show_schedules_updated_at
    BEFORE UPDATE ON show_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SHOW SIDE EFFECTS TABLE
-- =============================================================================

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

CREATE TRIGGER update_show_side_effects_updated_at
    BEFORE UPDATE ON show_side_effects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default DMX side effects
INSERT INTO show_side_effects (from_phase, to_phase, action_type, action_config, description, sort_order)
VALUES
    ('*', 'shutdown', 'internal_call', '{"function": "dmx_blackout"}', 'Blackout all DMX fixtures on shutdown', 0),
    ('*', 'shutdown', 'internal_call', '{"function": "playback_stop"}', 'Stop DMX sequence playback on shutdown', 1),
    ('active', 'paused', 'internal_call', '{"function": "dmx_pause"}', 'Pause DMX output when show is paused', 0),
    ('paused', 'active', 'internal_call', '{"function": "dmx_resume"}', 'Resume DMX output when show resumes', 0),
    ('*', 'idle', 'internal_call', '{"function": "dmx_resume"}', 'Reset DMX pause state on idle', 0)
ON CONFLICT DO NOTHING;
