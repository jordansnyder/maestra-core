-- Migration 005: Add device_id to dmx_nodes
-- Links each Art-Net node to a Maestra device record.
-- ON DELETE SET NULL so deleting a device never cascades to the node.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dmx_nodes' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE dmx_nodes
      ADD COLUMN device_id UUID REFERENCES devices(id) ON DELETE SET NULL;
  END IF;
END
$$;
