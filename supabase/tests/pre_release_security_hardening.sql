-- Run against the fully migrated disposable database with ON_ERROR_STOP=1.
-- Synthetic rows and role probes are contained in this rolled-back transaction.
BEGIN;

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
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target.oid) THEN
      RAISE EXCEPTION 'RLS disabled on protected table public.%', target.relname;
    END IF;
    IF pg_catalog.has_table_privilege(
      'authenticated', target.oid,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION 'Authenticated DML privilege remains on public.%', target.relname;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid = target.oid
        AND p.polcmd IN ('a', 'w', 'd', '*')
        AND (authenticated_oid = ANY(p.polroles) OR 0::OID = ANY(p.polroles))
    ) THEN
      RAISE EXCEPTION 'Authenticated write policy remains on public.%', target.relname;
    END IF;
  END LOOP;

  IF to_regprocedure('public.orion_allowed_marketplace_account_ids()') IS NOT NULL
    OR to_regprocedure('private.orion_allowed_marketplace_account_ids()') IS NULL THEN
    RAISE EXCEPTION 'Privileged account helper exposure is incorrect';
  END IF;
  IF (SELECT prosecdef FROM pg_catalog.pg_proc
      WHERE oid = 'public.orion_jwt_company_ids()'::regprocedure)
    OR (SELECT prosecdef FROM pg_catalog.pg_proc
        WHERE oid = 'public.orion_jwt_marketplace_account_ids_claim()'::regprocedure) THEN
    RAISE EXCEPTION 'JWT parser helper remains SECURITY DEFINER';
  END IF;
  IF (SELECT prosecdef FROM pg_catalog.pg_proc
      WHERE oid = 'public.orion_list_marketplace_accounts_public()'::regprocedure) THEN
    RAISE EXCEPTION 'Public account list RPC remains SECURITY DEFINER';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'companies', 'marketplace_accounts', 'purchases', 'purchase_lines',
      'company_expenses', 'company_tax_profiles', 'products',
      'product_cost_history', 'wb_orders', 'wb_sales', 'wb_finance'
    ]) AS required(table_name)
    CROSS JOIN pg_catalog.unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privilege(name)
    WHERE NOT pg_catalog.has_table_privilege(
      'service_role', 'public.' || required.table_name, privilege.name
    )
  ) THEN
    RAISE EXCEPTION 'A mutable server route/sync table lost service_role access';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(ARRAY[
        'company_purchase_tax_policies', 'purchase_payment_audit',
        'tax_purchase_recognition_events'
      ]) AS append_only(table_name)
      CROSS JOIN pg_catalog.unnest(ARRAY['SELECT','INSERT']) AS privilege(name)
      WHERE NOT pg_catalog.has_table_privilege(
        'service_role', 'public.' || append_only.table_name, privilege.name
      )
    )
    OR pg_catalog.has_table_privilege(
      'service_role', 'public.company_purchase_tax_policies', 'UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role', 'public.purchase_payment_audit', 'UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role', 'public.tax_purchase_recognition_events', 'UPDATE,DELETE'
    ) THEN
    RAISE EXCEPTION 'Append-only Tax service_role privileges changed';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.orion_append_company_tax_profile(bigint,text,numeric,date,text)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.orion_create_company_with_tax_profile(text,text,text,text,text,boolean,text,numeric,date,text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Tax/company administration service RPC access changed';
  END IF;
END $$;

INSERT INTO public.companies(id, name, status, default_tax_percent)
VALUES
  (900000001, 'Security Fixture A', 'active', 6),
  (900000002, 'Security Fixture B', 'active', 6);

INSERT INTO public.marketplace_accounts(
  id, company_id, marketplace, account_name, seller_id, api_key_encrypted,
  is_active, is_default, sync_enabled
) VALUES
  (900000001, 900000001, 'wildberries', 'Security A', 'security-a', 'ciphertext-a', true, true, false),
  (900000003, 900000001, 'wildberries', 'Security A sibling', 'security-a-sibling', 'ciphertext-a-sibling', true, false, false),
  (900000002, 900000002, 'wildberries', 'Security B', 'security-b', 'ciphertext-b', true, true, false);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"orion":{"company_ids":["900000001"],"marketplace_account_ids":["900000001"],"role":"viewer"}}}';

DO $$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.marketplace_accounts_public) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.marketplace_accounts_public WHERE id = 900000001
    )
    OR EXISTS (
      SELECT 1 FROM public.marketplace_accounts_public WHERE id = 900000002
    )
    OR EXISTS (
      SELECT 1 FROM public.marketplace_accounts_public WHERE id = 900000003
    ) THEN
    RAISE EXCEPTION 'Authenticated account view tenant isolation failed';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.marketplace_accounts) <> 1
    OR EXISTS (
      SELECT 1 FROM public.marketplace_accounts WHERE id IN (900000002, 900000003)
    ) THEN
    RAISE EXCEPTION 'Safe base-column grants bypassed explicit account scope';
  END IF;

  BEGIN
    PERFORM api_key_encrypted
    FROM public.marketplace_accounts
    WHERE id = 900000001;
    RAISE EXCEPTION 'Credential ciphertext was selectable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.companies SET name = 'forbidden' WHERE id = 900000001;
    RAISE EXCEPTION 'Authenticated company update was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.marketplace_accounts WHERE id = 900000001;
    RAISE EXCEPTION 'Authenticated marketplace account delete was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.wb_orders(marketplace_account_id, srid, price_with_disc)
    VALUES (900000001, 'forbidden-browser-write', 1);
    RAISE EXCEPTION 'Authenticated source-fact insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.marketplace_accounts_public;
    RAISE EXCEPTION 'Anon account metadata read was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.wb_sales;
    RAISE EXCEPTION 'Anon protected fact read was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.wb_orders(marketplace_account_id, srid, price_with_disc)
VALUES (900000001, 'service-write-proof', 1);
UPDATE public.wb_orders
SET price_with_disc = 2
WHERE marketplace_account_id = 900000001 AND srid = 'service-write-proof';
DELETE FROM public.wb_orders
WHERE marketplace_account_id = 900000001 AND srid = 'service-write-proof';

DO $$
BEGIN
  IF NOT pg_catalog.has_table_privilege(
    current_user, 'public.finance_sync_reports', 'SELECT,INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION 'finance_sync_reports service access was not retained';
  END IF;
END $$;

ROLLBACK;
