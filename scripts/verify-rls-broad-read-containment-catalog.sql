-- SELECT-only catalog verification. Run on a clone after applying
-- 20260917110000; every boolean must be true. No table rows are read.
WITH targets(table_name, broad_policy, scoped_policy) AS (
  VALUES
    ('wb_orders', 'dashboard_read_orders', 'tenant_select_wb_orders'),
    ('wb_sales', 'dashboard_read_sales', 'tenant_select_wb_sales'),
    ('product_cost_history', 'dashboard_read_costs', 'tenant_select_product_cost_history')
), inspected AS (
  SELECT t.table_name, c.oid, c.relrowsecurity,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
    has_table_privilege('service_role', c.oid, 'SELECT') AS service_select,
    EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = t.scoped_policy
        AND p.polcmd = 'r' AND p.polpermissive
        AND p.polroles = ARRAY['authenticated'::regrole::oid]
        AND CASE WHEN t.table_name = 'product_cost_history' THEN
          regexp_replace(pg_get_expr(p.polqual, p.polrelid), '[[:space:]]+', ' ', 'g') =
          '(EXISTS ( SELECT 1 FROM products p WHERE ((p.id = product_cost_history.product_id) AND (p.marketplace_account_id = ANY (orion_allowed_marketplace_account_ids())))))'
        ELSE
          pg_get_expr(p.polqual, p.polrelid) =
          '(marketplace_account_id = ANY (orion_allowed_marketplace_account_ids()))'
        END
    ) AS scoped_read,
    EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid
        AND p.polname = 'service_role_all_' || t.table_name
        AND p.polcmd = '*'
        AND p.polroles = ARRAY['service_role'::regrole::oid]
    ) AS service_policy,
    NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = t.broad_policy
    ) AS named_broad_gone,
    NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
        AND p.polpermissive
        AND (p.polroles @> ARRAY['authenticated'::regrole::oid]
             OR p.polroles @> ARRAY[0::oid])
        AND pg_get_expr(p.polqual, p.polrelid) = 'true'
    ) AS no_unscoped_authenticated_read
  FROM targets t
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', t.table_name))
)
SELECT table_name,
  COALESCE(relrowsecurity, false) AS rls_enabled,
  COALESCE(NOT anon_select, false) AS anon_denied,
  COALESCE(authenticated_select AND scoped_read, false) AS own_account_path_preserved,
  COALESCE(service_select AND service_policy, false) AS service_path_preserved,
  COALESCE(named_broad_gone AND no_unscoped_authenticated_read, false)
    AS no_broad_authenticated_read
FROM inspected ORDER BY table_name;
