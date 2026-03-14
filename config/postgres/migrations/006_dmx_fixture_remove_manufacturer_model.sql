-- Migration 006: Remove manufacturer and model from dmx_fixtures
-- These fields are now derived exclusively from the linked OFL fixture profile (ofl_fixture_id).
-- DMX nodes retain their own manufacturer/model fields as they describe physical hardware.

ALTER TABLE dmx_fixtures DROP COLUMN IF EXISTS manufacturer;
ALTER TABLE dmx_fixtures DROP COLUMN IF EXISTS model;
