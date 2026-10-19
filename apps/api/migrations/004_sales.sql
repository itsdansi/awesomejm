ALTER TABLE shop_counters DROP CONSTRAINT shop_counters_scope_check;
ALTER TABLE shop_counters ADD CONSTRAINT shop_counters_scope_check CHECK (scope IN ('CUSTOMER','ACCOUNT_ENTRY','SALE'));
ALTER TABLE metal_rates ADD CONSTRAINT metal_rates_shop_id_id_key UNIQUE (shop_id,id);

CREATE TABLE sales (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  customer_id uuid NOT NULL,
  sale_code text NOT NULL,
  sale_date date NOT NULL,
  customer_snapshot jsonb NOT NULL,
  subtotal_npr numeric(11,2) NOT NULL CHECK (subtotal_npr >= 0),
  discount_npr numeric(11,2) NOT NULL CHECK (discount_npr >= 0 AND discount_npr <= subtotal_npr),
  tax_npr numeric(11,2) NOT NULL CHECK (tax_npr >= 0),
  total_npr numeric(11,2) NOT NULL CHECK (total_npr > 0 AND total_npr = subtotal_npr-discount_npr+tax_npr),
  payment_npr numeric(11,2) NOT NULL CHECK (payment_npr >= 0 AND payment_npr <= total_npr),
  advance_applied_npr numeric(11,2) NOT NULL CHECK (advance_applied_npr >= 0),
  due_at_posting_npr numeric(11,2) NOT NULL CHECK (due_at_posting_npr >= 0 AND due_at_posting_npr = total_npr-payment_npr-advance_applied_npr),
  balance_before_npr numeric(32,2) NOT NULL,
  balance_after_npr numeric(32,2) NOT NULL CHECK (balance_after_npr = balance_before_npr+total_npr-payment_npr),
  payment_method text CHECK (payment_method IN ('CASH','BANK','DIGITAL_WALLET')),
  payment_reference varchar(160) NOT NULL DEFAULT '',
  bill_reference varchar(160) NOT NULL DEFAULT '',
  notes varchar(500) NOT NULL DEFAULT '',
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id,id),
  UNIQUE (shop_id,customer_id,id),
  UNIQUE (shop_id,sale_code),
  UNIQUE (shop_id,request_id),
  FOREIGN KEY (shop_id,customer_id) REFERENCES customers(shop_id,id),
  CHECK ((payment_npr = 0 AND payment_method IS NULL) OR (payment_npr > 0 AND payment_method IS NOT NULL))
);
CREATE INDEX sales_register ON sales(shop_id,sale_date DESC,created_at DESC);
CREATE TABLE sale_lines (
  shop_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 20),
  item_id uuid NOT NULL,
  rate_id uuid NOT NULL,
  item_snapshot jsonb NOT NULL CHECK (item_snapshot->>'id' = item_id::text),
  rate_snapshot jsonb NOT NULL CHECK (rate_snapshot->>'id' = rate_id::text),
  wastage_grams numeric(12,3) NOT NULL CHECK (wastage_grams >= 0),
  metal_npr numeric(11,2) NOT NULL CHECK (metal_npr >= 0),
  wastage_npr numeric(11,2) NOT NULL CHECK (wastage_npr >= 0),
  making_npr numeric(11,2) NOT NULL CHECK (making_npr >= 0),
  stones_npr numeric(11,2) NOT NULL CHECK (stones_npr >= 0),
  line_total_npr numeric(11,2) NOT NULL CHECK (line_total_npr = metal_npr+wastage_npr+making_npr+stones_npr),
  PRIMARY KEY (sale_id,line_number),
  UNIQUE (shop_id,sale_id,item_id),
  FOREIGN KEY (shop_id,sale_id) REFERENCES sales(shop_id,id),
  FOREIGN KEY (shop_id,item_id) REFERENCES inventory_items(shop_id,id),
  FOREIGN KEY (shop_id,rate_id) REFERENCES metal_rates(shop_id,id)
);
CREATE TABLE sale_cancellations (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  cancellation_date date NOT NULL,
  reason varchar(500) NOT NULL CHECK (length(trim(reason)) >= 5),
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id,sale_id),
  UNIQUE (shop_id,request_id),
  FOREIGN KEY (shop_id,sale_id) REFERENCES sales(shop_id,id)
);
CREATE FUNCTION reject_sale_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Sale history is append-only'; END;
$$;
CREATE TRIGGER immutable_sale BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_sale_lines BEFORE UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_sale_cancellation BEFORE UPDATE OR DELETE ON sale_cancellations FOR EACH ROW EXECUTE FUNCTION reject_sale_change();

ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_status_check;
ALTER TABLE inventory_items ADD COLUMN active_sale_id uuid;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_status_check CHECK (status IN ('AVAILABLE','VOIDED','SOLD'));
ALTER TABLE inventory_items ADD CONSTRAINT sold_item_sale_link CHECK ((status = 'SOLD') = (active_sale_id IS NOT NULL));
ALTER TABLE inventory_items ADD FOREIGN KEY (shop_id,active_sale_id,id) REFERENCES sale_lines(shop_id,sale_id,item_id);
ALTER TABLE inventory_movements ADD COLUMN sale_id uuid;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_kind_check;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_check;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_item_id_kind_key;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_kind_check CHECK (kind IN ('RECEIPT','RECEIPT_VOID','SALE','SALE_CANCEL'));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_sign_check CHECK ((kind IN ('RECEIPT','SALE_CANCEL') AND net_weight_grams > 0) OR (kind IN ('RECEIPT_VOID','SALE') AND net_weight_grams < 0));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_sale_link CHECK ((kind IN ('SALE','SALE_CANCEL')) = (sale_id IS NOT NULL));
ALTER TABLE inventory_movements ADD FOREIGN KEY (shop_id,sale_id,item_id) REFERENCES sale_lines(shop_id,sale_id,item_id);
CREATE UNIQUE INDEX one_receipt_movement ON inventory_movements(item_id,kind) WHERE kind IN ('RECEIPT','RECEIPT_VOID');
CREATE UNIQUE INDEX one_sale_movement ON inventory_movements(shop_id,sale_id,item_id,kind) WHERE sale_id IS NOT NULL;

ALTER TABLE customer_account_entries ADD COLUMN sale_id uuid;
ALTER TABLE customer_account_entries ADD FOREIGN KEY (shop_id,customer_id,sale_id) REFERENCES sales(shop_id,customer_id,id);
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_kind_check;
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_check;
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_check2;
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_kind_check CHECK (kind IN ('OPENING_DUE','OPENING_ADVANCE','PAYMENT','ADVANCE_REFUND','REVERSAL','SALE_CHARGE'));
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_sign_check CHECK ((kind IN ('OPENING_DUE','ADVANCE_REFUND','SALE_CHARGE') AND amount_npr > 0) OR (kind IN ('OPENING_ADVANCE','PAYMENT') AND amount_npr < 0) OR kind = 'REVERSAL');
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_method_rule CHECK ((kind IN ('PAYMENT','ADVANCE_REFUND') AND method IS NOT NULL) OR (kind IN ('OPENING_DUE','OPENING_ADVANCE','REVERSAL','SALE_CHARGE') AND method IS NULL));
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_sale_link CHECK ((kind <> 'SALE_CHARGE' OR sale_id IS NOT NULL) AND (sale_id IS NULL OR kind IN ('SALE_CHARGE','PAYMENT','REVERSAL')));
CREATE UNIQUE INDEX one_sale_charge_or_payment ON customer_account_entries(shop_id,sale_id,kind) WHERE sale_id IS NOT NULL AND kind IN ('SALE_CHARGE','PAYMENT');
