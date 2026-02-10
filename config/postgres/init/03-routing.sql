-- =============================================================================
-- Maestra Device Routing Tables
-- Signal routing infrastructure for visual device patching
-- =============================================================================

-- Routing Devices: devices that appear in the routing matrix
-- These are separate from fleet "devices" — routing devices represent
-- signal chain equipment (cameras, switchers, monitors, etc.)
CREATE TABLE IF NOT EXISTS routing_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100) NOT NULL,        -- camera, switcher, monitor, audio, ai, storage, output, sync, recorder
    icon VARCHAR(50) DEFAULT '📦',
    color VARCHAR(20) DEFAULT '#6C757D',       -- hex color for UI
    inputs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of port name strings, e.g. ["sdi-in", "hdmi-in"]
    outputs JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of port name strings, e.g. ["sdi-out", "hdmi-out"]
    metadata JSONB DEFAULT '{}'::jsonb,
    position_x FLOAT DEFAULT 0,                -- saved node graph X position
    position_y FLOAT DEFAULT 0,                -- saved node graph Y position
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routing_devices_type ON routing_devices(device_type);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_routing_device_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routing_device_updated
    BEFORE UPDATE ON routing_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_routing_device_timestamp();


-- Routes: connections between device ports
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_device_id UUID NOT NULL REFERENCES routing_devices(id) ON DELETE CASCADE,
    from_port VARCHAR(100) NOT NULL,
    to_device_id UUID NOT NULL REFERENCES routing_devices(id) ON DELETE CASCADE,
    to_port VARCHAR(100) NOT NULL,
    preset_id UUID,  -- NULL = active routing table; non-NULL = belongs to a preset only
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- A port can only receive one input at a time (unless fanout rules override)
    CONSTRAINT uq_route_connection UNIQUE (from_device_id, from_port, to_device_id, to_port, preset_id)
);

CREATE INDEX idx_routes_from ON routes(from_device_id);
CREATE INDEX idx_routes_to ON routes(to_device_id);
CREATE INDEX idx_routes_preset ON routes(preset_id);


-- Route Presets: saved named routing configurations
CREATE TABLE IF NOT EXISTS route_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT FALSE,          -- which preset is currently loaded
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_route_presets_name ON route_presets(name);

-- Add foreign key from routes to presets (deferred because of creation order)
ALTER TABLE routes
    ADD CONSTRAINT fk_routes_preset
    FOREIGN KEY (preset_id) REFERENCES route_presets(id) ON DELETE CASCADE;

-- Trigger: auto-update updated_at on presets
CREATE TRIGGER trg_route_preset_updated
    BEFORE UPDATE ON route_presets
    FOR EACH ROW
    EXECUTE FUNCTION update_routing_device_timestamp();  -- reuse the same timestamp function


-- =============================================================================
-- Seed Data: Default routing devices (matches the original component's DEVICES)
-- =============================================================================

INSERT INTO routing_devices (id, name, device_type, icon, color, inputs, outputs, position_x, position_y, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'RED V-Raptor',         'camera',   '🎬', '#E84855', '[]'::jsonb,                                                        '["sdi-out","hdmi-out","tc-out"]'::jsonb,                       80,   40,  1),
    ('a0000000-0000-0000-0000-000000000002', 'Sony FX6',             'camera',   '🎬', '#E84855', '[]'::jsonb,                                                        '["sdi-out","hdmi-out","tc-out"]'::jsonb,                       80,  200,  2),
    ('a0000000-0000-0000-0000-000000000003', 'BMPCC 6K Pro',         'camera',   '🎬', '#E84855', '[]'::jsonb,                                                        '["sdi-out","hdmi-out"]'::jsonb,                                80,  360,  3),
    ('a0000000-0000-0000-0000-000000000004', 'SmallHD Cine 13',      'monitor',  '🖥',  '#3185FC', '["sdi-in","hdmi-in"]'::jsonb,                                       '["sdi-loop"]'::jsonb,                                         840,   40,  4),
    ('a0000000-0000-0000-0000-000000000005', 'Atomos Ninja V+',      'recorder', '⏺',  '#3185FC', '["hdmi-in","sdi-in"]'::jsonb,                                       '["hdmi-out"]'::jsonb,                                         840,  200,  5),
    ('a0000000-0000-0000-0000-000000000006', 'ATEM Mini Extreme',    'switcher', '🔀', '#35CE8D', '["hdmi-1","hdmi-2","hdmi-3","hdmi-4"]'::jsonb,                       '["pgm-out","aux-out","stream-out"]'::jsonb,                   460,   40,  6),
    ('a0000000-0000-0000-0000-000000000007', 'Sound Devices 888',    'audio',    '🎙', '#F9A620', '["ch-1","ch-2","ch-3","ch-4"]'::jsonb,                               '["mix-L","mix-R","iso-1","iso-2"]'::jsonb,                     80,  520,  7),
    ('a0000000-0000-0000-0000-000000000008', 'Wireless Lav Kit',     'audio',    '📡', '#F9A620', '[]'::jsonb,                                                        '["ch-out"]'::jsonb,                                            80,  680,  8),
    ('a0000000-0000-0000-0000-000000000009', 'Maestra AI Engine',    'ai',       '✦',  '#B56CED', '["video-in","audio-in","data-in"]'::jsonb,                           '["processed-v","processed-a","metadata","llm-out"]'::jsonb,   460,  200,  9),
    ('a0000000-0000-0000-0000-00000000000a', 'NAS / Frame.io',       'storage',  '💾', '#6C757D', '["ingest-1","ingest-2","ingest-3"]'::jsonb,                          '["playback"]'::jsonb,                                         840,  360, 10),
    ('a0000000-0000-0000-0000-00000000000b', 'Live Stream Out',      'output',   '📡', '#FF6B6B', '["stream-in"]'::jsonb,                                               '[]'::jsonb,                                                   840,  520, 11),
    ('a0000000-0000-0000-0000-00000000000c', 'Timecode Generator',   'sync',     '⏱',  '#ADB5BD', '[]'::jsonb,                                                        '["tc-out","genlock"]'::jsonb,                                  80,  840, 12)
ON CONFLICT DO NOTHING;

-- Seed default routes (active routing table, preset_id = NULL)
INSERT INTO routes (from_device_id, from_port, to_device_id, to_port) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'sdi-out',     'a0000000-0000-0000-0000-000000000006', 'hdmi-1'),
    ('a0000000-0000-0000-0000-000000000002', 'sdi-out',     'a0000000-0000-0000-0000-000000000006', 'hdmi-2'),
    ('a0000000-0000-0000-0000-000000000003', 'hdmi-out',    'a0000000-0000-0000-0000-000000000006', 'hdmi-3'),
    ('a0000000-0000-0000-0000-000000000006', 'pgm-out',     'a0000000-0000-0000-0000-000000000004', 'sdi-in'),
    ('a0000000-0000-0000-0000-000000000006', 'aux-out',     'a0000000-0000-0000-0000-000000000009', 'video-in'),
    ('a0000000-0000-0000-0000-000000000006', 'stream-out',  'a0000000-0000-0000-0000-00000000000b', 'stream-in'),
    ('a0000000-0000-0000-0000-000000000008', 'ch-out',      'a0000000-0000-0000-0000-000000000007', 'ch-1'),
    ('a0000000-0000-0000-0000-000000000007', 'mix-L',       'a0000000-0000-0000-0000-000000000009', 'audio-in'),
    ('a0000000-0000-0000-0000-000000000009', 'processed-v', 'a0000000-0000-0000-0000-000000000005', 'hdmi-in'),
    ('a0000000-0000-0000-0000-000000000009', 'metadata',    'a0000000-0000-0000-0000-00000000000a', 'ingest-1'),
    ('a0000000-0000-0000-0000-000000000001', 'hdmi-out',    'a0000000-0000-0000-0000-000000000005', 'sdi-in'),
    ('a0000000-0000-0000-0000-00000000000c', 'tc-out',      'a0000000-0000-0000-0000-000000000007', 'ch-4')
ON CONFLICT DO NOTHING;

-- Done
SELECT 'Routing tables created and seeded' AS status;
