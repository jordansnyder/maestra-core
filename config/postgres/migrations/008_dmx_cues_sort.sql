-- Migration 008: Add sort_order to dmx_cues for drag-to-reorder persistence

ALTER TABLE dmx_cues ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order from creation order (oldest first)
WITH ordered AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1) AS rn
    FROM dmx_cues
)
UPDATE dmx_cues SET sort_order = ordered.rn FROM ordered WHERE dmx_cues.id = ordered.id;
