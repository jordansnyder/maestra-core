-- Migration 010: Add sort_order to dmx_nodes and dmx_fixtures for drag-to-reorder

ALTER TABLE dmx_nodes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dmx_fixtures ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order from creation order (oldest first)
WITH ordered AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1) AS rn
    FROM dmx_nodes
)
UPDATE dmx_nodes SET sort_order = ordered.rn FROM ordered WHERE dmx_nodes.id = ordered.id;

WITH ordered AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1) AS rn
    FROM dmx_fixtures
)
UPDATE dmx_fixtures SET sort_order = ordered.rn FROM ordered WHERE dmx_fixtures.id = ordered.id;
