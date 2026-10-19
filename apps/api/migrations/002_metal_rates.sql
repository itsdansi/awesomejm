CREATE TABLE metal_rates (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  rate_date date NOT NULL CHECK (rate_date BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'),
  metal text NOT NULL CHECK (metal IN ('GOLD', 'SILVER')),
  fineness numeric(7,3) NOT NULL CHECK (fineness > 0 AND fineness <= 1000),
  currency text NOT NULL DEFAULT 'NPR' CHECK (currency = 'NPR'),
  buy_rate_per_tola numeric(11,2) NOT NULL CHECK (buy_rate_per_tola > 0),
  sell_rate_per_tola numeric(11,2) NOT NULL CHECK (sell_rate_per_tola > 0),
  grams_per_tola numeric(8,5) NOT NULL CHECK (grams_per_tola > 0),
  source varchar(160) NOT NULL CHECK (length(trim(source)) > 0),
  reason varchar(500) NOT NULL DEFAULT '',
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, rate_date, metal, fineness, revision),
  CHECK (revision = 1 OR length(trim(reason)) >= 5)
);
CREATE INDEX metal_rates_book ON metal_rates(shop_id, rate_date DESC, metal, fineness DESC, revision DESC);
CREATE FUNCTION reject_rate_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Rate history is append-only';
END;
$$;
CREATE TRIGGER immutable_rate BEFORE UPDATE OR DELETE ON metal_rates
FOR EACH ROW EXECUTE FUNCTION reject_rate_change();
