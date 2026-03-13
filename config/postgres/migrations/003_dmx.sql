-- Migration: 003_dmx
-- Art-Net nodes (hardware DMX converters) and DMX fixtures (logical fixture map)

-- ── Art-Net Nodes ─────────────────────────────────────────────────────────────
-- Represents a physical Art-Net to DMX512 converter on the network.
-- Each node can host N universes across its physical DMX output ports.

CREATE TABLE IF NOT EXISTS dmx_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    manufacturer    VARCHAR(255),
    model           VARCHAR(255),
    ip_address      VARCHAR(45) NOT NULL,
    mac_address     VARCHAR(17),
    artnet_port     INTEGER NOT NULL DEFAULT 6454,
    -- universe_count is the total number of Art-Net universes this node supports
    universe_count  INTEGER NOT NULL DEFAULT 4,
    -- universes is an ordered array of universe config objects:
    --   [{id: 1, artnet_universe: 0, port_label: "Port 1", description: "Stage Left"}]
    universes       JSONB NOT NULL DEFAULT '[]'::jsonb,
    poe_powered     BOOLEAN NOT NULL DEFAULT false,
    firmware_version VARCHAR(100),
    notes           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dmx_nodes_ip ON dmx_nodes (ip_address);

-- ── DMX Fixtures ──────────────────────────────────────────────────────────────
-- Represents a single DMX fixture assigned to an Art-Net node universe.
-- Position (x, y) is stored so the canvas layout is persistent.

CREATE TABLE IF NOT EXISTS dmx_fixtures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    label           VARCHAR(255),
    manufacturer    VARCHAR(255),
    model           VARCHAR(255),
    -- Which Art-Net node this fixture lives on
    node_id         UUID NOT NULL REFERENCES dmx_nodes(id) ON DELETE RESTRICT,
    -- Maestra universe number (matches universe.id in dmx_nodes.universes)
    universe        INTEGER NOT NULL,
    -- DMX start address (1–512)
    start_channel   INTEGER NOT NULL CHECK (start_channel BETWEEN 1 AND 512),
    channel_count   INTEGER NOT NULL DEFAULT 1,
    -- Fixture personality / mode label (e.g. "15ch", "8ch", "standard")
    fixture_mode    VARCHAR(50),
    -- Maps variable names to DMX channel offsets and types
    -- {variable_name: {offset: int, type: str, enum_dmx_values?: dict}}
    channel_map     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Optional link to a Maestra entity for state-driven control
    entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
    -- Canvas position (pixels from top-left of the canvas area)
    position_x      DOUBLE PRECISION NOT NULL DEFAULT 100,
    position_y      DOUBLE PRECISION NOT NULL DEFAULT 100,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dmx_fixtures_node ON dmx_fixtures (node_id);
CREATE INDEX IF NOT EXISTS idx_dmx_fixtures_entity ON dmx_fixtures (entity_id);

-- updated_at trigger (reuse pattern from other tables if function exists)
CREATE OR REPLACE FUNCTION update_dmx_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dmx_nodes_updated_at ON dmx_nodes;
CREATE TRIGGER trg_dmx_nodes_updated_at
    BEFORE UPDATE ON dmx_nodes
    FOR EACH ROW EXECUTE FUNCTION update_dmx_updated_at();

DROP TRIGGER IF EXISTS trg_dmx_fixtures_updated_at ON dmx_fixtures;
CREATE TRIGGER trg_dmx_fixtures_updated_at
    BEFORE UPDATE ON dmx_fixtures
    FOR EACH ROW EXECUTE FUNCTION update_dmx_updated_at();
