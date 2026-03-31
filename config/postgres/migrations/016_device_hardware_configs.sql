-- Migration 016: Device Configuration Column
-- Adds a configuration JSONB column to the devices table
-- and drops the separate device_hardware_configs table (if it exists)

-- Add configuration column to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Drop the separate table (created by an earlier version of this migration)
DROP TABLE IF EXISTS device_hardware_configs;
