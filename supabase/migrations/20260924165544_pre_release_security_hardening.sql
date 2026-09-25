-- Final pre-release containment for browser database access.
-- This migration changes grants, policies, view/function security, and default
-- privileges only. It never rewrites business data.
BEGIN;

-- JWT parsing does not require elevated privileges. Keep these helpers in the
-- exposed schema for existing policies, but execute them as the caller.
CREATE OR REPLACE FUNCTION public.orion_jwt_company_ids()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT NULLIF(pg_catalog.btrim(value), '')::BIGINT
      FROM pg_catalog.jsonb_array_elements_text(
        COALESCE(
          auth.jwt() -> 'app_metadata' -> 'orion' -> 'company_ids',
          '[]'::jsonb
        )
      ) AS t(value)
      WHERE pg_catalog.btrim(value) ~ '^[0-9]+$'
    ),
    ARRAY[]::BIGINT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.orion_jwt_marketplace_account_ids_claim()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT NULLIF(pg_catalog.btrim(value), '')::BIGINT
      FROM pg_catalog.jsonb_array_elements_text(
        COALESCE(
          auth.jwt() -> 'app_metadata' -> 'orion' -> 'marketplace_account_ids',
          '[]'::jsonb
        )
      ) AS t(value)
      WHERE pg_catalog.btrim(value) ~ '^[0-9]+$'
    ),
    ARRAY[]::BIGINT[]
  );
$$;

REVOKE ALL ON FUNCTION public.orion_jwt_company_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orion_jwt_marketplace_account_ids_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orion_jwt_company_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_jwt_marketplace_account_ids_claim() TO authenticated, service_role;

-- Expanding company claims to marketplace-account ownership must read the
-- protected base table without recursively invoking its RLS policy. Move that
-- narrowly privileged helper out of the Data API's exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.orion_allowed_marketplace_account_ids() SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.orion_allowed_marketplace_account_ids()
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN ARRAY[]::BIGINT[]
    ELSE COALESCE(
      ARRAY(
        WITH claimed_accounts AS (
          SELECT pg_catalog.unnest(public.orion_jwt_marketplace_account_ids_claim()) AS id
        )
        SELECT DISTINCT ma.id
        FROM public.marketplace_accounts ma
        WHERE ma.company_id = ANY (public.orion_jwt_company_ids())
          AND (
            NOT EXISTS (SELECT 1 FROM claimed_accounts)
            OR ma.id IN (SELECT id FROM claimed_accounts)
          )
      ),
      ARRAY[]::BIGINT[]
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.orion_allowed_marketplace_account_ids()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.orion_allowed_marketplace_account_ids()
  TO authenticated, service_role;
COMMENT ON FUNCTION private.orion_allowed_marketplace_account_ids() IS
  'Non-exposed RLS helper. Expands signed JWT company/account claims to owned marketplace accounts.';

-- Column grants required by the invoker view also permit explicit safe-column
-- base-table reads. Scope that path to the same account claim as the view so a
-- user restricted to one account cannot enumerate a sibling account.
DROP POLICY IF EXISTS tenant_select_marketplace_accounts
  ON public.marketplace_accounts;
CREATE POLICY tenant_select_marketplace_accounts
  ON public.marketplace_accounts
  FOR SELECT TO authenticated
  USING (id = ANY (private.orion_allowed_marketplace_account_ids()));

-- Existing policies depend on the moved function by object identity. Assert
-- that no callable public SECURITY DEFINER copy remains.
DO $$
BEGIN
  IF to_regprocedure('public.orion_allowed_marketplace_account_ids()') IS NOT NULL
    OR to_regprocedure('private.orion_allowed_marketplace_account_ids()') IS NULL THEN
    RAISE EXCEPTION 'Marketplace account RLS helper was not contained in private schema';
  END IF;
END $$;

-- Remove direct browser writes from every current sync-owned fact/state table
-- and from business tables whose mutations are authorized by server routes.
-- SELECT grants and SELECT policies are intentionally retained.
DO $$
DECLARE
  target RECORD;
  write_policy RECORD;
  authenticated_oid OID := 'authenticated'::regrole::oid;
BEGIN
  FOR target IN
    SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        c.relname LIKE 'wb\_%' ESCAPE '\'
        OR c.relname LIKE 'warehouse\_%' ESCAPE '\'
        OR c.relname LIKE 'finance\_%' ESCAPE '\'
        OR c.relname LIKE 'commercial\_%' ESCAPE '\'
        OR c.relname LIKE 'sync\_%' ESCAPE '\'
        OR c.relname IN (
          'companies', 'marketplace_accounts', 'brands', 'categories',
          'products', 'product_variants', 'product_cost_history',
          'historical_inventory_snapshots', 'purchases', 'purchase_lines',
          'company_tax_profiles', 'company_expenses', 'company_expense_audit',
          'company_purchase_tax_policies', 'purchase_payment_audit',
          'tax_purchase_recognition_events', 'administration_audit_events',
          'platform_settings'
        )
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schema_name, target.table_name);

    FOR write_policy IN
      SELECT p.polname
      FROM pg_catalog.pg_policy p
      WHERE p.polrelid = target.oid
        AND p.polcmd IN ('a', 'w', 'd', '*')
        AND (
          authenticated_oid = ANY (p.polroles)
          OR 0::OID = ANY (p.polroles)
        )
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON %I.%I',
        write_policy.polname,
        target.schema_name,
        target.table_name
      );
    END LOOP;

    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon',
      target.schema_name,
      target.table_name
    );
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM authenticated',
      target.schema_name,
      target.table_name
    );
  END LOOP;
END $$;

-- Sequence access is not needed by read-only browser principals and must not
-- remain as a misleading secondary insertion capability.
DO $$
DECLARE
  seq RECORD;
BEGIN
  FOR seq IN
    SELECT DISTINCT sn.nspname AS schema_name, s.relname AS sequence_name
    FROM pg_catalog.pg_class s
    JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
    JOIN pg_catalog.pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i')
    JOIN pg_catalog.pg_class t ON t.oid = d.refobjid
    JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
    WHERE s.relkind = 'S'
      AND tn.nspname = 'public'
      AND (
        t.relname LIKE 'wb\_%' ESCAPE '\'
        OR t.relname LIKE 'warehouse\_%' ESCAPE '\'
        OR t.relname LIKE 'finance\_%' ESCAPE '\'
        OR t.relname LIKE 'commercial\_%' ESCAPE '\'
        OR t.relname LIKE 'sync\_%' ESCAPE '\'
        OR t.relname IN (
          'companies', 'marketplace_accounts', 'brands', 'categories',
          'products', 'product_variants', 'product_cost_history',
          'historical_inventory_snapshots', 'purchases', 'purchase_lines',
          'company_tax_profiles', 'company_expenses', 'company_expense_audit',
          'company_purchase_tax_policies', 'purchase_payment_audit',
          'tax_purchase_recognition_events', 'administration_audit_events',
          'platform_settings'
        )
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated',
      seq.schema_name,
      seq.sequence_name
    );
  END LOOP;
END $$;

-- Expose only reviewed non-secret marketplace-account metadata. Invoker mode
-- applies the base table RLS policy, while column grants prevent credential
-- ciphertext from being selected directly.
REVOKE ALL ON TABLE public.marketplace_accounts FROM authenticated;
GRANT SELECT (
  id, company_id, marketplace, account_name, seller_id, is_active, is_default,
  sync_enabled, last_sync_at, last_successful_sync_at, last_sync_status,
  created_at, updated_at
) ON TABLE public.marketplace_accounts TO authenticated;

CREATE OR REPLACE VIEW public.marketplace_accounts_public
WITH (security_invoker = true)
AS
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
WHERE current_user = 'service_role'
   OR id = ANY (private.orion_allowed_marketplace_account_ids());

REVOKE ALL ON TABLE public.marketplace_accounts_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_accounts_public TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_list_marketplace_accounts_public()
RETURNS SETOF public.marketplace_accounts_public
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM public.marketplace_accounts_public;
$$;
REVOKE ALL ON FUNCTION public.orion_list_marketplace_accounts_public()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orion_list_marketplace_accounts_public()
  TO authenticated, service_role;

COMMENT ON VIEW public.marketplace_accounts_public IS
  'Security-invoker, tenant-scoped marketplace account metadata. Credential ciphertext is excluded.';
COMMENT ON FUNCTION public.orion_list_marketplace_accounts_public() IS
  'Invoker-mode compatibility RPC over the tenant-scoped non-secret account view.';

-- Prevent future public tables created by postgres from regaining browser DML
-- through role defaults. New browser writes require an explicit reviewed grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated;

-- Fail the migration if the reviewed containment contracts are not present.
DO $$
DECLARE
  target RECORD;
  authenticated_oid OID := 'authenticated'::regrole::oid;
BEGIN
  FOR target IN
    SELECT c.oid, c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        c.relname LIKE 'wb\_%' ESCAPE '\'
        OR c.relname LIKE 'warehouse\_%' ESCAPE '\'
        OR c.relname LIKE 'finance\_%' ESCAPE '\'
        OR c.relname LIKE 'commercial\_%' ESCAPE '\'
        OR c.relname LIKE 'sync\_%' ESCAPE '\'
        OR c.relname IN (
          'companies', 'marketplace_accounts', 'brands', 'categories',
          'products', 'product_variants', 'product_cost_history',
          'historical_inventory_snapshots', 'purchases', 'purchase_lines',
          'company_tax_profiles', 'company_expenses', 'company_expense_audit',
          'company_purchase_tax_policies', 'purchase_payment_audit',
          'tax_purchase_recognition_events', 'administration_audit_events',
          'platform_settings'
        )
      )
  LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = target.oid) THEN
      RAISE EXCEPTION 'RLS is disabled on protected table public.%', target.relname;
    END IF;
    IF pg_catalog.has_table_privilege(
      'authenticated', target.oid,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION 'Authenticated DML privilege remains on public.%', target.relname;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy p
      WHERE p.polrelid = target.oid
        AND p.polcmd IN ('a', 'w', 'd', '*')
        AND (
          authenticated_oid = ANY (p.polroles)
          OR 0::OID = ANY (p.polroles)
        )
    ) THEN
      RAISE EXCEPTION 'Authenticated write policy remains on public.%', target.relname;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_column_grants
    WHERE table_schema = 'public'
      AND table_name = 'marketplace_accounts'
      AND grantee = 'authenticated'
      AND column_name = 'api_key_encrypted'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Credential ciphertext remains selectable by authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'marketplace_accounts_public'
      AND c.relkind = 'v'
      AND COALESCE(c.reloptions, ARRAY[]::TEXT[]) @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'marketplace_accounts_public is not SECURITY INVOKER';
  END IF;
END $$;

COMMIT;
