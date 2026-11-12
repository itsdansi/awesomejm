ALTER TABLE inventory_items
  ADD COLUMN non_metal_value_npr numeric(11,2) NOT NULL DEFAULT 0
  CHECK (non_metal_value_npr >= 0);
