-- READ-ONLY validation queries for a future, separately authorized migration run.
-- This file was NOT EXECUTED against production after any migration.

-- Preconditions: existing state, finance arbiter, catalog and tenant function.
SELECT
  to_regclass('public.finance_incremental_sync_state') IS NOT NULL AS finance_state,
  to_regclass('public.idx_wb_finance_account_source_key_atomic') IS NOT NULL AS finance_arbiter,
  to_regclass('public.marketplace_accounts') IS NOT NULL AS accounts,
  to_regclass('public.product_variants') IS NOT NULL AS variants,
  to_regprocedure('public.orion_allowed_marketplace_account_ids()') IS NOT NULL AS tenant_function;

-- After 20260917120000: expect column and exactly four functions; all four
-- executable by service_role and not by anon/authenticated.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='finance_incremental_sync_state'
    AND column_name='lock_expires_at' AND data_type='timestamp with time zone'
) AS lease_column;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'orion_finance_incremental_acquire_lease',
  'orion_finance_incremental_renew_lease',
  'orion_finance_incremental_commit_lease',
  'orion_finance_incremental_upsert_batch')
ORDER BY p.proname;

-- After 20260917130000: expect table, account+nm PK, RLS, service-only policy/grants.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
  has_table_privilege('service_role',c.oid,'SELECT') AS service_select,
  has_table_privilege('service_role',c.oid,'INSERT') AS service_insert,
  has_table_privilege('service_role',c.oid,'UPDATE') AS service_update,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_read
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='wb_current_prices';
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid=to_regclass('public.wb_current_prices');
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='wb_current_prices';

-- After 20260917140000: expect variant column/index; table PK, RLS,
-- service and tenant policies; service-only replacement RPC.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='product_variants' AND column_name='chrt_id'
) AS variant_chrt,
to_regclass('public.idx_product_variants_account_nm_chrt') IS NOT NULL AS variant_index,
to_regclass('public.idx_wb_current_stocks_account_warehouse') IS NOT NULL AS stock_index;
SELECT c.relname, c.relrowsecurity AS rls_enabled,
  has_table_privilege('service_role',c.oid,'SELECT') AS service_select,
  has_table_privilege('service_role',c.oid,'INSERT') AS service_insert,
  has_table_privilege('service_role',c.oid,'UPDATE') AS service_update,
  has_table_privilege('service_role',c.oid,'DELETE') AS service_delete,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_read
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='wb_current_stocks';
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid=to_regclass('public.wb_current_stocks');
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='wb_current_stocks';
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='replace_wb_current_stocks';
