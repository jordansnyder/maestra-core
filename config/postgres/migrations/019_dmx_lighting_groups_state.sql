-- 019_dmx_lighting_groups_state.sql
-- Extend the DMX Lighting entity type schema to include groups, per-item group_id
-- fields on cues and sequences, and a group_playback map for independent per-group
-- sequence/cue control via OSC, MQTT, or NATS entity state updates.
--
-- State shape after this migration:
--
--   {
--     "groups": [{"id": "...", "name": "...", "color": "..."}],
--     "cues": [{"id": "...", "name": "...", "fade_duration": 0, "group_id": null}],
--     "sequences": [{"id": "...", "name": "...", "cue_count": 0,
--                    "fade_out_duration": 3, "group_id": null}],
--     "active_cue_id": null,           -- ungrouped/legacy cue control
--     "active_sequence_id": null,      -- ungrouped/legacy sequence control
--     "group_playback": {              -- per-group control (keys are group UUIDs)
--       "<group-uuid>": {
--         "active_sequence_id": null,
--         "active_cue_id": null
--       }
--     }
--   }
--
-- External devices control per-group playback by sending a state update with:
--   PATCH /entities/<id>/state
--   { "state": { "group_playback": { "<group-id>": { "active_sequence_id": "<seq-id>" } } } }
--
-- Or via OSC:  /entity/update/dmx-lighting/group_playback  (JSON object value)
-- Or via MQTT: maestra/entity/state/update/dmx-lighting

UPDATE entity_types
SET
    state_schema  = '{
        "type": "object",
        "properties": {
            "groups": {
                "type": "array",
                "description": "All defined DMX groups (layers).",
                "items": {
                    "type": "object",
                    "properties": {
                        "id":    {"type": "string"},
                        "name":  {"type": "string"},
                        "color": {"type": ["string", "null"]}
                    }
                }
            },
            "cues": {
                "type": "array",
                "description": "All saved cues.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id":            {"type": "string"},
                        "name":          {"type": "string"},
                        "fade_duration": {"type": "number"},
                        "group_id":      {"type": ["string", "null"]}
                    }
                }
            },
            "sequences": {
                "type": "array",
                "description": "All saved sequences.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id":                {"type": "string"},
                        "name":              {"type": "string"},
                        "cue_count":         {"type": "integer"},
                        "fade_out_duration": {"type": "number"},
                        "group_id":          {"type": ["string", "null"]}
                    }
                }
            },
            "active_cue_id": {
                "type": ["string", "null"],
                "description": "Recall a cue on the ungrouped (legacy) engine. Set to null to clear."
            },
            "active_sequence_id": {
                "type": ["string", "null"],
                "description": "Play a sequence on the ungrouped (legacy) engine. Set to null to stop."
            },
            "group_playback": {
                "type": "object",
                "description": "Per-group playback control. Each key is a group UUID. Set active_sequence_id or active_cue_id to trigger playback on that group engine independently.",
                "additionalProperties": {
                    "type": "object",
                    "properties": {
                        "active_sequence_id": {"type": ["string", "null"]},
                        "active_cue_id":      {"type": ["string", "null"]}
                    }
                }
            }
        }
    }',
    default_state = '{
        "groups": [],
        "cues": [],
        "sequences": [],
        "active_cue_id": null,
        "active_sequence_id": null,
        "group_playback": {}
    }',
    updated_at = NOW()
WHERE name = 'dmx_controller';

-- Patch the singleton entity's existing state to add the new top-level keys
-- without overwriting active playback fields already present.
UPDATE entities
SET
    state = state
        || '{"groups": []}'::jsonb
        || jsonb_build_object(
               'group_playback',
               COALESCE(state->'group_playback', '{}'::jsonb)
           ),
    state_updated_at = NOW()
WHERE slug = 'dmx-lighting'
  AND (state->'groups' IS NULL OR state->'group_playback' IS NULL);
