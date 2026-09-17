-- Contain three legacy dashboard SELECT policies that bypass tenant RLS.
-- This migration changes policy metadata only. It does not touch table rows,
-- grants, service_role access, or the tenant-scoped policies.
BEGIN;

DO $$
DECLARE
  target record;
  relation_oid oid;
  scoped_qual text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('wb_orders', 'dashboard_read_orders', 'tenant_select_wb_orders'),
      ('wb_sales', 'dashboard_read_sales', 'tenant_select_wb_sales'),
      ('product_cost_history', 'dashboard_read_costs', 'tenant_select_product_cost_history')
    ) AS targets(table_name, broad_policy, scoped_policy)
  LOOP
    relation_oid := to_regclass(format('public.%I', target.table_name));
    IF relation_oid IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = relation_oid) THEN
      RAISE EXCEPTION 'RLS table public.% is absent or RLS is disabled', target.table_name;
    END IF;

    SELECT pg_get_expr(p.polqual, p.polrelid) INTO scoped_qual
    FROM pg_policy p
    WHERE p.polrelid = relation_oid
      AND p.polname::text = target.scoped_policy
      AND p.polcmd = 'r'
      AND p.polpermissive
      AND p.polroles = ARRAY['authenticated'::regrole::oid];

    IF scoped_qual IS NULL OR position('orion_allowed_marketplace_account_ids()' IN scoped_qual) = 0 THEN
      RAISE EXCEPTION 'Expected authenticated tenant SELECT policy is absent or changed on public.%', target.table_name;
    END IF;
    IF target.table_name = 'product_cost_history' AND position('product_id' IN scoped_qual) = 0 THEN
      RAISE EXCEPTION 'Product Cost SELECT policy no longer joins to product identity';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = relation_oid
        AND p.polname::text = 'service_role_all_' || target.table_name
        AND p.polcmd = '*'
        AND p.polroles = ARRAY['service_role'::regrole::oid]
    ) OR NOT has_table_privilege('service_role', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'Expected service_role access is absent on public.%', target.table_name;
    END IF;
    IF has_table_privilege('anon', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'Anonymous SELECT grant unexpectedly exists on public.%', target.table_name;
    END IF;
    IF NOT has_table_privilege('authenticated', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'Expected authenticated SELECT grant is absent on public.%', target.table_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = relation_oid AND p.polname::text = target.broad_policy
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = relation_oid
        AND p.polname::text = target.broad_policy
        AND p.polcmd = 'r'
        AND p.polpermissive
        AND p.polroles @> ARRAY['authenticated'::regrole::oid]
        AND pg_get_expr(p.polqual, p.polrelid) = 'true'
    ) THEN
      RAISE EXCEPTION 'Legacy dashboard policy has unexpected semantics on public.%', target.table_name;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target.broad_policy, target.table_name);

    IF EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = relation_oid
        AND p.polcmd IN ('r', '*')
        AND p.polpermissive
        AND (p.polroles @> ARRAY['authenticated'::regrole::oid]
             OR p.polroles @> ARRAY[0::oid])
        AND pg_get_expr(p.polqual, p.polrelid) = 'true'
    ) THEN
      RAISE EXCEPTION 'Unscoped authenticated SELECT policy remains on public.%', target.table_name;
    END IF;
  END LOOP;
END $$;

COMMIT;
