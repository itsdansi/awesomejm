CREATE TABLE shops (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO shops (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'First shop');

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  item_code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  category varchar(60) NOT NULL,
  metal text NOT NULL CHECK (metal IN ('GOLD', 'SILVER')),
  fineness numeric(7,3) NOT NULL CHECK (fineness > 0 AND fineness <= 1000),
  gross_weight_grams numeric(12,3) NOT NULL CHECK (gross_weight_grams > 0),
  non_metal_weight_grams numeric(12,3) NOT NULL CHECK (non_metal_weight_grams >= 0 AND non_metal_weight_grams < gross_weight_grams),
  net_weight_grams numeric(12,3) GENERATED ALWAYS AS (gross_weight_grams - non_metal_weight_grams) STORED,
  fine_weight_grams numeric(15,6) GENERATED ALWAYS AS (round((gross_weight_grams - non_metal_weight_grams) * fineness / 1000, 6)) STORED,
  grams_per_tola numeric(8,5) NOT NULL CHECK (grams_per_tola > 0),
  notes varchar(1000) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'VOIDED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, item_code),
  UNIQUE (shop_id, id)
);
CREATE INDEX inventory_shop_status ON inventory_items(shop_id, status, received_at DESC, id);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('RECEIPT', 'RECEIPT_VOID')),
  net_weight_grams numeric(12,3) NOT NULL,
  reason varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_id, item_id) REFERENCES inventory_items(shop_id, id),
  UNIQUE (item_id, kind),
  CHECK ((kind = 'RECEIPT' AND net_weight_grams > 0) OR (kind = 'RECEIPT_VOID' AND net_weight_grams < 0))
);

CREATE FUNCTION reject_movement_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movement history is append-only';
END;
$$;
CREATE TRIGGER immutable_movement BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION reject_movement_change();
