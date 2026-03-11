-- Migration 002: Demo Data Seed
-- Seeds demo devices, entities, metrics, and events for a realistic
-- out-of-the-box dashboard experience.
-- Fully idempotent: safe to run multiple times on any database state.
-- Functionally identical to config/postgres/init/06-demo-data.sql.

-- =============================================================================
-- 1. DEMO DEVICES
-- =============================================================================

INSERT INTO devices (id, name, device_type, hardware_id, ip_address, status, last_seen, metadata) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'Gallery Projector',  'media_server', 'demo-projector-001',  '10.0.0.50', 'online',  NOW(), '{"resolution": "4K", "model": "Christie D4K40-RGB", "demo": true}'::jsonb),
    ('d0000000-0000-0000-0000-000000000002', 'Lobby Sensor Hub',   'sensor',       'demo-sensor-001',     '10.0.0.51', 'online',  NOW(), '{"sensors": ["temperature", "humidity", "motion"], "model": "ESP32-S3", "demo": true}'::jsonb),
    ('d0000000-0000-0000-0000-000000000003', 'Stage Controller',   'controller',   'demo-controller-001', '10.0.0.52', 'offline', NULL,  '{"protocol": "artnet", "universe_count": 4, "model": "ETC Eos Ti", "demo": true}'::jsonb)
ON CONFLICT (hardware_id) DO NOTHING;


-- =============================================================================
-- 2. ENTITY TYPES
-- =============================================================================

INSERT INTO entity_types (name, display_name, description, icon, state_schema, default_state, metadata) VALUES
    ('room', 'Room', 'Physical room or area within a space', 'door-open',
     '{"type": "object", "properties": {"occupancy": {"type": "number"}, "ambient_level": {"type": "number"}}}'::jsonb,
     '{"occupancy": 0, "ambient_level": 50}'::jsonb,
     '{}'::jsonb),
    ('light', 'Light', 'Lighting fixture or luminaire', 'lightbulb',
     '{"type": "object", "properties": {"on": {"type": "boolean"}, "brightness": {"type": "number", "minimum": 0, "maximum": 100}, "color": {"type": "string"}}}'::jsonb,
     '{"on": false, "brightness": 0, "color": "#ffffff"}'::jsonb,
     '{}'::jsonb),
    ('sensor', 'Sensor', 'Input sensor (motion, proximity, light, etc.)', 'scan',
     '{"type": "object", "properties": {"temperature": {"type": "number"}, "humidity": {"type": "number"}, "motion": {"type": "boolean"}}}'::jsonb,
     '{"value": 0}'::jsonb,
     '{}'::jsonb),
    ('projector', 'Projector', 'Video projector or large-format display', 'monitor',
     '{"type": "object", "properties": {"on": {"type": "boolean"}, "brightness": {"type": "number"}, "source": {"type": "string"}}}'::jsonb,
     '{"on": false, "brightness": 100, "source": "hdmi-1"}'::jsonb,
     '{}'::jsonb),
    ('controller', 'Controller', 'Software controller or processing node', 'sliders',
     '{"type": "object", "properties": {"mode": {"type": "string"}, "active_scene": {"type": "string"}}}'::jsonb,
     '{}'::jsonb,
     '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;


-- =============================================================================
-- 3. DEMO ENTITIES (hierarchical)
-- =============================================================================

DO $$
DECLARE
    type_room UUID;
    type_light UUID;
    type_sensor UUID;
BEGIN
    SELECT id INTO type_room   FROM entity_types WHERE name = 'room';
    SELECT id INTO type_light  FROM entity_types WHERE name = 'light';
    SELECT id INTO type_sensor FROM entity_types WHERE name = 'sensor';

    IF type_room IS NULL OR type_light IS NULL OR type_sensor IS NULL THEN
        RAISE WARNING 'Demo data: required entity types not found, skipping entity seed';
        RETURN;
    END IF;

    -- Root: Demo Venue
    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000001',
        'Demo Venue', 'demo-venue', type_room, NULL,
        '{"occupancy": 0, "ambient_level": 50}'::jsonb,
        '{"demo": true}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    -- Children of Demo Venue
    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000002',
        'Lobby', 'lobby', type_room,
        'e0000000-0000-0000-0000-000000000001',
        '{"occupancy": 0, "ambient_level": 60}'::jsonb,
        '{"demo": true}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000003',
        'Gallery', 'gallery', type_room,
        'e0000000-0000-0000-0000-000000000001',
        '{"occupancy": 0, "ambient_level": 45}'::jsonb,
        '{"demo": true}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000004',
        'Stage', 'stage', type_room,
        'e0000000-0000-0000-0000-000000000001',
        '{"occupancy": 0, "ambient_level": 30}'::jsonb,
        '{"demo": true}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    -- Leaf: Gallery Light 1 (child of Gallery)
    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000005',
        'Gallery Light 1', 'gallery-light-1', type_light,
        'e0000000-0000-0000-0000-000000000003',
        '{"on": true, "brightness": 75, "color": "#e2c4ff"}'::jsonb,
        '{"demo": true, "fixture": "ETC Source Four LED"}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    -- Leaf: Lobby Temp Sensor (child of Lobby)
    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES (
        'e0000000-0000-0000-0000-000000000006',
        'Lobby Temp Sensor', 'lobby-temp-sensor', type_sensor,
        'e0000000-0000-0000-0000-000000000002',
        '{"temperature": 22.5, "humidity": 45.0, "motion": false}'::jsonb,
        '{"demo": true, "hardware": "DHT22 + PIR"}'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

END $$;


-- =============================================================================
-- 4. HISTORICAL DEVICE METRICS (24 hours, 5-minute intervals)
-- =============================================================================

DO $$
DECLARE
    existing_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO existing_count
    FROM device_metrics
    WHERE device_id = 'd0000000-0000-0000-0000-000000000001'
      AND metric_name = 'temperature'
      AND time > NOW() - INTERVAL '25 hours';

    IF existing_count > 0 THEN
        RAISE NOTICE 'Demo metrics already seeded, skipping';
        RETURN;
    END IF;

    -- Temperature: sine-wave pattern 20-25C
    INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
    SELECT
        ts,
        device_id,
        'temperature',
        22.5 + 2.5 * SIN(EXTRACT(EPOCH FROM ts) * 2 * PI() / 21600) + (RANDOM() - 0.5) * 0.5,
        'celsius',
        jsonb_build_object('source', 'demo', 'device_name', device_name)
    FROM generate_series(
        NOW() - INTERVAL '24 hours',
        NOW() - INTERVAL '5 minutes',
        INTERVAL '5 minutes'
    ) AS ts
    CROSS JOIN (VALUES
        ('d0000000-0000-0000-0000-000000000001'::uuid, 'Gallery Projector'),
        ('d0000000-0000-0000-0000-000000000002'::uuid, 'Lobby Sensor Hub'),
        ('d0000000-0000-0000-0000-000000000003'::uuid, 'Stage Controller')
    ) AS d(device_id, device_name);

    -- CPU percent: bounded random walk 15-65%
    INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
    SELECT
        ts,
        device_id,
        'cpu_percent',
        GREATEST(15, LEAST(65,
            40 + 15 * SIN(EXTRACT(EPOCH FROM ts) * 2 * PI() / 14400)
               + (RANDOM() - 0.5) * 20
        )),
        'percent',
        jsonb_build_object('source', 'demo', 'device_name', device_name)
    FROM generate_series(
        NOW() - INTERVAL '24 hours',
        NOW() - INTERVAL '5 minutes',
        INTERVAL '5 minutes'
    ) AS ts
    CROSS JOIN (VALUES
        ('d0000000-0000-0000-0000-000000000001'::uuid, 'Gallery Projector'),
        ('d0000000-0000-0000-0000-000000000002'::uuid, 'Lobby Sensor Hub'),
        ('d0000000-0000-0000-0000-000000000003'::uuid, 'Stage Controller')
    ) AS d(device_id, device_name);

    -- Memory percent: slowly varying 40-70%
    INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
    SELECT
        ts,
        device_id,
        'memory_percent',
        GREATEST(40, LEAST(70,
            55 + 10 * SIN(EXTRACT(EPOCH FROM ts) * 2 * PI() / 43200)
               + (RANDOM() - 0.5) * 8
        )),
        'percent',
        jsonb_build_object('source', 'demo', 'device_name', device_name)
    FROM generate_series(
        NOW() - INTERVAL '24 hours',
        NOW() - INTERVAL '5 minutes',
        INTERVAL '5 minutes'
    ) AS ts
    CROSS JOIN (VALUES
        ('d0000000-0000-0000-0000-000000000001'::uuid, 'Gallery Projector'),
        ('d0000000-0000-0000-0000-000000000002'::uuid, 'Lobby Sensor Hub'),
        ('d0000000-0000-0000-0000-000000000003'::uuid, 'Stage Controller')
    ) AS d(device_id, device_name);

    RAISE NOTICE 'Demo device metrics seeded (24h x 3 devices x 3 metrics)';
END $$;


-- =============================================================================
-- 5. HISTORICAL DEVICE EVENTS (20 events over 24 hours)
-- =============================================================================

DO $$
DECLARE
    existing_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO existing_count
    FROM device_events
    WHERE device_id = 'd0000000-0000-0000-0000-000000000001'
      AND time > NOW() - INTERVAL '25 hours'
      AND data @> '{"source": "demo"}'::jsonb;

    IF existing_count > 0 THEN
        RAISE NOTICE 'Demo events already seeded, skipping';
        RETURN;
    END IF;

    INSERT INTO device_events (time, device_id, event_type, severity, message, data) VALUES
        (NOW() - INTERVAL '23 hours',  'd0000000-0000-0000-0000-000000000001', 'connection',        'info',    'Gallery Projector connected to network',           '{"source": "demo", "ip": "10.0.0.50"}'::jsonb),
        (NOW() - INTERVAL '22 hours',  'd0000000-0000-0000-0000-000000000002', 'connection',        'info',    'Lobby Sensor Hub connected to network',             '{"source": "demo", "ip": "10.0.0.51"}'::jsonb),
        (NOW() - INTERVAL '21 hours',  'd0000000-0000-0000-0000-000000000001', 'heartbeat',         'info',    'Heartbeat received from Gallery Projector',         '{"source": "demo", "uptime_hours": 1}'::jsonb),
        (NOW() - INTERVAL '20 hours',  'd0000000-0000-0000-0000-000000000002', 'heartbeat',         'info',    'Heartbeat received from Lobby Sensor Hub',          '{"source": "demo", "uptime_hours": 2}'::jsonb),
        (NOW() - INTERVAL '19 hours',  'd0000000-0000-0000-0000-000000000003', 'connection',        'info',    'Stage Controller connected to network',             '{"source": "demo", "ip": "10.0.0.52"}'::jsonb),
        (NOW() - INTERVAL '18 hours',  'd0000000-0000-0000-0000-000000000001', 'config_change',     'info',    'Resolution changed to 4K DCI',                      '{"source": "demo", "setting": "resolution", "value": "4096x2160"}'::jsonb),
        (NOW() - INTERVAL '16 hours',  'd0000000-0000-0000-0000-000000000002', 'temperature_alert', 'warning', 'Temperature above threshold: 26.2C',                '{"source": "demo", "threshold": 26, "value": 26.2}'::jsonb),
        (NOW() - INTERVAL '15 hours',  'd0000000-0000-0000-0000-000000000001', 'heartbeat',         'info',    'Heartbeat received from Gallery Projector',         '{"source": "demo", "uptime_hours": 8}'::jsonb),
        (NOW() - INTERVAL '14 hours',  'd0000000-0000-0000-0000-000000000003', 'config_change',     'info',    'Active scene changed to scene_02',                  '{"source": "demo", "setting": "active_scene", "value": "scene_02"}'::jsonb),
        (NOW() - INTERVAL '12 hours',  'd0000000-0000-0000-0000-000000000002', 'heartbeat',         'info',    'Heartbeat received from Lobby Sensor Hub',          '{"source": "demo", "uptime_hours": 10}'::jsonb),
        (NOW() - INTERVAL '11 hours',  'd0000000-0000-0000-0000-000000000001', 'temperature_alert', 'warning', 'Projector internal temp elevated: 45C',             '{"source": "demo", "threshold": 42, "value": 45}'::jsonb),
        (NOW() - INTERVAL '10 hours',  'd0000000-0000-0000-0000-000000000003', 'heartbeat',         'info',    'Heartbeat received from Stage Controller',          '{"source": "demo", "uptime_hours": 11}'::jsonb),
        (NOW() - INTERVAL '8 hours',   'd0000000-0000-0000-0000-000000000001', 'heartbeat',         'info',    'Heartbeat received from Gallery Projector',         '{"source": "demo", "uptime_hours": 15}'::jsonb),
        (NOW() - INTERVAL '7 hours',   'd0000000-0000-0000-0000-000000000002', 'temperature_alert', 'warning', 'Humidity above threshold: 72%',                     '{"source": "demo", "threshold": 70, "value": 72}'::jsonb),
        (NOW() - INTERVAL '6 hours',   'd0000000-0000-0000-0000-000000000003', 'connection',        'warning', 'Stage Controller connection lost briefly',           '{"source": "demo", "downtime_seconds": 15}'::jsonb),
        (NOW() - INTERVAL '5 hours',   'd0000000-0000-0000-0000-000000000003', 'connection',        'info',    'Stage Controller reconnected',                      '{"source": "demo", "ip": "10.0.0.52"}'::jsonb),
        (NOW() - INTERVAL '4 hours',   'd0000000-0000-0000-0000-000000000001', 'config_change',     'info',    'Lens shift calibration updated',                    '{"source": "demo", "setting": "lens_shift", "h": -2.1, "v": 1.5}'::jsonb),
        (NOW() - INTERVAL '3 hours',   'd0000000-0000-0000-0000-000000000002', 'heartbeat',         'info',    'Heartbeat received from Lobby Sensor Hub',          '{"source": "demo", "uptime_hours": 19}'::jsonb),
        (NOW() - INTERVAL '2 hours',   'd0000000-0000-0000-0000-000000000001', 'heartbeat',         'info',    'Heartbeat received from Gallery Projector',         '{"source": "demo", "uptime_hours": 21}'::jsonb),
        (NOW() - INTERVAL '1 hour',    'd0000000-0000-0000-0000-000000000003', 'config_change',     'info',    'Stage Controller set to standby mode',              '{"source": "demo", "setting": "mode", "value": "standby"}'::jsonb)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Demo device events seeded (20 events over 24h)';
END $$;


-- =============================================================================
-- Done
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 002: Demo data seeded successfully';
END $$;
