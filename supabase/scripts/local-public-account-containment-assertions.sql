-- LOCAL RESTORED COPY ONLY, accounts 1/company 1 and 2/company 2.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["1"]}}}';
DO $$ BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.marketplace_accounts_public) <> ARRAY[1::bigint]
    OR (SELECT array_agg(id ORDER BY id) FROM public.orion_list_marketplace_accounts_public()) <> ARRAY[1::bigint] THEN
    RAISE EXCEPTION 'metadata view/RPC account isolation failed';
  END IF;
  IF has_table_privilege(current_user,'public.marketplace_accounts','SELECT') THEN
    RAISE EXCEPTION 'ciphertext base table readable';
  END IF;
END $$;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["2"]}}}';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.marketplace_accounts_public)
    OR EXISTS(SELECT 1 FROM public.orion_list_marketplace_accounts_public()) THEN
    RAISE EXCEPTION 'metadata foreign-company access failed';
  END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.marketplace_accounts_public) <> (SELECT count(*) FROM public.marketplace_accounts)
    OR (SELECT count(*) FROM public.orion_list_marketplace_accounts_public()) <> (SELECT count(*) FROM public.marketplace_accounts) THEN
    RAISE EXCEPTION 'service metadata access lost';
  END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF has_table_privilege(current_user,'public.marketplace_accounts_public','SELECT')
    OR has_function_privilege(current_user,'public.orion_list_marketplace_accounts_public()','EXECUTE') THEN
    RAISE EXCEPTION 'anonymous metadata access leaked';
  END IF;
END $$;
ROLLBACK;
