-- Commercial Data Continuity & Freshness
-- Durable per-entity execution/freshness state for Orders / Sales / Finance.
-- Does NOT replace Financial Engine or WbSyncService.
-- Safe to re-run (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1) Ensure sync_runs exists (Finance Sync V2 audit; may be missing on older DBs)
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

-- ---------------------------------------------------------------------------
-- 2) commercial_entity_sync_state — per-account / per-entity durable state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_entity_sync_state (
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('orders', 'sales', 'finance')),
  -- Execution timestamps (when jobs ran)
  last_execution_at TIMESTAMPTZ,
  last_successful_execution_at TIMESTAMPTZ,
  -- Actual data coverage (distinct from execution timestamps)
  latest_data_date DATE,
  -- Status classification
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN (
      'idle',
      'running',
      'success',
      'partial',
      'failed',
      'blocked',
      'rate_limited',
      'permission_denied',
      'external_unavailable',
      'external_delay',
      'warning'
    )),
  failure_class TEXT,
  last_error TEXT,
  -- Retry / recovery
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  -- Last requested window
  last_requested_from DATE,
  last_requested_to DATE,
  last_sync_run_id UUID REFERENCES public.sync_runs(id) ON DELETE SET NULL,
  rows_upserted_last INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (marketplace_account_id, entity)
);

CREATE INDEX IF NOT EXISTS idx_commercial_entity_sync_status
  ON public.commercial_entity_sync_state (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_commercial_entity_sync_account
  ON public.commercial_entity_sync_state (marketplace_account_id);

COMMENT ON TABLE public.commercial_entity_sync_state IS
  'Commercial continuity: per-entity execution vs data coverage for Orders/Sales/Finance. Authoritative after process restart.';

COMMENT ON COLUMN public.commercial_entity_sync_state.latest_data_date IS
  'Actual max order_date / sale_date / operation_date in DB — NOT sync execution time.';

COMMENT ON COLUMN public.commercial_entity_sync_state.last_execution_at IS
  'When the last sync attempt finished (any outcome).';

COMMENT ON COLUMN public.commercial_entity_sync_state.last_successful_execution_at IS
  'When the last successful or external_delay (API empty but healthy) execution finished.';

-- ---------------------------------------------------------------------------
-- 3) commercial_sync_ticks — durable scheduler tick audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_sync_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  accounts_considered INT NOT NULL DEFAULT 0,
  accounts_synced INT NOT NULL DEFAULT 0,
  accounts_skipped INT NOT NULL DEFAULT 0,
  accounts_failed INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_sync_ticks_started
  ON public.commercial_sync_ticks (started_at DESC);

COMMENT ON TABLE public.commercial_sync_ticks IS
  'One row per durable commercial continuity scheduler tick (cron / internal).';

-- Grants (service_role used by sync; authenticated read for monitoring)
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_entity_sync_state TO service_role;
GRANT SELECT ON TABLE public.commercial_entity_sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_sync_ticks TO service_role;
GRANT SELECT ON TABLE public.commercial_sync_ticks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_runs TO service_role;
GRANT SELECT ON TABLE public.sync_runs TO authenticated;
