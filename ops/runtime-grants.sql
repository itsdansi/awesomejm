-- Run as the migration/database owner in the application's dedicated database.
-- First create a LOGIN role named ajm_runtime and set its password interactively.
-- Keep migration/recovery credentials outside the API service environment.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ajm_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ajm_runtime;
GRANT INSERT ON inventory_items, inventory_movements, metal_rates, customers,
 customer_profile_history, customer_account_entries, sales, sale_lines,
 sale_cancellations, custom_orders, custom_order_events, metal_purchases,
 old_metal_lots, purchase_cancellations, old_metal_movements, shop_counters,
 audit_events, staff_users, staff_sessions, login_limits TO ajm_runtime;
GRANT UPDATE ON shops, inventory_items, customers, custom_orders, shop_counters,
 staff_users, staff_sessions, login_limits TO ajm_runtime;
GRANT DELETE ON staff_sessions, login_limits TO ajm_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ajm_runtime;
COMMIT;
