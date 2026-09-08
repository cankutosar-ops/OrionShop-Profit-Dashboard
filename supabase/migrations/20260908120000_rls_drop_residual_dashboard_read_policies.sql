-- P0 Security — remove residual single-tenant read policies missed by 7.1.D.
--
-- 20260623170003_dashboard_anon_read_policies.sql created `dashboard_read_anon_auth`
-- (USING (true)) on brands, categories, products, wb_orders, wb_sales, wb_finance,
-- wb_ads and product_cost_history.
--
-- 20260729140000 (7.1.A) and 20260729180000 (7.1.D) drop that policy for the
-- marketplace_account_id tables, but NOT for:
--     brands, categories, wb_ads, product_cost_history
-- 7.1.D adds tenant_select_* policies to those four and keeps GRANT SELECT for
-- `authenticated`. Because RLS policies are permissive (OR'ed), the leftover
-- USING (true) policy would let ANY authenticated user read every tenant's rows
-- the moment ORION_RLS_DATA_PLANE=1 is enabled.
--
-- This migration only DROPS the over-permissive policy, and only when the
-- tenant-scoped replacement already exists, so no legitimate read is lost.
-- No table data is read or written.

BEGIN;

DO $$
DECLARE
  t text;
  tenant_policy text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brands',
    'categories',
    'wb_ads',
    'product_cost_history'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    tenant_policy := 'tenant_select_' || t;

    IF EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND p.polname = tenant_policy
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'dashboard_read_anon_auth', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'dashboard_read_' || t, t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      RAISE NOTICE 'Dropped residual permissive read policy on public.%', t;
    ELSE
      RAISE NOTICE
        'Skipped public.% — tenant policy % is missing; apply 20260729180000_rls_tenant_isolation_7_1_d.sql first',
        t, tenant_policy;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verification (run separately):
--   SELECT c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid) AS using_expr
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('brands','categories','wb_ads','product_cost_history')
--   ORDER BY c.relname, p.polname;
-- Expected: only service_role_all_* and tenant_select_* remain.
