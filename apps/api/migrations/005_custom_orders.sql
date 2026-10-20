ALTER TABLE shop_counters DROP CONSTRAINT shop_counters_scope_check;
ALTER TABLE shop_counters ADD CONSTRAINT shop_counters_scope_check CHECK (scope IN ('CUSTOMER','ACCOUNT_ENTRY','SALE','ORDER'));

CREATE TABLE custom_orders (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  customer_id uuid NOT NULL,
  order_code text NOT NULL,
  order_date date NOT NULL,
  due_date date NOT NULL CHECK (due_date >= order_date),
  customer_snapshot jsonb NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 20),
  piece_count integer NOT NULL CHECK (piece_count BETWEEN 1 AND 20),
  estimated_total_npr numeric(11,2) CHECK (estimated_total_npr >= 0),
  notes varchar(1000) NOT NULL DEFAULT '',
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id,id), UNIQUE (shop_id,customer_id,id), UNIQUE (shop_id,order_code), UNIQUE (shop_id,request_id),
  FOREIGN KEY (shop_id,customer_id) REFERENCES customers(shop_id,id)
);
CREATE INDEX custom_order_register ON custom_orders(shop_id,due_date,order_date DESC);
ALTER TABLE sales ADD COLUMN order_id uuid;
ALTER TABLE sales ADD FOREIGN KEY (shop_id,customer_id,order_id) REFERENCES custom_orders(shop_id,customer_id,id);
ALTER TABLE sales ADD CONSTRAINT sales_order_identity UNIQUE (shop_id,order_id,id);
CREATE TABLE custom_order_events (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  order_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('CREATED','STATUS','SALE_DELIVERED','SALE_REOPENED')),
  status text NOT NULL CHECK (status IN ('BOOKED','IN_PROGRESS','READY','DELIVERED','CANCELLED')),
  event_date date NOT NULL,
  reason varchar(500) NOT NULL CHECK (length(trim(reason)) >= 5),
  sale_id uuid,
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id,order_id,version), UNIQUE (shop_id,request_id),
  FOREIGN KEY (shop_id,order_id) REFERENCES custom_orders(shop_id,id),
  FOREIGN KEY (shop_id,order_id,sale_id) REFERENCES sales(shop_id,order_id,id),
  CHECK ((kind='CREATED' AND status='BOOKED' AND version=1 AND sale_id IS NULL) OR (kind='STATUS' AND status IN ('IN_PROGRESS','READY','CANCELLED') AND version>1 AND sale_id IS NULL) OR (kind='SALE_DELIVERED' AND status='DELIVERED' AND sale_id IS NOT NULL) OR (kind='SALE_REOPENED' AND status='READY' AND sale_id IS NOT NULL))
);
CREATE TRIGGER immutable_custom_order BEFORE UPDATE OR DELETE ON custom_orders FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_custom_order_event BEFORE UPDATE OR DELETE ON custom_order_events FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
ALTER TABLE customer_account_entries ADD COLUMN order_id uuid;
ALTER TABLE customer_account_entries ADD FOREIGN KEY (shop_id,customer_id,order_id) REFERENCES custom_orders(shop_id,customer_id,id);
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_order_link CHECK (order_id IS NULL OR (sale_id IS NULL AND kind IN ('PAYMENT','REVERSAL')));
CREATE INDEX order_payments ON customer_account_entries(shop_id,order_id) WHERE order_id IS NOT NULL;
