-- Migration 003: Device Discovery & Provisioning
-- Adds tables for zeroconf/mDNS device discovery, approval queue, and provisioning

-- =============================================================================
-- BLOCKED DEVICES
-- =============================================================================

CREATE TABLE IF NOT EXISTS blocked_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_id VARCHAR(255) UNIQUE NOT NULL,
    reason TEXT,
    blocked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_devices_hardware_id ON blocked_devices(hardware_id);

-- =============================================================================
-- DEVICE PROVISIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS device_provisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID UNIQUE NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    env_vars JSONB DEFAULT '{}'::jsonb,
    connection_config JSONB DEFAULT '{}'::jsonb,
    provision_status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, provisioned
    approved_at TIMESTAMPTZ,
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_provisions_device_id ON device_provisions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_provisions_status ON device_provisions(provision_status);

-- Apply the update_updated_at_column trigger (function defined in 01-init-db.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_device_provisions_updated_at'
    ) THEN
        CREATE TRIGGER update_device_provisions_updated_at
            BEFORE UPDATE ON device_provisions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
