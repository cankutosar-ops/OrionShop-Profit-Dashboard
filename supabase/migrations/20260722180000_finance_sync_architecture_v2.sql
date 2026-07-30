-- Finance Sync Architecture V2
-- Lookback revalidation, report discovery audit, sync health, stale-lock columns.
-- Safe to re-run (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1) wb_finance: realization report identity
-- ---------------------------------------------------------------------------
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS realizationreport_id BIGINT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS rrd_id BIGINT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS rr_dt DATE;

CREATE INDEX IF NOT EXISTS idx_wb_finance_account_realizationreport
  ON public.wb_finance (marketplace_account_id, realizationreport_id)
  WHERE realizationreport_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wb_finance_account_rrd
  ON public.wb_finance (marketplace_account_id, rrd_id)
  WHERE rrd_id IS NOT NULL;

COMMENT ON COLUMN public.wb_finance.realizationreport_id IS
  'WB realization report id from reportDetailByPeriod — used for late-report discovery.';
COMMENT ON COLUMN public.wb_finance.rrd_id IS
  'WB rrd_id denormalized from source_key rrd:{id}:{suffix}.';
COMMENT ON COLUMN public.wb_finance.rr_dt IS
  'WB rr_dt (report date) when distinct from operation_date.';

-- Ensure extended finance columns exist (may already be applied)
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_category TEXT;
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS wb_source_suffix TEXT;
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS supplier_oper_name TEXT;
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_nature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_account_source_key
  ON public.wb_finance (marketplace_account_id, source_key)
  WHERE source_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) sync_runs — durable audit for every sync
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  request_id TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual',
  entities TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',
  requested_from DATE,
  requested_to DATE,
  finance_lookback_days INT,
  returned_from DATE,
  returned_to DATE,
  report_ids BIGINT[] NOT NULL DEFAULT '{}',
  rows_fetched INT NOT NULL DEFAULT 0,
  rows_upserted INT NOT NULL DEFAULT 0,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  missing_days DATE[] NOT NULL DEFAULT '{}',
  late_report_ids BIGINT[] NOT NULL DEFAULT '{}',
  recovered_report_ids BIGINT[] NOT NULL DEFAULT '{}',
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  gap_days INT,
  latest_operation_date DATE,
  latest_report_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started
  ON public.sync_runs (marketplace_account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_account_status
  ON public.sync_runs (marketplace_account_id, status);

COMMENT ON TABLE public.sync_runs IS
  'Finance Sync V2 durable audit — every sync records request/return/gap/health.';

-- ---------------------------------------------------------------------------
-- 3) finance_sync_reports — per discovered report per run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_sync_reports (
  id BIGSERIAL PRIMARY KEY,
  sync_run_id UUID NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  realizationreport_id BIGINT NOT NULL,
  date_from DATE,
  date_to DATE,
  create_dt DATE,
  status TEXT NOT NULL DEFAULT 'discovered',
  detail_rows_upserted INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sync_run_id, realizationreport_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_sync_reports_account_report
  ON public.finance_sync_reports (marketplace_account_id, realizationreport_id);

-- ---------------------------------------------------------------------------
-- 4) marketplace_accounts — lookback, gap health, stale-lock
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_lookback_days INT NOT NULL DEFAULT 14;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_gap_warn_days INT NOT NULL DEFAULT 3;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS sync_heartbeat_at TIMESTAMPTZ;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS sync_lock_expires_at TIMESTAMPTZ;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_latest_operation_date DATE;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_latest_report_id BIGINT;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_gap_days INT;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_recovery_needed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_last_sync_run_id UUID;

COMMENT ON COLUMN public.marketplace_accounts.finance_lookback_days IS
  'Finance Sync V2: always re-download this many calendar days (default 14).';
COMMENT ON COLUMN public.marketplace_accounts.finance_gap_warn_days IS
  'Finance Sync V2: warn/recover when (today - latest operation_date) exceeds this.';
COMMENT ON COLUMN public.marketplace_accounts.sync_heartbeat_at IS
  'Last activity timestamp while status=running — used for stale-lock release.';
COMMENT ON COLUMN public.marketplace_accounts.sync_lock_expires_at IS
  'Absolute expiry for RUNNING lock; past this → auto-release.';
