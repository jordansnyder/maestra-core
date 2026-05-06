-- Remove the label (short label) column from dmx_fixtures.
-- The field is no longer used by the dashboard or API; fixture names
-- are now the sole display identifier for DMX fixtures.
-- Safe to run on databases that have already had the column removed.

ALTER TABLE dmx_fixtures DROP COLUMN IF EXISTS label;
