-- LOCAL restored rehearsal only. Read probes, rolled back, never financial writes.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["1"]}}}';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.wb_finance WHERE marketplace_account_id=1)
    OR EXISTS(SELECT 1 FROM public.wb_finance WHERE marketplace_account_id<>1) THEN
    RAISE EXCEPTION 'Finance own/foreign account visibility failed';
  END IF;
END $$;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["2"],"marketplace_account_ids":["2"]}}}';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.wb_finance WHERE marketplace_account_id=2)
    OR EXISTS(SELECT 1 FROM public.wb_finance WHERE marketplace_account_id<>2) THEN
    RAISE EXCEPTION 'Finance second tenant visibility failed';
  END IF;
END $$;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"orion":{"company_ids":["1"],"marketplace_account_ids":["2"]}}}';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.wb_finance) THEN
    RAISE EXCEPTION 'Finance foreign-company claim widened access';
  END IF;
END $$;
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.wb_finance) THEN
    RAISE EXCEPTION 'Finance missing claims widened access';
  END IF;
END $$;
ROLLBACK;
