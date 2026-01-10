-- Maestra Entity State Management Schema
-- Hierarchical entities with persistent JSON state

-- Enable ltree extension for efficient hierarchical queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- =============================================================================
-- ENTITY TYPE DEFINITIONS
-- =============================================================================

-- Entity types - Extensible type registry
CREATE TABLE IF NOT EXISTS entity_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    state_schema JSONB,  -- Optional JSON Schema for validating state
    default_state JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_types_name ON entity_types(name);

-- =============================================================================
-- ENTITIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    entity_type_id UUID NOT NULL REFERENCES entity_types(id),

    -- Hierarchy (optional parent)
    parent_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    path LTREE,

    -- State (current only)
    state JSONB DEFAULT '{}',
    state_updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Status
    status VARCHAR(50) DEFAULT 'active',

    -- Metadata
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Optional device linkage
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT entities_name_parent_unique UNIQUE (name, parent_id)
);

-- Indexes
CREATE INDEX idx_entities_type ON entities(entity_type_id);
CREATE INDEX idx_entities_parent ON entities(parent_id);
CREATE INDEX idx_entities_path ON entities USING GIST (path);
CREATE INDEX idx_entities_slug ON entities(slug);
CREATE INDEX idx_entities_status ON entities(status);
CREATE INDEX idx_entities_tags ON entities USING GIN (tags);
CREATE INDEX idx_entities_state ON entities USING GIN (state);
CREATE INDEX idx_entities_device ON entities(device_id);

-- =============================================================================
-- ENTITY SUBSCRIPTIONS (Optional - for tracking subscribers)
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    subscriber_id VARCHAR(255) NOT NULL,
    subscriber_type VARCHAR(50) NOT NULL,
    protocol VARCHAR(20) NOT NULL,
    filter_paths TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, subscriber_id)
);

CREATE INDEX idx_entity_subs_entity ON entity_subscriptions(entity_id);
CREATE INDEX idx_entity_subs_subscriber ON entity_subscriptions(subscriber_id);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update state_updated_at when state changes
CREATE OR REPLACE FUNCTION update_entity_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state IS DISTINCT FROM OLD.state THEN
        NEW.state_updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_state_timestamp
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_entity_state_timestamp();

-- Generate slug from name if not provided
CREATE OR REPLACE FUNCTION generate_entity_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug = LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        -- Ensure uniqueness by appending random suffix if needed
        WHILE EXISTS (SELECT 1 FROM entities WHERE slug = NEW.slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
            NEW.slug = NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_slug_generate
    BEFORE INSERT OR UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION generate_entity_slug();

-- Auto-update path when parent changes
CREATE OR REPLACE FUNCTION update_entity_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path LTREE;
    safe_slug TEXT;
BEGIN
    -- Convert slug to ltree-safe format (only alphanumeric and underscore)
    safe_slug = REGEXP_REPLACE(NEW.slug, '[^a-zA-Z0-9]', '_', 'g');

    IF NEW.parent_id IS NULL THEN
        NEW.path = text2ltree(safe_slug);
    ELSE
        SELECT path INTO parent_path FROM entities WHERE id = NEW.parent_id;
        IF parent_path IS NOT NULL THEN
            NEW.path = parent_path || text2ltree(safe_slug);
        ELSE
            NEW.path = text2ltree(safe_slug);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_path_update
    BEFORE INSERT OR UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_entity_path();

-- Recursively update children paths when parent path changes
CREATE OR REPLACE FUNCTION update_children_paths()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.path IS DISTINCT FROM NEW.path THEN
        UPDATE entities
        SET parent_id = parent_id  -- Trigger path recalculation
        WHERE parent_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_children_path_update
    AFTER UPDATE ON entities
    FOR EACH ROW
    WHEN (OLD.path IS DISTINCT FROM NEW.path)
    EXECUTE FUNCTION update_children_paths();

-- Apply updated_at trigger
CREATE TRIGGER update_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entity_types_updated_at
    BEFORE UPDATE ON entity_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DEFAULT ENTITY TYPES
-- =============================================================================

INSERT INTO entity_types (name, display_name, description, icon, default_state) VALUES
    ('space', 'Space', 'Top-level physical or conceptual space (building, venue, campus)', 'building', '{}'),
    ('room', 'Room', 'Physical room or area within a space', 'door-open', '{}'),
    ('zone', 'Zone', 'Logical zone within a room (stage area, seating, etc.)', 'grid-3x3', '{}'),
    ('installation', 'Installation', 'Art installation or interactive experience', 'sparkles', '{}'),
    ('device', 'Device', 'Physical hardware device', 'cpu', '{"power": "off"}'),
    ('sensor', 'Sensor', 'Input sensor (motion, proximity, light, etc.)', 'scan', '{"value": 0}'),
    ('actuator', 'Actuator', 'Output actuator (light, motor, speaker, etc.)', 'zap', '{"active": false}'),
    ('controller', 'Controller', 'Software controller or processing node', 'sliders', '{}'),
    ('media', 'Media', 'Media player, display, or projection', 'monitor', '{"playing": false}'),
    ('group', 'Group', 'Logical grouping of entities', 'layers', '{}')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- HELPER FUNCTIONS FOR HIERARCHY QUERIES
-- =============================================================================

-- Get all ancestors of an entity
CREATE OR REPLACE FUNCTION get_entity_ancestors(entity_uuid UUID)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    slug VARCHAR(255),
    entity_type_id UUID,
    parent_id UUID,
    path LTREE,
    depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE ancestors AS (
        SELECT e.id, e.name, e.slug, e.entity_type_id, e.parent_id, e.path, 0 as depth
        FROM entities e
        WHERE e.id = (SELECT parent_id FROM entities WHERE id = entity_uuid)

        UNION ALL

        SELECT e.id, e.name, e.slug, e.entity_type_id, e.parent_id, e.path, a.depth + 1
        FROM entities e
        INNER JOIN ancestors a ON e.id = a.parent_id
    )
    SELECT * FROM ancestors ORDER BY depth DESC;
END;
$$ LANGUAGE plpgsql;

-- Get all descendants of an entity
CREATE OR REPLACE FUNCTION get_entity_descendants(entity_uuid UUID, max_depth INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    slug VARCHAR(255),
    entity_type_id UUID,
    parent_id UUID,
    path LTREE,
    depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        SELECT e.id, e.name, e.slug, e.entity_type_id, e.parent_id, e.path, 1 as depth
        FROM entities e
        WHERE e.parent_id = entity_uuid

        UNION ALL

        SELECT e.id, e.name, e.slug, e.entity_type_id, e.parent_id, e.path, d.depth + 1
        FROM entities e
        INNER JOIN descendants d ON e.parent_id = d.id
        WHERE d.depth < max_depth
    )
    SELECT * FROM descendants ORDER BY path;
END;
$$ LANGUAGE plpgsql;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Maestra Entity State Management schema initialized successfully';
END $$;
