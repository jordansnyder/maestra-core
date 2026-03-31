-- Migration 016: Device Hardware Configs
-- Pre-provisionable JSON configuration keyed on hardware_id (MAC address)
-- Configs can exist before a device ever registers via mDNS discovery

CREATE TABLE IF NOT EXISTS device_hardware_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_hardware_configs_hardware_id
    ON device_hardware_configs(hardware_id);

-- Reuse the update_updated_at_column() trigger function from 01-init-db.sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_device_hardware_configs_updated_at'
    ) THEN
        CREATE TRIGGER update_device_hardware_configs_updated_at
            BEFORE UPDATE ON device_hardware_configs
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
