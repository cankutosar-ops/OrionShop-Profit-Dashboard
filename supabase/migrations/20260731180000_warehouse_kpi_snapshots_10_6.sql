-- Sprint 10.6 — Warehouse KPI snapshots (DB-only Dashboard sources)
-- Populated only by Warehouse synchronization. Business modules read these tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.warehouse_account_balance (
  id BIGSERIAL PRIMARY KEY,
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  currency TEXT,
  current_amount NUMERIC,
  for_withdraw_amount NUMERIC,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_account_balance_account
    UNIQUE (marketplace_account_id)
);

COMMENT ON TABLE public.warehouse_account_balance IS
  'Sprint 10.6 — Latest marketplace wallet balance snapshot (ingestion-only write).';

CREATE TABLE IF NOT EXISTS public.warehouse_sales_report_snapshot (
  id BIGSERIAL PRIMARY KEY,
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  report_id BIGINT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  create_date DATE NOT NULL,
  currency TEXT,
  report_type INT,
  retail_amount_sum NUMERIC,
  for_pay_sum NUMERIC,
  bank_payment_sum NUMERIC,
  seller_finance_name TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_sales_report_snapshot
    UNIQUE (marketplace_account_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_sales_report_account_dates
  ON public.warehouse_sales_report_snapshot (marketplace_account_id, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_warehouse_sales_report_create_date
  ON public.warehouse_sales_report_snapshot (marketplace_account_id, create_date);

COMMENT ON TABLE public.warehouse_sales_report_snapshot IS
  'Sprint 10.6 — Weekly/daily settlement report snapshots for Cash Received / Expected Payout.';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouse_account_balance',
    'warehouse_sales_report_snapshot'
  ]
  LOOP
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

GRANT USAGE, SELECT ON SEQUENCE public.warehouse_account_balance_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.warehouse_sales_report_snapshot_id_seq TO service_role;

COMMIT;
