-- Finance Coverage V2: signed source evidence and Sales Reports list controls.
-- Additive only. Existing amount values and historical rows are not rewritten.
BEGIN;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS raw_amount NUMERIC;

COMMENT ON COLUMN public.wb_finance.raw_amount IS
  'Signed Reports V1 value before legacy amount normalization. NULL on historical rows where source direction was not retained.';

ALTER TABLE public.warehouse_sales_report_snapshot
  ADD COLUMN IF NOT EXISTS delivery_service_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_storage_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_acceptance_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS deduction_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS additional_payment_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS cashback_amount_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS cashback_discount_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS cashback_commission_change_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_schedule NUMERIC;

COMMENT ON COLUMN public.warehouse_sales_report_snapshot.delivery_service_sum IS
  'Reports V1 list reconciliation control only; never a transactional P&L fact.';
COMMENT ON COLUMN public.warehouse_sales_report_snapshot.cashback_amount_sum IS
  'Reports V1 list reconciliation control only; never a transactional P&L fact.';
COMMENT ON COLUMN public.warehouse_sales_report_snapshot.payment_schedule IS
  'Reports V1 list reconciliation control only; never a transactional P&L fact.';

-- Keep the fenced incremental writer compatible with raw_amount. The lease,
-- account guard, conflict key, and existing amount behavior are unchanged.
CREATE OR REPLACE FUNCTION public.orion_finance_incremental_upsert_batch(
  p_account_id BIGINT, p_owner TEXT, p_lines JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_owner TEXT; v_expires TIMESTAMPTZ; v_count INTEGER;
BEGIN
  SELECT s.lock_owner, s.lock_expires_at INTO v_owner, v_expires
  FROM public.finance_incremental_sync_state AS s
  WHERE s.marketplace_account_id = p_account_id FOR UPDATE;
  IF v_owner IS DISTINCT FROM p_owner OR v_expires IS NULL OR
     v_expires <= clock_timestamp() THEN
    RAISE EXCEPTION 'FINANCE_LEASE_LOST';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) AS x
             WHERE (x->>'marketplace_account_id')::BIGINT IS DISTINCT FROM p_account_id
                OR NULLIF(x->>'source_key', '') IS NULL) THEN
    RAISE EXCEPTION 'Invalid account/source key in finance batch';
  END IF;
  INSERT INTO public.wb_finance AS existing
    (marketplace_account_id, product_id, nm_id, operation_date, operation_type,
     amount, raw_amount, source_key, description, srid, finance_category,
     wb_source_suffix, supplier_oper_name, finance_nature,
     realizationreport_id, rrd_id, rr_dt)
  SELECT p_account_id, x.product_id, x.nm_id, x.operation_date, x.operation_type,
         x.amount, x.raw_amount, x.source_key, x.description, x.srid,
         x.finance_category, x.wb_source_suffix, x.supplier_oper_name,
         x.finance_nature, x.realizationreport_id, x.rrd_id, x.rr_dt
  FROM jsonb_populate_recordset(NULL::public.wb_finance, p_lines) AS x
  WHERE TRUE
  ON CONFLICT (marketplace_account_id, source_key) DO UPDATE SET
    product_id = EXCLUDED.product_id, nm_id = EXCLUDED.nm_id,
    operation_date = EXCLUDED.operation_date,
    operation_type = EXCLUDED.operation_type, amount = EXCLUDED.amount,
    raw_amount = EXCLUDED.raw_amount,
    description = EXCLUDED.description, srid = EXCLUDED.srid,
    finance_category = EXCLUDED.finance_category,
    wb_source_suffix = EXCLUDED.wb_source_suffix,
    supplier_oper_name = EXCLUDED.supplier_oper_name,
    finance_nature = EXCLUDED.finance_nature,
    realizationreport_id = EXCLUDED.realizationreport_id,
    rrd_id = EXCLUDED.rrd_id, rr_dt = EXCLUDED.rr_dt;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.orion_finance_incremental_upsert_batch(BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_finance_incremental_upsert_batch(BIGINT, TEXT, JSONB)
  TO service_role;

COMMIT;
