-- Sprint 7.1.D — Database Security (RLS Rewrite)
-- Tenant isolation via JWT app_metadata.orion.company_ids (Sprint 7.1.C claims).
-- Does NOT redesign application authorization; adds a second DB boundary.
--
-- service_role retains full access for sync / lifecycle / credential ops.
-- authenticated is re-granted only under tenant-aware policies.
-- anon remains denied.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. JWT claim helpers (SECURITY DEFINER — expand companies → accounts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_jwt_company_ids()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT NULLIF(trim(value), '')::BIGINT
      FROM jsonb_array_elements_text(
        COALESCE(
          auth.jwt() -> 'app_metadata' -> 'orion' -> 'company_ids',
          '[]'::jsonb
        )
      ) AS t(value)
      WHERE trim(value) ~ '^[0-9]+$'
    ),
    ARRAY[]::BIGINT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.orion_jwt_marketplace_account_ids_claim()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT NULLIF(trim(value), '')::BIGINT
      FROM jsonb_array_elements_text(
        COALESCE(
          auth.jwt() -> 'app_metadata' -> 'orion' -> 'marketplace_account_ids',
          '[]'::jsonb
        )
      ) AS t(value)
      WHERE trim(value) ~ '^[0-9]+$'
    ),
    ARRAY[]::BIGINT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.orion_allowed_marketplace_account_ids()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed_accounts AS (
    SELECT unnest(public.orion_jwt_marketplace_account_ids_claim()) AS id
  ),
  by_company AS (
    SELECT ma.id
    FROM public.marketplace_accounts ma
    WHERE ma.company_id = ANY (public.orion_jwt_company_ids())
  )
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT bc.id
      FROM by_company bc
      WHERE
        NOT EXISTS (SELECT 1 FROM claimed_accounts)
        OR bc.id IN (SELECT id FROM claimed_accounts)
    ),
    ARRAY[]::BIGINT[]
  );
$$;

REVOKE ALL ON FUNCTION public.orion_jwt_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orion_jwt_marketplace_account_ids_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orion_allowed_marketplace_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orion_jwt_company_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_jwt_marketplace_account_ids_claim() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_allowed_marketplace_account_ids() TO authenticated, service_role;

COMMENT ON FUNCTION public.orion_allowed_marketplace_account_ids() IS
  'Sprint 7.1.D — marketplace accounts allowed for the JWT principal (from orion.company_ids).';

-- ---------------------------------------------------------------------------
-- 2. Close 7.1.A gaps: sync_runs, finance_sync_reports
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sync_runs', 'finance_sync_reports']
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
-- 3. Companies — tenant root (id ∈ JWT company_ids)
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_select_companies" ON public.companies;
DROP POLICY IF EXISTS "service_role_all_companies" ON public.companies;
DROP POLICY IF EXISTS "tenant_select_companies" ON public.companies;
DROP POLICY IF EXISTS "tenant_insert_companies" ON public.companies;
DROP POLICY IF EXISTS "tenant_update_companies" ON public.companies;
DROP POLICY IF EXISTS "tenant_delete_companies" ON public.companies;

CREATE POLICY "service_role_all_companies"
  ON public.companies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_companies"
  ON public.companies FOR SELECT TO authenticated
  USING (id = ANY (public.orion_jwt_company_ids()));

CREATE POLICY "tenant_insert_companies"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_update_companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (id = ANY (public.orion_jwt_company_ids()))
  WITH CHECK (id = ANY (public.orion_jwt_company_ids()));

CREATE POLICY "tenant_delete_companies"
  ON public.companies FOR DELETE TO authenticated
  USING (id = ANY (public.orion_jwt_company_ids()));

REVOKE ALL ON TABLE public.companies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

-- ---------------------------------------------------------------------------
-- 4. marketplace_accounts — by company_id; api_key_encrypted never granted
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_select_marketplace_accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "service_role_all_marketplace_accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "tenant_select_marketplace_accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "tenant_insert_marketplace_accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "tenant_update_marketplace_accounts" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "tenant_delete_marketplace_accounts" ON public.marketplace_accounts;

CREATE POLICY "service_role_all_marketplace_accounts"
  ON public.marketplace_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_marketplace_accounts"
  ON public.marketplace_accounts FOR SELECT TO authenticated
  USING (company_id = ANY (public.orion_jwt_company_ids()));

CREATE POLICY "tenant_insert_marketplace_accounts"
  ON public.marketplace_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id = ANY (public.orion_jwt_company_ids()));

CREATE POLICY "tenant_update_marketplace_accounts"
  ON public.marketplace_accounts FOR UPDATE TO authenticated
  USING (company_id = ANY (public.orion_jwt_company_ids()))
  WITH CHECK (company_id = ANY (public.orion_jwt_company_ids()));

CREATE POLICY "tenant_delete_marketplace_accounts"
  ON public.marketplace_accounts FOR DELETE TO authenticated
  USING (company_id = ANY (public.orion_jwt_company_ids()));

REVOKE ALL ON TABLE public.marketplace_accounts FROM anon, authenticated;
GRANT ALL ON TABLE public.marketplace_accounts TO service_role;

-- Do NOT GRANT SELECT on the base table to authenticated — api_key_encrypted
-- must stay service_role-only. PostgREST does not reliably honor column REVOKE.
-- Use marketplace_accounts_public / orion_list_marketplace_accounts_public instead.

-- Optional public view (no ciphertext). Invoker cannot read base table;
-- prefer orion_list_marketplace_accounts_public() (SECURITY DEFINER + tenant filter).
CREATE OR REPLACE VIEW public.marketplace_accounts_public AS
SELECT
  id,
  company_id,
  marketplace,
  account_name,
  seller_id,
  is_active,
  is_default,
  sync_enabled,
  last_sync_at,
  last_successful_sync_at,
  last_sync_status,
  created_at,
  updated_at
FROM public.marketplace_accounts;

ALTER VIEW public.marketplace_accounts_public SET (security_invoker = false);

GRANT SELECT ON public.marketplace_accounts_public TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_list_marketplace_accounts_public()
RETURNS SETOF public.marketplace_accounts_public
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    company_id,
    marketplace,
    account_name,
    seller_id,
    is_active,
    is_default,
    sync_enabled,
    last_sync_at,
    last_successful_sync_at,
    last_sync_status,
    created_at,
    updated_at
  FROM public.marketplace_accounts
  WHERE company_id = ANY (public.orion_jwt_company_ids());
$$;

REVOKE ALL ON FUNCTION public.orion_list_marketplace_accounts_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orion_list_marketplace_accounts_public() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Group A — marketplace_account_id tables (tenant data)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'wb_orders',
    'wb_sales',
    'wb_finance',
    'product_variants',
    'wb_stock',
    'purchases',
    'historical_inventory_snapshots'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_delete_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'dashboard_read_anon_auth', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all_' || t,
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids()))',
      'tenant_select_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids()))',
      'tenant_insert_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())) WITH CHECK (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids()))',
      'tenant_update_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids()))',
      'tenant_delete_' || t,
      t
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Group C — join-scoped tables
-- ---------------------------------------------------------------------------

-- product_cost_history via products
DO $$
BEGIN
  IF to_regclass('public.product_cost_history') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS service_role_all_product_cost_history ON public.product_cost_history;
  DROP POLICY IF EXISTS tenant_select_product_cost_history ON public.product_cost_history;
  DROP POLICY IF EXISTS tenant_insert_product_cost_history ON public.product_cost_history;
  DROP POLICY IF EXISTS tenant_update_product_cost_history ON public.product_cost_history;
  DROP POLICY IF EXISTS tenant_delete_product_cost_history ON public.product_cost_history;

  CREATE POLICY service_role_all_product_cost_history
    ON public.product_cost_history FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  CREATE POLICY tenant_select_product_cost_history
    ON public.product_cost_history FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_cost_history.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );
  CREATE POLICY tenant_insert_product_cost_history
    ON public.product_cost_history FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_cost_history.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );
  CREATE POLICY tenant_update_product_cost_history
    ON public.product_cost_history FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_cost_history.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_cost_history.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );
  CREATE POLICY tenant_delete_product_cost_history
    ON public.product_cost_history FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_cost_history.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );

  REVOKE ALL ON TABLE public.product_cost_history FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_cost_history TO authenticated;
  GRANT ALL ON TABLE public.product_cost_history TO service_role;
END $$;

-- purchase_lines via purchases
DO $$
BEGIN
  IF to_regclass('public.purchase_lines') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS service_role_all_purchase_lines ON public.purchase_lines;
  DROP POLICY IF EXISTS tenant_select_purchase_lines ON public.purchase_lines;
  DROP POLICY IF EXISTS tenant_write_purchase_lines ON public.purchase_lines;

  CREATE POLICY service_role_all_purchase_lines
    ON public.purchase_lines FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  CREATE POLICY tenant_select_purchase_lines
    ON public.purchase_lines FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.purchases pu
        WHERE pu.id = purchase_lines.purchase_id
          AND pu.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );
  CREATE POLICY tenant_write_purchase_lines
    ON public.purchase_lines FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.purchases pu
        WHERE pu.id = purchase_lines.purchase_id
          AND pu.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.purchases pu
        WHERE pu.id = purchase_lines.purchase_id
          AND pu.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );

  REVOKE ALL ON TABLE public.purchase_lines FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_lines TO authenticated;
  GRANT ALL ON TABLE public.purchase_lines TO service_role;
END $$;

-- wb_ads via products (null product_id denied for authenticated)
DO $$
BEGIN
  IF to_regclass('public.wb_ads') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.wb_ads ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS service_role_all_wb_ads ON public.wb_ads;
  DROP POLICY IF EXISTS tenant_select_wb_ads ON public.wb_ads;

  CREATE POLICY service_role_all_wb_ads
    ON public.wb_ads FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  CREATE POLICY tenant_select_wb_ads
    ON public.wb_ads FOR SELECT TO authenticated
    USING (
      product_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = wb_ads.product_id
          AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
      )
    );

  REVOKE ALL ON TABLE public.wb_ads FROM anon;
  GRANT SELECT ON TABLE public.wb_ads TO authenticated;
  GRANT ALL ON TABLE public.wb_ads TO service_role;
END $$;

-- brands / categories — readable if referenced by an allowed product (shared catalog)
DO $$
BEGIN
  IF to_regclass('public.brands') IS NOT NULL THEN
    ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS service_role_all_brands ON public.brands;
    DROP POLICY IF EXISTS tenant_select_brands ON public.brands;
    CREATE POLICY service_role_all_brands ON public.brands FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY tenant_select_brands ON public.brands FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.brand_id = brands.id
            AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
        )
      );
    REVOKE ALL ON TABLE public.brands FROM anon;
    GRANT SELECT ON TABLE public.brands TO authenticated;
    GRANT ALL ON TABLE public.brands TO service_role;
  END IF;

  IF to_regclass('public.categories') IS NOT NULL THEN
    ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS service_role_all_categories ON public.categories;
    DROP POLICY IF EXISTS tenant_select_categories ON public.categories;
    CREATE POLICY service_role_all_categories ON public.categories FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY tenant_select_categories ON public.categories FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.category_id = categories.id
            AND p.marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
        )
      );
    REVOKE ALL ON TABLE public.categories FROM anon;
    GRANT SELECT ON TABLE public.categories TO authenticated;
    GRANT ALL ON TABLE public.categories TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Group D — service_role only (sync / audit / locks)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouse_entity_sync_state',
    'warehouse_import_audit',
    'sync_verification_reports',
    'sync_runs',
    'finance_sync_reports'
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

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;

COMMIT;
