CREATE TABLE shop_counters (
  shop_id uuid NOT NULL REFERENCES shops(id),
  scope text NOT NULL CHECK (scope IN ('CUSTOMER', 'ACCOUNT_ENTRY')),
  last_number bigint NOT NULL CHECK (last_number > 0),
  PRIMARY KEY (shop_id, scope)
);
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  customer_code text NOT NULL,
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  phone varchar(16) NOT NULL DEFAULT '',
  address varchar(300) NOT NULL DEFAULT '',
  pan varchar(9) NOT NULL DEFAULT '' CHECK (pan = '' OR pan ~ '^[0-9]{9}$'),
  notes varchar(1000) NOT NULL DEFAULT '',
  opened_on date NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  create_request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, customer_code),
  UNIQUE (shop_id, create_request_id)
);
CREATE INDEX customer_search ON customers(shop_id, name, id);
CREATE TABLE customer_profile_history (
  shop_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  version integer NOT NULL,
  profile jsonb NOT NULL,
  reason varchar(500) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (shop_id, customer_id, version),
  FOREIGN KEY (shop_id, customer_id) REFERENCES customers(shop_id, id)
);
CREATE TABLE customer_account_entries (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  entry_number bigint NOT NULL CHECK (entry_number > 0),
  entry_code text NOT NULL,
  entry_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('OPENING_DUE', 'OPENING_ADVANCE', 'PAYMENT', 'ADVANCE_REFUND', 'REVERSAL')),
  amount_npr numeric(11,2) NOT NULL CHECK (amount_npr <> 0),
  method text CHECK (method IN ('CASH', 'BANK', 'DIGITAL_WALLET')),
  reference varchar(160) NOT NULL DEFAULT '',
  notes varchar(500) NOT NULL DEFAULT '',
  reversal_of uuid,
  customer_snapshot jsonb NOT NULL,
  request_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, customer_id, id),
  UNIQUE (shop_id, entry_code),
  UNIQUE (shop_id, entry_number),
  UNIQUE (shop_id, request_id),
  UNIQUE (shop_id, reversal_of),
  FOREIGN KEY (shop_id, customer_id) REFERENCES customers(shop_id, id),
  FOREIGN KEY (shop_id, customer_id, reversal_of) REFERENCES customer_account_entries(shop_id, customer_id, id),
  CHECK ((kind IN ('OPENING_DUE', 'ADVANCE_REFUND') AND amount_npr > 0) OR (kind IN ('OPENING_ADVANCE', 'PAYMENT') AND amount_npr < 0) OR kind = 'REVERSAL'),
  CHECK ((kind = 'REVERSAL' AND reversal_of IS NOT NULL AND length(trim(notes)) >= 5) OR (kind <> 'REVERSAL' AND reversal_of IS NULL)),
  CHECK ((kind IN ('PAYMENT', 'ADVANCE_REFUND') AND method IS NOT NULL) OR (kind IN ('OPENING_DUE', 'OPENING_ADVANCE', 'REVERSAL') AND method IS NULL))
);
CREATE UNIQUE INDEX one_customer_opening ON customer_account_entries(shop_id, customer_id) WHERE kind IN ('OPENING_DUE', 'OPENING_ADVANCE');
CREATE INDEX customer_statement ON customer_account_entries(shop_id, customer_id, entry_date, entry_number);
CREATE FUNCTION reject_customer_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Customer history is append-only';
END;
$$;
CREATE TRIGGER immutable_customer_ledger BEFORE UPDATE OR DELETE ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION reject_customer_history_change();
CREATE TRIGGER immutable_customer_profile_history BEFORE UPDATE OR DELETE ON customer_profile_history FOR EACH ROW EXECUTE FUNCTION reject_customer_history_change();
