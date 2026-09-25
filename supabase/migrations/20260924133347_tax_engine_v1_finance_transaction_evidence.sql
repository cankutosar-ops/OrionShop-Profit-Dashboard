-- Tax Engine V1 Sprint 3A: normalized WB Finance row-level evidence.
-- Additive only. One row per account + rrd_id; fee-component wb_finance rows remain unchanged.
BEGIN;

CREATE TABLE public.wb_finance_transaction_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  report_id BIGINT NOT NULL,
  rrd_id BIGINT NOT NULL,
  nm_id BIGINT,
  srid TEXT,
  sku TEXT,
  quantity NUMERIC,
  retail_price NUMERIC,
  retail_amount NUMERIC,
  retail_price_with_discount NUMERIC,
  for_pay NUMERIC,
  additional_payment NUMERIC,
  cashback_amount NUMERIC,
  cashback_discount NUMERIC,
  cashback_commission_change NUMERIC,
  doc_type_name TEXT,
  seller_oper_name TEXT,
  sale_dt TIMESTAMPTZ,
  rr_date DATE,
  economic_event_date DATE,
  finance_recognition_date DATE,
  operation_context TEXT NOT NULL CHECK (
    operation_context IN ('SALE','RETURN','CORRECTION','COMPENSATION','OTHER')
  ),
  tax_classification TEXT NOT NULL CHECK (
    tax_classification IN (
      'TAXABLE_SALE','TAXABLE_REFUND','TAXABLE_COMPENSATION',
      'NON_TAXABLE_OPERATION','REVIEW'
    )
  ),
  tax_effective_date DATE,
  tax_effective_date_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (
    tax_effective_date_status IN ('UNVERIFIED','APPROVED')
  ),
  source_api_version TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wb_finance_transaction_evidence_account_rrd
    UNIQUE (marketplace_account_id, rrd_id),
  CONSTRAINT wb_finance_transaction_evidence_tax_date_guard CHECK (
    (tax_effective_date_status = 'APPROVED' AND tax_effective_date IS NOT NULL)
    OR
    (tax_effective_date_status = 'UNVERIFIED' AND tax_effective_date IS NULL)
  )
);

CREATE INDEX idx_wb_finance_transaction_evidence_report
  ON public.wb_finance_transaction_evidence (marketplace_account_id, report_id);
CREATE INDEX idx_wb_finance_transaction_evidence_rr_date
  ON public.wb_finance_transaction_evidence (marketplace_account_id, rr_date);
CREATE INDEX idx_wb_finance_transaction_evidence_sale_date
  ON public.wb_finance_transaction_evidence (marketplace_account_id, economic_event_date);

COMMENT ON TABLE public.wb_finance_transaction_evidence IS
  'One immutable-identity WB Finance Reports V1 source row per account/rrdId. Tax policy remains fail-closed until date, compensation and VAT treatment are approved.';
COMMENT ON COLUMN public.wb_finance_transaction_evidence.retail_amount IS
  'Raw Reports V1 retailAmount value; never copied onto per-suffix wb_finance rows.';
COMMENT ON COLUMN public.wb_finance_transaction_evidence.tax_classification IS
  'Evidence classification only. REVIEW is excluded from a verified taxable-revenue result.';

ALTER TABLE public.wb_finance_transaction_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_wb_finance_transaction_evidence
  ON public.wb_finance_transaction_evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.wb_finance_transaction_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.wb_finance_transaction_evidence TO service_role;

-- Incremental finance wakes retain the same atomic lease/fencing requirement.
CREATE FUNCTION public.orion_finance_transaction_evidence_upsert_batch(
  p_account_id BIGINT, p_owner TEXT, p_rows JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_owner TEXT; v_expires TIMESTAMPTZ; v_count INTEGER;
BEGIN
  IF p_owner IS NOT NULL THEN
    SELECT s.lock_owner, s.lock_expires_at INTO v_owner, v_expires
    FROM public.finance_incremental_sync_state AS s
    WHERE s.marketplace_account_id = p_account_id FOR UPDATE;
    IF v_owner IS DISTINCT FROM p_owner OR v_expires IS NULL OR
       v_expires <= clock_timestamp() THEN
      RAISE EXCEPTION 'FINANCE_LEASE_LOST';
    END IF;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR
     EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_rows) AS x
       WHERE (x->>'marketplace_account_id')::BIGINT IS DISTINCT FROM p_account_id
          OR NULLIF(x->>'rrd_id', '') IS NULL
          OR NULLIF(x->>'report_id', '') IS NULL
     ) THEN
    RAISE EXCEPTION 'Invalid account/identity in finance evidence batch';
  END IF;

  INSERT INTO public.wb_finance_transaction_evidence AS existing
    (marketplace_account_id, report_id, rrd_id, nm_id, srid, sku, quantity,
     retail_price, retail_amount, retail_price_with_discount, for_pay,
     additional_payment, cashback_amount, cashback_discount,
     cashback_commission_change, doc_type_name, seller_oper_name,
     sale_dt, rr_date, economic_event_date, finance_recognition_date,
     operation_context, tax_classification, tax_effective_date,
     tax_effective_date_status, source_api_version, observed_at)
  SELECT p_account_id, x.report_id, x.rrd_id, x.nm_id, x.srid, x.sku, x.quantity,
         x.retail_price, x.retail_amount, x.retail_price_with_discount, x.for_pay,
         x.additional_payment, x.cashback_amount, x.cashback_discount,
         x.cashback_commission_change, x.doc_type_name,
         x.seller_oper_name, x.sale_dt, x.rr_date, x.economic_event_date,
         x.finance_recognition_date, x.operation_context, x.tax_classification,
         x.tax_effective_date, x.tax_effective_date_status,
         x.source_api_version, x.observed_at
  FROM jsonb_populate_recordset(
    NULL::public.wb_finance_transaction_evidence, p_rows
  ) AS x
  ON CONFLICT (marketplace_account_id, rrd_id) DO UPDATE SET
    report_id = EXCLUDED.report_id,
    nm_id = EXCLUDED.nm_id,
    srid = EXCLUDED.srid,
    sku = EXCLUDED.sku,
    quantity = EXCLUDED.quantity,
    retail_price = EXCLUDED.retail_price,
    retail_amount = EXCLUDED.retail_amount,
    retail_price_with_discount = EXCLUDED.retail_price_with_discount,
    for_pay = EXCLUDED.for_pay,
    additional_payment = EXCLUDED.additional_payment,
    cashback_amount = EXCLUDED.cashback_amount,
    cashback_discount = EXCLUDED.cashback_discount,
    cashback_commission_change = EXCLUDED.cashback_commission_change,
    doc_type_name = EXCLUDED.doc_type_name,
    seller_oper_name = EXCLUDED.seller_oper_name,
    sale_dt = EXCLUDED.sale_dt,
    rr_date = EXCLUDED.rr_date,
    economic_event_date = EXCLUDED.economic_event_date,
    finance_recognition_date = EXCLUDED.finance_recognition_date,
    operation_context = EXCLUDED.operation_context,
    tax_classification = EXCLUDED.tax_classification,
    source_api_version = EXCLUDED.source_api_version,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.orion_finance_transaction_evidence_upsert_batch(BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_finance_transaction_evidence_upsert_batch(BIGINT, TEXT, JSONB)
  TO service_role;

COMMIT;
