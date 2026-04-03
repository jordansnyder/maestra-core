-- 020_dmx_lighting_seq_control_schema.sql
-- Update the dmx_controller entity type state_schema so that active_sequence_id
-- and group_playback[].active_sequence_id accept either a plain sequence UUID string
-- or a control object with optional loop and fadeout parameters.

UPDATE entity_types
SET
    state_schema = '{
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
                "description": "Recall a cue on the ungrouped engine. Set to null to clear."
            },
            "active_sequence_id": {
                "description": "Play a sequence on the ungrouped engine. Accepts a sequence UUID string (play once, stop on last values) or a control object.",
                "oneOf": [
                    {
                        "type": ["string", "null"],
                        "description": "Sequence UUID — plays once then stops on last DMX values. Null stops playback."
                    },
                    {
                        "type": "object",
                        "description": "Control object with playback options.",
                        "required": ["id"],
                        "properties": {
                            "id":      {"type": "string", "description": "Sequence UUID"},
                            "loop":    {"type": "boolean", "description": "Loop the sequence indefinitely. Default: false."},
                            "fadeout": {"type": "number", "description": "After the sequence completes (non-looping), fade dimmer channels to zero over this many seconds. Omit to leave the last DMX values in place."}
                        }
                    }
                ]
            },
            "group_playback": {
                "type": "object",
                "description": "Per-group playback control. Each key is a group UUID.",
                "additionalProperties": {
                    "type": "object",
                    "properties": {
                        "active_cue_id": {"type": ["string", "null"]},
                        "active_sequence_id": {
                            "description": "Same as top-level active_sequence_id — string UUID or control object.",
                            "oneOf": [
                                {"type": ["string", "null"]},
                                {
                                    "type": "object",
                                    "required": ["id"],
                                    "properties": {
                                        "id":      {"type": "string"},
                                        "loop":    {"type": "boolean"},
                                        "fadeout": {"type": "number"}
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }
    }',
    updated_at = NOW()
WHERE name = 'dmx_controller';
