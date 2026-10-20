CREATE TABLE staff_users (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), username varchar(64) NOT NULL,
 name varchar(120) NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('OWNER','MANAGER','CASHIER','VIEWER')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(shop_id,username), UNIQUE(shop_id,id)
);
CREATE TABLE staff_sessions (
 token_hash char(64) PRIMARY KEY, shop_id uuid NOT NULL, staff_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(shop_id,staff_id) REFERENCES staff_users(shop_id,id)
);
CREATE INDEX staff_sessions_user ON staff_sessions(shop_id,staff_id);
CREATE TABLE login_limits (key char(64) PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id),
 actor_id uuid, actor_name text, actor_username text, action text NOT NULL, resource text NOT NULL, record_id text,
 details jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(shop_id,actor_id) REFERENCES staff_users(shop_id,id)
);
CREATE INDEX audit_shop_time ON audit_events(shop_id,id DESC);
CREATE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is append-only'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_change();
CREATE FUNCTION audit_business_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; staff staff_users%ROWTYPE; data jsonb; changed jsonb;
BEGIN
 actor := NULLIF(current_setting('app.staff_id',true),'')::uuid;
 data := to_jsonb(NEW);
 IF actor IS NOT NULL THEN SELECT * INTO STRICT staff FROM staff_users WHERE id=actor AND shop_id=(data->>'shop_id')::uuid; END IF;
 IF TG_OP='UPDATE' THEN
   SELECT COALESCE(jsonb_agg(k),'[]') INTO changed FROM jsonb_object_keys(data) AS k WHERE data->k IS DISTINCT FROM to_jsonb(OLD)->k;
 ELSE changed := '[]'; END IF;
 INSERT INTO audit_events(shop_id,actor_id,actor_name,actor_username,action,resource,record_id,details)
 VALUES((data->>'shop_id')::uuid,actor,staff.name,staff.username,TG_OP,TG_TABLE_NAME,COALESCE(data->>'id',data->>'customer_id',data->>'order_id',data->>'sale_id',data->>'item_id'),jsonb_build_object('changedFields',changed));
 RETURN NEW;
END; $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_items','inventory_movements','metal_rates','customers','customer_profile_history','customer_account_entries','sales','sale_lines','sale_cancellations','custom_orders','custom_order_events','metal_purchases','old_metal_lots','purchase_cancellations','old_metal_movements'] LOOP
   EXECUTE format('CREATE TRIGGER staff_audit AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION audit_business_change()',t);
 END LOOP;
END $$;
CREATE TABLE backup_runs (
 id uuid PRIMARY KEY, file_name text NOT NULL, created_at timestamptz NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0), sha256 char(64) NOT NULL UNIQUE,
 verified_at timestamptz, table_count integer
);
