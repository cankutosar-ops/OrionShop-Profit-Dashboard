-- Local-only assertions for the additive forward migrations. Run after
-- local-rehearsal-baseline.sql and the four 20260917 migrations in order.
-- Uses only synthetic account IDs 101, 102, and 201.
BEGIN;

DO $$
DECLARE
  state_a jsonb;
  first_batch_count integer;
  second_batch_count integer;
  lines jsonb := '[{"marketplace_account_id":101,"product_id":1001,"nm_id":10001,"operation_date":"2026-09-17","operation_type":"commission","amount":123.45,"source_key":"local-rehearsal-finance-1"}]'::jsonb;
BEGIN
  IF public.orion_finance_incremental_acquire_lease(101, 'owner-a') IS NULL THEN
    RAISE EXCEPTION 'owner-a could not acquire initial lease';
  END IF;
  IF public.orion_finance_incremental_acquire_lease(101, 'owner-b') IS NOT NULL THEN
    RAISE EXCEPTION 'busy lease was unexpectedly replaced';
  END IF;
  IF NOT public.orion_finance_incremental_renew_lease(101, 'owner-a')
     OR public.orion_finance_incremental_renew_lease(101, 'owner-b') THEN
    RAISE EXCEPTION 'lease renewal fencing failed';
  END IF;
  IF public.orion_finance_incremental_acquire_lease(102, 'owner-c') IS NULL THEN
    RAISE EXCEPTION 'independent account lease was blocked';
  END IF;
  first_batch_count := public.orion_finance_incremental_upsert_batch(101, 'owner-a', lines);
  second_batch_count := public.orion_finance_incremental_upsert_batch(101, 'owner-a', lines);
  IF first_batch_count <> 1 OR second_batch_count <> 1
     OR (SELECT count(*) FROM public.wb_finance WHERE marketplace_account_id = 101 AND source_key = 'local-rehearsal-finance-1') <> 1 THEN
    RAISE EXCEPTION 'finance batch was not idempotent';
  END IF;
  SELECT to_jsonb(s) INTO state_a FROM public.finance_incremental_sync_state s WHERE s.marketplace_account_id = 101;
  IF public.orion_finance_incremental_commit_lease(101, 'owner-b', state_a, false) THEN
    RAISE EXCEPTION 'stale owner committed state';
  END IF;
  UPDATE public.finance_incremental_sync_state SET lock_expires_at = clock_timestamp() - interval '1 second' WHERE marketplace_account_id = 101;
  IF public.orion_finance_incremental_acquire_lease(101, 'owner-b') IS NULL THEN
    RAISE EXCEPTION 'expired lease was not recovered';
  END IF;
  SELECT to_jsonb(s) INTO state_a FROM public.finance_incremental_sync_state s WHERE s.marketplace_account_id = 101;
  IF public.orion_finance_incremental_commit_lease(101, 'owner-a', state_a, true)
     OR NOT public.orion_finance_incremental_commit_lease(101, 'owner-b', state_a, true) THEN
    RAISE EXCEPTION 'lease commit fencing failed';
  END IF;
END $$;

INSERT INTO public.wb_current_prices (marketplace_account_id, nm_id, price, currency, observed_at)
VALUES (101, 10001, 1000, 'RUB', '2026-09-17T10:00:00Z'),
       (201, 10001, 2000, 'RUB', '2026-09-17T10:00:00Z')
ON CONFLICT (marketplace_account_id, nm_id) DO UPDATE
  SET price = EXCLUDED.price, currency = EXCLUDED.currency, observed_at = EXCLUDED.observed_at;
INSERT INTO public.wb_current_prices (marketplace_account_id, nm_id, price, currency, observed_at)
VALUES (101, 10001, 1100, 'RUB', '2026-09-17T11:00:00Z')
ON CONFLICT (marketplace_account_id, nm_id) DO UPDATE
  SET price = EXCLUDED.price, currency = EXCLUDED.currency, observed_at = EXCLUDED.observed_at;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wb_current_prices WHERE nm_id = 10001) <> 2
     OR (SELECT price FROM public.wb_current_prices WHERE marketplace_account_id = 101 AND nm_id = 10001) <> 1100 THEN
    RAISE EXCEPTION 'current price identity or update failed';
  END IF;
END $$;

SELECT public.replace_wb_current_stocks(101, '[
  {"nm_id":10001,"chrt_id":11,"warehouse_key":"WH-1","warehouse_name":"WH-1","barcode":"A-S","quantity":5,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"},
  {"nm_id":10001,"chrt_id":12,"warehouse_key":"WH-1","warehouse_name":"WH-1","barcode":"A-M","quantity":7,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"},
  {"nm_id":10001,"chrt_id":11,"warehouse_key":"WH-2","warehouse_name":"WH-2","barcode":"A-S","quantity":9,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"}
]'::jsonb);
SELECT public.replace_wb_current_stocks(201, '[
  {"nm_id":10001,"chrt_id":11,"warehouse_key":"WH-1","warehouse_name":"WH-1","barcode":"B-S","quantity":3,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"}
]'::jsonb);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wb_current_stocks WHERE marketplace_account_id = 101) <> 3
     OR (SELECT count(*) FROM public.wb_current_stocks WHERE marketplace_account_id = 201) <> 1
     OR (SELECT count(DISTINCT barcode) FROM public.wb_current_stocks WHERE marketplace_account_id = 101) <> 2 THEN
    RAISE EXCEPTION 'canonical stock grain collapsed size, warehouse, barcode, or account';
  END IF;
END $$;
-- Repeat an unchanged full snapshot: identity count must remain exactly stable.
SELECT public.replace_wb_current_stocks(101, '[
  {"nm_id":10001,"chrt_id":11,"warehouse_key":"WH-1","warehouse_name":"WH-1","barcode":"A-S","quantity":5,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"},
  {"nm_id":10001,"chrt_id":12,"warehouse_key":"WH-1","warehouse_name":"WH-1","barcode":"A-M","quantity":7,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"},
  {"nm_id":10001,"chrt_id":11,"warehouse_key":"WH-2","warehouse_name":"WH-2","barcode":"A-S","quantity":9,"in_way_to_client":0,"in_way_from_client":0,"observed_at":"2026-09-17T12:00:00Z"}
]'::jsonb);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wb_current_stocks WHERE marketplace_account_id = 101) <> 3 THEN
    RAISE EXCEPTION 'canonical stock re-sync created duplicates';
  END IF;
END $$;

COMMIT;
