ALTER TABLE shop_counters DROP CONSTRAINT shop_counters_scope_check;
ALTER TABLE shop_counters ADD CONSTRAINT shop_counters_scope_check CHECK (scope IN ('CUSTOMER','ACCOUNT_ENTRY','SALE','ORDER','PURCHASE'));
CREATE TABLE metal_purchases (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), customer_id uuid NOT NULL,
 purchase_code text NOT NULL,purchase_date date NOT NULL,customer_snapshot jsonb NOT NULL,
 total_npr numeric(11,2) NOT NULL CHECK(total_npr>0),sale_id uuid,
 payout_npr numeric(11,2) NOT NULL CHECK(payout_npr>=0 AND payout_npr<=total_npr),
 payout_method text CHECK(payout_method IN ('CASH','BANK','DIGITAL_WALLET')),
 payout_reference varchar(160) NOT NULL,reference varchar(160) NOT NULL,notes varchar(500) NOT NULL,
 balance_before_npr numeric(32,2) NOT NULL,balance_after_npr numeric(32,2) NOT NULL,
 request_id uuid NOT NULL,request_fingerprint char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,id),UNIQUE(shop_id,customer_id,id),UNIQUE(shop_id,purchase_code),UNIQUE(shop_id,request_id),UNIQUE(shop_id,sale_id),
 FOREIGN KEY(shop_id,customer_id) REFERENCES customers(shop_id,id),
 FOREIGN KEY(shop_id,customer_id,sale_id) REFERENCES sales(shop_id,customer_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((payout_npr=0 AND payout_method IS NULL) OR (payout_npr>0 AND payout_method IS NOT NULL))
);
CREATE INDEX purchase_register ON metal_purchases(shop_id,purchase_date DESC,created_at DESC);
CREATE TABLE old_metal_lots (
 id uuid PRIMARY KEY,shop_id uuid NOT NULL,purchase_id uuid NOT NULL,line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 20),lot_code text NOT NULL,
 metal text NOT NULL CHECK(metal IN ('GOLD','SILVER')),fineness numeric(7,3) NOT NULL CHECK(fineness>0 AND fineness<=1000),
 net_weight_grams numeric(12,3) NOT NULL CHECK(net_weight_grams>0),fine_weight_grams numeric(15,6) NOT NULL CHECK(fine_weight_grams>=0),
 snapshot jsonb NOT NULL,
 UNIQUE(shop_id,id),UNIQUE(shop_id,purchase_id,id),UNIQUE(shop_id,purchase_id,line_number),UNIQUE(shop_id,lot_code),
 FOREIGN KEY(shop_id,purchase_id) REFERENCES metal_purchases(shop_id,id)
);
CREATE TABLE purchase_cancellations (
 id uuid PRIMARY KEY,shop_id uuid NOT NULL,purchase_id uuid NOT NULL,cancellation_date date NOT NULL,reason varchar(500) NOT NULL CHECK(length(trim(reason))>=5),
 request_id uuid NOT NULL,request_fingerprint char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,purchase_id),UNIQUE(shop_id,request_id),FOREIGN KEY(shop_id,purchase_id) REFERENCES metal_purchases(shop_id,id)
);
CREATE TABLE old_metal_movements (
 id uuid PRIMARY KEY,shop_id uuid NOT NULL,purchase_id uuid NOT NULL,lot_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('PURCHASE','PURCHASE_CANCEL')),
 movement_date date NOT NULL,net_weight_grams numeric(12,3) NOT NULL,fine_weight_grams numeric(15,6) NOT NULL,
 UNIQUE(shop_id,lot_id,kind),FOREIGN KEY(shop_id,purchase_id,lot_id) REFERENCES old_metal_lots(shop_id,purchase_id,id),
 CHECK((kind='PURCHASE' AND net_weight_grams>0 AND fine_weight_grams>=0) OR (kind='PURCHASE_CANCEL' AND net_weight_grams<0 AND fine_weight_grams<=0))
);
CREATE INDEX old_metal_period ON old_metal_movements(shop_id,movement_date);
CREATE TRIGGER immutable_purchase BEFORE UPDATE OR DELETE ON metal_purchases FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_old_lot BEFORE UPDATE OR DELETE ON old_metal_lots FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_purchase_cancel BEFORE UPDATE OR DELETE ON purchase_cancellations FOR EACH ROW EXECUTE FUNCTION reject_sale_change();
CREATE TRIGGER immutable_old_movement BEFORE UPDATE OR DELETE ON old_metal_movements FOR EACH ROW EXECUTE FUNCTION reject_movement_change();
ALTER TABLE customer_account_entries ADD COLUMN purchase_id uuid;
ALTER TABLE customer_account_entries ADD FOREIGN KEY(shop_id,customer_id,purchase_id) REFERENCES metal_purchases(shop_id,customer_id,id);
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_kind_check;
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_sign_check;
ALTER TABLE customer_account_entries DROP CONSTRAINT customer_account_entries_method_rule;
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_kind_check CHECK(kind IN ('OPENING_DUE','OPENING_ADVANCE','PAYMENT','ADVANCE_REFUND','REVERSAL','SALE_CHARGE','METAL_PURCHASE','PURCHASE_PAYOUT'));
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_sign_check CHECK((kind IN ('OPENING_DUE','ADVANCE_REFUND','SALE_CHARGE','PURCHASE_PAYOUT') AND amount_npr>0) OR (kind IN ('OPENING_ADVANCE','PAYMENT','METAL_PURCHASE') AND amount_npr<0) OR kind='REVERSAL');
ALTER TABLE customer_account_entries ADD CONSTRAINT customer_account_entries_method_rule CHECK((kind IN ('PAYMENT','ADVANCE_REFUND','PURCHASE_PAYOUT') AND method IS NOT NULL) OR (kind IN ('OPENING_DUE','OPENING_ADVANCE','REVERSAL','SALE_CHARGE','METAL_PURCHASE') AND method IS NULL));
ALTER TABLE customer_account_entries ADD CONSTRAINT account_purchase_link CHECK((kind NOT IN ('METAL_PURCHASE','PURCHASE_PAYOUT') OR purchase_id IS NOT NULL) AND (purchase_id IS NULL OR (sale_id IS NULL AND order_id IS NULL AND kind IN ('METAL_PURCHASE','PURCHASE_PAYOUT','REVERSAL'))));
CREATE UNIQUE INDEX one_purchase_account_post ON customer_account_entries(shop_id,purchase_id,kind) WHERE purchase_id IS NOT NULL AND kind IN ('METAL_PURCHASE','PURCHASE_PAYOUT');
