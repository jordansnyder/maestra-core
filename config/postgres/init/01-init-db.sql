-- Maestra Database Initialization Script
-- Creates the schema for device/fleet management and telemetry

-- Enable TimescaleDB extension for time-series data
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- DEVICE MANAGEMENT TABLES
-- =============================================================================

-- Devices table - Registry of all connected devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100) NOT NULL, -- 'arduino', 'raspberry_pi', 'esp32', 'touchdesigner', 'max_msp', etc.
    hardware_id VARCHAR(255) UNIQUE NOT NULL, -- MAC address, serial number, etc.
    firmware_version VARCHAR(50),
    ip_address INET,
    location JSONB, -- Flexible location data
    metadata JSONB, -- Custom device metadata
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline', 'error', 'maintenance'
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_type ON devices(device_type);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_hardware_id ON devices(hardware_id);

-- Device Groups/Fleets - Logical grouping of devices
CREATE TABLE IF NOT EXISTS device_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many relationship between devices and groups
CREATE TABLE IF NOT EXISTS device_group_members (
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (device_id, group_id)
);

-- =============================================================================
-- DEVICE TELEMETRY & METRICS (Time-Series Data)
-- =============================================================================

-- Device metrics - Time-series telemetry data
CREATE TABLE IF NOT EXISTS device_metrics (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DOUBLE PRECISION,
    unit VARCHAR(50),
    tags JSONB, -- Additional metric tags/dimensions
    PRIMARY KEY (time, device_id, metric_name)
);

-- Convert to TimescaleDB hypertable for efficient time-series queries
SELECT create_hypertable('device_metrics', 'time', if_not_exists => TRUE);

-- Create index for efficient metric queries
CREATE INDEX IF NOT EXISTS idx_device_metrics_device_id_time
    ON device_metrics (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_device_metrics_name_time
    ON device_metrics (metric_name, time DESC);

-- Device events - Discrete events and state changes
CREATE TABLE IF NOT EXISTS device_events (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'
    message TEXT,
    data JSONB,
    PRIMARY KEY (time, device_id, event_type)
);

SELECT create_hypertable('device_events', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_device_events_device_id_time
    ON device_events (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_device_events_severity_time
    ON device_events (severity, time DESC);

-- =============================================================================
-- CONFIGURATION MANAGEMENT
-- =============================================================================

-- Device configurations - Store and version device configs
CREATE TABLE IF NOT EXISTS device_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    configuration JSONB NOT NULL,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),
    UNIQUE(device_id, version)
);

CREATE INDEX idx_device_configs_device_id ON device_configurations(device_id);

-- =============================================================================
-- EXPERIENCE DEFINITIONS (Visual Programming Flows)
-- =============================================================================

-- Experiences - Store Node-RED flows and experience definitions
CREATE TABLE IF NOT EXISTS experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_definition JSONB NOT NULL, -- Node-RED flow JSON
    version INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'archived'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_experiences_status ON experiences(status);

-- Experience deployments - Track which devices are running which experiences
CREATE TABLE IF NOT EXISTS experience_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experience_id UUID REFERENCES experiences(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    deployed_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'deployed', 'running', 'stopped', 'failed'
    UNIQUE(experience_id, device_id)
);

-- =============================================================================
-- SDK USAGE & ANALYTICS
-- =============================================================================

-- SDK connections - Track SDK client connections
CREATE TABLE IF NOT EXISTS sdk_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sdk_type VARCHAR(100) NOT NULL, -- 'touchdesigner', 'max_msp', 'unreal', 'web', etc.
    sdk_version VARCHAR(50),
    client_id VARCHAR(255) NOT NULL,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    metadata JSONB
);

CREATE INDEX idx_sdk_connections_type ON sdk_connections(sdk_type);
CREATE INDEX idx_sdk_connections_connected_at ON sdk_connections(connected_at DESC);

-- =============================================================================
-- USERS & AUTHENTICATION (Basic structure for future expansion)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- For local auth
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user', 'viewer'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_groups_updated_at BEFORE UPDATE ON device_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_experiences_updated_at BEFORE UPDATE ON experiences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- DATA RETENTION POLICIES (TimescaleDB)
-- =============================================================================

-- Automatically drop metric data older than 90 days
SELECT add_retention_policy('device_metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- Automatically drop events older than 30 days
SELECT add_retention_policy('device_events', INTERVAL '30 days', if_not_exists => TRUE);

-- =============================================================================
-- CONTINUOUS AGGREGATES (Pre-compute common queries)
-- =============================================================================

-- Hourly device metrics rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS device_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    metric_name,
    AVG(metric_value) as avg_value,
    MAX(metric_value) as max_value,
    MIN(metric_value) as min_value,
    COUNT(*) as sample_count
FROM device_metrics
GROUP BY bucket, device_id, metric_name
WITH NO DATA;

-- Daily device metrics rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS device_metrics_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    device_id,
    metric_name,
    AVG(metric_value) as avg_value,
    MAX(metric_value) as max_value,
    MIN(metric_value) as min_value,
    COUNT(*) as sample_count
FROM device_metrics
GROUP BY bucket, device_id, metric_name
WITH NO DATA;

-- Refresh policies for continuous aggregates
SELECT add_continuous_aggregate_policy('device_metrics_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('device_metrics_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE);

-- =============================================================================
-- SEED DATA (Development/Testing)
-- =============================================================================

-- Insert default admin user
INSERT INTO users (username, email, role)
VALUES ('admin', 'admin@maestra.local', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default device group
INSERT INTO device_groups (name, description)
VALUES ('default', 'Default device group')
ON CONFLICT (name) DO NOTHING;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Maestra database initialized successfully';
END $$;
