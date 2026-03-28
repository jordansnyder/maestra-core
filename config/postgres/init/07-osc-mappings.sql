-- OSC Mappings table for web-managed OSC address → entity state mappings
-- This runs on fresh database creation; for existing databases use migration 014

CREATE TABLE IF NOT EXISTS osc_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osc_address TEXT NOT NULL,
    entity_slug TEXT NOT NULL,
    state_key TEXT,
    state_keys TEXT[],
    operation TEXT NOT NULL DEFAULT 'update' CHECK (operation IN ('update', 'set')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(osc_address),
    CHECK (NOT (state_key IS NOT NULL AND state_keys IS NOT NULL)),
    CHECK (state_key IS NOT NULL OR state_keys IS NOT NULL)
);

CREATE TRIGGER update_osc_mappings_updated_at
    BEFORE UPDATE ON osc_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
