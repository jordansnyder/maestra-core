-- =============================================================================
-- Maestra Stream Discovery & Session Management
-- Dynamic stream advertisement, negotiation, and session tracking
-- =============================================================================

-- Stream Types: extensible registry of stream categories
CREATE TABLE IF NOT EXISTS stream_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    default_config JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stream_types_name ON stream_types(name);

-- Apply existing update trigger
CREATE TRIGGER update_stream_types_updated_at
    BEFORE UPDATE ON stream_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- Stream Sessions: historical record of all streaming sessions (hypertable)
CREATE TABLE IF NOT EXISTS stream_sessions (
    time TIMESTAMPTZ NOT NULL,
    session_id UUID NOT NULL DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL,
    stream_name VARCHAR(255) NOT NULL,
    stream_type VARCHAR(100) NOT NULL,
    publisher_id VARCHAR(255) NOT NULL,
    publisher_address VARCHAR(255),
    consumer_id VARCHAR(255) NOT NULL,
    consumer_address VARCHAR(255),
    protocol VARCHAR(50) NOT NULL,
    transport_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    ended_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    bytes_transferred BIGINT DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (time, session_id)
);

SELECT create_hypertable('stream_sessions', 'time', if_not_exists => TRUE);

CREATE INDEX idx_stream_sessions_stream ON stream_sessions(stream_id, time DESC);
CREATE INDEX idx_stream_sessions_publisher ON stream_sessions(publisher_id, time DESC);
CREATE INDEX idx_stream_sessions_consumer ON stream_sessions(consumer_id, time DESC);
CREATE INDEX idx_stream_sessions_status ON stream_sessions(status, time DESC);

-- Retention: keep session history for 90 days
SELECT add_retention_policy('stream_sessions', INTERVAL '90 days', if_not_exists => TRUE);


-- =============================================================================
-- Seed Data: Default stream types for creative workflows
-- =============================================================================

INSERT INTO stream_types (name, display_name, description, icon, default_config) VALUES
    ('ndi',     'NDI Video',     'Network Device Interface video stream',                'video',      '{"codec": "h264", "resolution": "1920x1080", "fps": 30}'::jsonb),
    ('audio',   'Audio',         'Real-time audio stream (PCM, encoded)',                 'headphones', '{"sample_rate": 48000, "channels": 2, "format": "float32"}'::jsonb),
    ('video',   'Video',         'Raw or encoded video stream',                           'film',       '{"codec": "h264", "resolution": "1920x1080", "fps": 30}'::jsonb),
    ('texture', 'Texture/Frame', 'GPU texture or frame buffer sharing',                   'image',      '{"format": "rgba8", "width": 1920, "height": 1080}'::jsonb),
    ('sensor',  'Sensor Data',   'Continuous sensor telemetry stream',                    'activity',   '{"rate_hz": 60, "format": "json"}'::jsonb),
    ('osc',     'OSC',           'OpenSoundControl message stream',                       'radio',      '{"rate_hz": 60}'::jsonb),
    ('midi',    'MIDI',          'MIDI note and control change stream',                   'music',      '{}'::jsonb),
    ('data',    'Generic Data',  'Arbitrary structured data stream (JSON, binary)',        'database',   '{"format": "json"}'::jsonb),
    ('srt',     'SRT Video',     'Secure Reliable Transport video stream',                'shield',     '{"latency_ms": 120}'::jsonb),
    ('spout',   'Spout',         'Spout texture sharing (Windows)',                       'monitor',    '{"format": "rgba8"}'::jsonb),
    ('syphon',  'Syphon',        'Syphon texture sharing (macOS)',                        'monitor',    '{"format": "rgba8"}'::jsonb)
ON CONFLICT (name) DO NOTHING;


-- Done
SELECT 'Stream tables created and seeded' AS status;
