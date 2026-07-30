-- Sprint 7.1.A — Emergency Security Containment
-- Addresses: SEC-003, SEC-004, SEC-008 (grants), SEC-009
-- Does NOT implement application authentication (SEC-001 → 7.1.B).
--
-- Goal: anon/authenticated PostgREST callers cannot read credentials or
-- financial/operational data, and cannot write any protected tables.
-- Next.js server continues via service_role only.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Marketplace credentials — remove anon/authenticated table SELECT;
--    service_role retains full access. (SEC-003)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "dashboard_read_marketplace_accounts" ON public.marketplace_accounts;

CREATE POLICY "service_role_select_marketplace_accounts"
  ON public.marketplace_accounts
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL ON TABLE public.marketplace_accounts FROM anon, authenticated;
GRANT ALL ON TABLE public.marketplace_accounts TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Companies — same containment (tenant metadata not public). (SEC-009 family)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "dashboard_read_companies" ON public.companies;

CREATE POLICY "service_role_select_companies"
  ON public.companies
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL ON TABLE public.companies FROM anon, authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Financial / commercial tables — revoke anon SELECT. (SEC-009)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wb_sales',
    'wb_orders',
    'wb_finance',
    'wb_ads',
    'product_cost_history',
    'products',
    'brands',
    'categories',
    'product_variants',
    'wb_stock',
    'purchases',
    'purchase_lines'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'dashboard_read_anon_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'dashboard_read_' || t, t);

    -- Ensure RLS on; service_role bypasses RLS but we also grant explicitly.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all_' || t,
      t
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Sequences used by contained tables — anon must not own them.
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'companies_id_seq',
    'marketplace_accounts_id_seq',
    'historical_inventory_snapshots_id_seq',
    'warehouse_entity_sync_state_id_seq'
  ]
  LOOP
    IF to_regclass('public.' || s) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Warehouse / verification — enable RLS, revoke anon writes+reads. (SEC-004)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'historical_inventory_snapshots',
    'warehouse_entity_sync_state',
    'warehouse_import_audit',
    'sync_verification_reports'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all_' || t,
      t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Stop default privileges from re-opening anon SELECT on future tables
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM authenticated;

COMMENT ON POLICY "service_role_select_marketplace_accounts" ON public.marketplace_accounts IS
  'Sprint 7.1.A — credentials and account rows are service_role only; never anon-selectable.';

COMMIT;
