-- DMX settings key-value store
-- Persists runtime-configurable DMX/playback parameters across restarts

CREATE TABLE IF NOT EXISTS dmx_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults (idempotent)
INSERT INTO dmx_settings (key, value) VALUES ('playback_interval_ms', '20')
ON CONFLICT (key) DO NOTHING;
