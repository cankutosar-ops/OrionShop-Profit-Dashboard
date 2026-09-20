-- LOCAL SYNTHETIC FIXTURE ONLY, after local-rehearsal-forward-assertions.sql.
-- No real users, no Auth platform mutation; every change is rolled back.
BEGIN;
-- Minimal fixture omits the production products SELECT policy. Supply it only
-- within this rolled-back local transaction so cost-policy subqueries can run.
GRANT SELECT ON public.products TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["101"],"role":"viewer"}}}';
DO $$ BEGIN
  IF public.orion_allowed_marketplace_account_ids() <> ARRAY[101::bigint] THEN
    RAISE EXCEPTION 'explicit same-company account restriction failed';
  END IF;
  IF (SELECT count(*) FROM public.wb_sales) <> 1
    OR EXISTS(SELECT 1 FROM public.wb_sales WHERE marketplace_account_id<>101)
    OR EXISTS(SELECT 1 FROM public.wb_orders WHERE marketplace_account_id<>101)
    OR (SELECT count(*) FROM public.product_cost_history) <> 1
    OR (SELECT count(*) FROM public.wb_current_stocks) <> 3 THEN
    RAISE EXCEPTION 'own/foreign tenant row visibility failed';
  END IF;
  IF has_table_privilege(current_user,'public.wb_current_prices','SELECT')
    OR has_table_privilege(current_user,'public.wb_current_stocks','INSERT')
    OR has_function_privilege(current_user,'public.orion_finance_incremental_acquire_lease(bigint,text)','EXECUTE')
    OR has_function_privilege(current_user,'public.replace_wb_current_stocks(bigint,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'service-only boundary leaked';
  END IF;
END $$;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["201"]}}}';
DO $$ BEGIN
  IF cardinality(public.orion_allowed_marketplace_account_ids())<>0
    OR EXISTS(SELECT 1 FROM public.wb_sales) THEN
    RAISE EXCEPTION 'foreign-company account claim widened access';
  END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF has_table_privilege(current_user,'public.wb_sales','SELECT')
    OR has_table_privilege(current_user,'public.wb_current_stocks','SELECT')
    OR has_table_privilege(current_user,'public.wb_current_prices','SELECT') THEN
    RAISE EXCEPTION 'anonymous read grant leaked';
  END IF;
END $$;
ROLLBACK;
