-- Migration 022: Demo DMX rig
-- Seeds a complete, hardware-free DMX demo: one Art-Net node (linked to the
-- demo "Stage Controller" device when present), 8 fixtures with explicit
-- channel maps (no OFL dependency), 8 linked light entities, one group,
-- 4 cues with full snapshots, and one looping-friendly sequence.
-- Playback is fully server-side, so cue fades and sequence transport work
-- with no physical Art-Net hardware on the network.
-- Fully idempotent: fixed UUIDs + ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
    type_light UUID;
    demo_device UUID;
    parent_stage UUID;

    node_id   CONSTANT UUID := 'dd000000-0000-0000-0000-000000000001';
    group_id  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000010';

    -- Fixtures
    fx_wash1  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000101';
    fx_wash2  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000102';
    fx_wash3  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000103';
    fx_wash4  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000104';
    fx_spotl  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000105';
    fx_spotr  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000106';
    fx_house1 CONSTANT UUID := 'dd000000-0000-0000-0000-000000000107';
    fx_house2 CONSTANT UUID := 'dd000000-0000-0000-0000-000000000108';

    -- Entities (linked one-to-one with fixtures)
    en_wash1  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000101';
    en_wash2  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000102';
    en_wash3  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000103';
    en_wash4  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000104';
    en_spotl  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000105';
    en_spotr  CONSTANT UUID := 'ed000000-0000-0000-0000-000000000106';
    en_house1 CONSTANT UUID := 'ed000000-0000-0000-0000-000000000107';
    en_house2 CONSTANT UUID := 'ed000000-0000-0000-0000-000000000108';

    -- Cues
    cue_warm   CONSTANT UUID := 'dd000000-0000-0000-0000-000000000201';
    cue_blue   CONSTANT UUID := 'dd000000-0000-0000-0000-000000000202';
    cue_sunset CONSTANT UUID := 'dd000000-0000-0000-0000-000000000203';
    cue_black  CONSTANT UUID := 'dd000000-0000-0000-0000-000000000204';

    seq_loop   CONSTANT UUID := 'dd000000-0000-0000-0000-000000000301';

    -- Channel maps (native format: offsets are 1-based, values 0.0-1.0)
    map_wash  CONSTANT JSONB := '{
        "dimmer": {"offset": 1, "type": "range", "label": "Dimmer", "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "red":    {"offset": 2, "type": "range", "label": "Red",    "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "green":  {"offset": 3, "type": "range", "label": "Green",  "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "blue":   {"offset": 4, "type": "range", "label": "Blue",   "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null}
    }'::jsonb;
    map_spot  CONSTANT JSONB := '{
        "pan":    {"offset": 1, "type": "range", "label": "Pan",    "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "tilt":   {"offset": 2, "type": "range", "label": "Tilt",   "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "dimmer": {"offset": 3, "type": "range", "label": "Dimmer", "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "red":    {"offset": 4, "type": "range", "label": "Red",    "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "green":  {"offset": 5, "type": "range", "label": "Green",  "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null},
        "blue":   {"offset": 6, "type": "range", "label": "Blue",   "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null}
    }'::jsonb;
    map_house CONSTANT JSONB := '{
        "dimmer": {"offset": 1, "type": "range", "label": "Dimmer", "dmx_min": 0, "dmx_max": 255, "enum_dmx_values": null}
    }'::jsonb;
BEGIN
    SELECT id INTO type_light FROM entity_types WHERE name = 'light';
    IF type_light IS NULL THEN
        RAISE WARNING 'Demo DMX rig: light entity type not found, skipping seed';
        RETURN;
    END IF;

    -- Optional links to demo seed rows (either may be absent on older databases)
    SELECT id INTO demo_device FROM devices WHERE hardware_id = 'demo-controller-001';
    SELECT id INTO parent_stage FROM entities WHERE slug = 'stage';

    -- ── Art-Net node ──────────────────────────────────────────────────────────
    INSERT INTO dmx_nodes (id, name, manufacturer, model, ip_address, artnet_port,
                           universe_count, universes, device_id, notes, metadata)
    VALUES (
        node_id, 'Demo Stage Node', 'Demo', 'Art-Net 4-Port', '10.0.0.52', 6454, 4,
        '[{"id": 1, "artnet_universe": 0, "port_label": "Port 1", "description": "Stage Wash"},
          {"id": 2, "artnet_universe": 1, "port_label": "Port 2", "description": "Stage Spots"}]'::jsonb,
        demo_device,
        'Seeded demo node — no hardware required; playback runs server-side.',
        '{"demo": true}'::jsonb
    ) ON CONFLICT (id) DO NOTHING;

    -- ── Group ─────────────────────────────────────────────────────────────────
    INSERT INTO dmx_groups (id, name, color, sort_order, metadata)
    VALUES (group_id, 'Demo Stage', '#e8503a', 0, '{"demo": true}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- ── Entities (children of the demo Stage room when present) ───────────────
    INSERT INTO entities (id, name, slug, entity_type_id, parent_id, state, metadata)
    VALUES
        (en_wash1,  'Stage Wash 1',  'stage-wash-1',  type_light, parent_stage,
         '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb, '{"demo": true}'::jsonb),
        (en_wash2,  'Stage Wash 2',  'stage-wash-2',  type_light, parent_stage,
         '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb, '{"demo": true}'::jsonb),
        (en_wash3,  'Stage Wash 3',  'stage-wash-3',  type_light, parent_stage,
         '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb, '{"demo": true}'::jsonb),
        (en_wash4,  'Stage Wash 4',  'stage-wash-4',  type_light, parent_stage,
         '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb, '{"demo": true}'::jsonb),
        (en_spotl,  'Moving Spot L', 'moving-spot-l', type_light, parent_stage,
         '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.7, "red": 1.0, "green": 0.9, "blue": 0.8}'::jsonb, '{"demo": true}'::jsonb),
        (en_spotr,  'Moving Spot R', 'moving-spot-r', type_light, parent_stage,
         '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.7, "red": 1.0, "green": 0.9, "blue": 0.8}'::jsonb, '{"demo": true}'::jsonb),
        (en_house1, 'House Dimmer 1', 'house-dimmer-1', type_light, parent_stage,
         '{"dimmer": 0.8}'::jsonb, '{"demo": true}'::jsonb),
        (en_house2, 'House Dimmer 2', 'house-dimmer-2', type_light, parent_stage,
         '{"dimmer": 0.8}'::jsonb, '{"demo": true}'::jsonb)
    ON CONFLICT (slug) DO NOTHING;

    -- ── Fixtures ──────────────────────────────────────────────────────────────
    INSERT INTO dmx_fixtures (id, name, node_id, universe,
                              start_channel, channel_count, fixture_mode, channel_map,
                              entity_id, group_id, position_x, position_y, sort_order, metadata)
    VALUES
        (fx_wash1,  'Stage Wash 1',  node_id, 1,  1, 4, '4ch', map_wash,  en_wash1,  group_id, 140, 120, 0, '{"demo": true}'::jsonb),
        (fx_wash2,  'Stage Wash 2',  node_id, 1,  5, 4, '4ch', map_wash,  en_wash2,  group_id, 320, 120, 1, '{"demo": true}'::jsonb),
        (fx_wash3,  'Stage Wash 3',  node_id, 1,  9, 4, '4ch', map_wash,  en_wash3,  group_id, 500, 120, 2, '{"demo": true}'::jsonb),
        (fx_wash4,  'Stage Wash 4',  node_id, 1, 13, 4, '4ch', map_wash,  en_wash4,  group_id, 680, 120, 3, '{"demo": true}'::jsonb),
        (fx_spotl,  'Moving Spot L', node_id, 2,  1, 6, '6ch', map_spot,  en_spotl,  group_id, 230, 320, 4, '{"demo": true}'::jsonb),
        (fx_spotr,  'Moving Spot R', node_id, 2,  7, 6, '6ch', map_spot,  en_spotr,  group_id, 590, 320, 5, '{"demo": true}'::jsonb),
        (fx_house1, 'House Dimmer 1', node_id, 1, 17, 1, '1ch', map_house, en_house1, group_id, 320, 480, 6, '{"demo": true}'::jsonb),
        (fx_house2, 'House Dimmer 2', node_id, 1, 18, 1, '1ch', map_house, en_house2, group_id, 500, 480, 7, '{"demo": true}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- ── Cues ──────────────────────────────────────────────────────────────────
    INSERT INTO dmx_cues (id, name, sort_order, group_id) VALUES
        (cue_warm,   'Warm Welcome', 0, group_id),
        (cue_blue,   'Deep Blue',    1, group_id),
        (cue_sunset, 'Sunset Chase', 2, group_id),
        (cue_black,  'Blackout',     3, group_id)
    ON CONFLICT (id) DO NOTHING;

    -- Cue snapshots (native format: 0.0-1.0 per channel).
    -- Guard on one cue's snapshots so re-runs don't duplicate rows
    -- (dmx_cue_fixtures has no natural unique key).
    IF NOT EXISTS (SELECT 1 FROM dmx_cue_fixtures WHERE cue_id = cue_warm) THEN
        INSERT INTO dmx_cue_fixtures (cue_id, fixture_id, entity_id, state) VALUES
            -- Warm Welcome: amber washes, soft white spots centered, house up
            (cue_warm, fx_wash1::text,  en_wash1::text,  '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb),
            (cue_warm, fx_wash2::text,  en_wash2::text,  '{"dimmer": 0.85, "red": 1.0, "green": 0.62, "blue": 0.28}'::jsonb),
            (cue_warm, fx_wash3::text,  en_wash3::text,  '{"dimmer": 0.85, "red": 1.0, "green": 0.62, "blue": 0.28}'::jsonb),
            (cue_warm, fx_wash4::text,  en_wash4::text,  '{"dimmer": 0.85, "red": 1.0, "green": 0.6, "blue": 0.25}'::jsonb),
            (cue_warm, fx_spotl::text,  en_spotl::text,  '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.7, "red": 1.0, "green": 0.9, "blue": 0.8}'::jsonb),
            (cue_warm, fx_spotr::text,  en_spotr::text,  '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.7, "red": 1.0, "green": 0.9, "blue": 0.8}'::jsonb),
            (cue_warm, fx_house1::text, en_house1::text, '{"dimmer": 0.8}'::jsonb),
            (cue_warm, fx_house2::text, en_house2::text, '{"dimmer": 0.8}'::jsonb),

            -- Deep Blue: blue/violet washes, magenta spots swept wide, house low
            (cue_blue, fx_wash1::text,  en_wash1::text,  '{"dimmer": 0.8, "red": 0.15, "green": 0.25, "blue": 1.0}'::jsonb),
            (cue_blue, fx_wash2::text,  en_wash2::text,  '{"dimmer": 0.8, "red": 0.3, "green": 0.2, "blue": 1.0}'::jsonb),
            (cue_blue, fx_wash3::text,  en_wash3::text,  '{"dimmer": 0.8, "red": 0.3, "green": 0.2, "blue": 1.0}'::jsonb),
            (cue_blue, fx_wash4::text,  en_wash4::text,  '{"dimmer": 0.8, "red": 0.15, "green": 0.25, "blue": 1.0}'::jsonb),
            (cue_blue, fx_spotl::text,  en_spotl::text,  '{"pan": 0.28, "tilt": 0.55, "dimmer": 0.85, "red": 1.0, "green": 0.1, "blue": 1.0}'::jsonb),
            (cue_blue, fx_spotr::text,  en_spotr::text,  '{"pan": 0.72, "tilt": 0.55, "dimmer": 0.85, "red": 1.0, "green": 0.1, "blue": 1.0}'::jsonb),
            (cue_blue, fx_house1::text, en_house1::text, '{"dimmer": 0.2}'::jsonb),
            (cue_blue, fx_house2::text, en_house2::text, '{"dimmer": 0.2}'::jsonb),

            -- Sunset Chase: alternating orange/pink washes, teal spots, house mid
            (cue_sunset, fx_wash1::text,  en_wash1::text,  '{"dimmer": 0.9, "red": 1.0, "green": 0.35, "blue": 0.1}'::jsonb),
            (cue_sunset, fx_wash2::text,  en_wash2::text,  '{"dimmer": 0.9, "red": 1.0, "green": 0.15, "blue": 0.45}'::jsonb),
            (cue_sunset, fx_wash3::text,  en_wash3::text,  '{"dimmer": 0.9, "red": 1.0, "green": 0.35, "blue": 0.1}'::jsonb),
            (cue_sunset, fx_wash4::text,  en_wash4::text,  '{"dimmer": 0.9, "red": 1.0, "green": 0.15, "blue": 0.45}'::jsonb),
            (cue_sunset, fx_spotl::text,  en_spotl::text,  '{"pan": 0.6, "tilt": 0.3, "dimmer": 0.75, "red": 0.0, "green": 0.9, "blue": 0.8}'::jsonb),
            (cue_sunset, fx_spotr::text,  en_spotr::text,  '{"pan": 0.4, "tilt": 0.3, "dimmer": 0.75, "red": 0.0, "green": 0.9, "blue": 0.8}'::jsonb),
            (cue_sunset, fx_house1::text, en_house1::text, '{"dimmer": 0.5}'::jsonb),
            (cue_sunset, fx_house2::text, en_house2::text, '{"dimmer": 0.5}'::jsonb),

            -- Blackout: everything to zero
            (cue_black, fx_wash1::text,  en_wash1::text,  '{"dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_wash2::text,  en_wash2::text,  '{"dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_wash3::text,  en_wash3::text,  '{"dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_wash4::text,  en_wash4::text,  '{"dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_spotl::text,  en_spotl::text,  '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_spotr::text,  en_spotr::text,  '{"pan": 0.5, "tilt": 0.4, "dimmer": 0.0, "red": 0.0, "green": 0.0, "blue": 0.0}'::jsonb),
            (cue_black, fx_house1::text, en_house1::text, '{"dimmer": 0.0}'::jsonb),
            (cue_black, fx_house2::text, en_house2::text, '{"dimmer": 0.0}'::jsonb);
    END IF;

    -- ── Sequence ──────────────────────────────────────────────────────────────
    -- Blackout is intentionally left out of the loop; it stays a manual cue.
    INSERT INTO dmx_sequences (id, name, sort_order, group_id)
    VALUES (seq_loop, 'Evening Loop', 0, group_id)
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM dmx_sequence_cues WHERE sequence_id = seq_loop) THEN
        INSERT INTO dmx_sequence_cues (sequence_id, cue_id, position, transition_time, hold_duration) VALUES
            (seq_loop, cue_warm,   0, 3.0, 4.0),
            (seq_loop, cue_blue,   1, 3.0, 4.0),
            (seq_loop, cue_sunset, 2, 3.0, 4.0);
    END IF;

    RAISE NOTICE 'Demo DMX rig seeded: 1 node, 1 group, 8 fixtures + entities, 4 cues, 1 sequence';
END $$;
