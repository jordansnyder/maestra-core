-- Migration 017: Allow OSC mapping pass-through mode
-- Drops the constraint requiring state_key or state_keys to be set.
-- When both are NULL the gateway forwards all OSC args as entity state.

ALTER TABLE osc_mappings
    DROP CONSTRAINT IF EXISTS osc_mappings_check1,
    DROP CONSTRAINT IF EXISTS osc_mappings_state_key_or_keys;

-- Re-scan for the auto-generated name (Postgres names them osc_mappings_checkN)
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'osc_mappings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%state_key IS NOT NULL OR state_keys IS NOT NULL%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE osc_mappings DROP CONSTRAINT %I', cname);
    END IF;
END
$$;
