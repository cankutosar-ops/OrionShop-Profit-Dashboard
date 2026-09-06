-- Production incremental Finance sync state (Reports/V1 detailed).
-- Additive only. Does not alter wb_finance rows or recovery JSON.

CREATE TABLE IF NOT EXISTS public.finance_incremental_sync_state (
  marketplace_account_id BIGINT PRIMARY KEY
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'idle'
    CHECK (mode IN ('idle', 'current_week', 'overlap_revalidation')),
  week_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (week_status IN ('idle', 'in_progress', 'complete')),
  active_week_from DATE,
  active_week_to DATE,
  last_persisted_rrd_id BIGINT NOT NULL DEFAULT 0,
  overlap_revalidate_queue JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_weeks JSONB NOT NULL DEFAULT '{}'::jsonb,
  reports_last_request_at TIMESTAMPTZ,
  reports_next_request_not_before TIMESTAMPTZ,
  reports_server_retry_until TIMESTAMPTZ,
  reports_last_rate_limit_snapshot JSONB,
  lock_owner TEXT,
  lock_heartbeat_at TIMESTAMPTZ,
  lock_started_at TIMESTAMPTZ,
  latest_successful_data_date DATE,
  last_http_status INT,
  last_wake_at TIMESTAMPTZ,
  last_error TEXT,
  last_cursor_before BIGINT,
  last_cursor_after BIGINT,
  last_rows_received INT,
  last_rows_persisted INT,
  last_has_more BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_incremental_sync_state_next_request
  ON public.finance_incremental_sync_state (reports_next_request_not_before);

COMMENT ON TABLE public.finance_incremental_sync_state IS
  'Per-account Reports/V1 detailed incremental cursor, overlap queue, and Reports rate-limit state. Not the historical recovery JSON.';

ALTER TABLE public.finance_incremental_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_incremental_sync_state_service ON public.finance_incremental_sync_state;
CREATE POLICY finance_incremental_sync_state_service
  ON public.finance_incremental_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS finance_incremental_sync_state_tenant_select ON public.finance_incremental_sync_state;
CREATE POLICY finance_incremental_sync_state_tenant_select
  ON public.finance_incremental_sync_state
  FOR SELECT
  TO authenticated
  USING (
    marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
  );

REVOKE ALL ON TABLE public.finance_incremental_sync_state FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_incremental_sync_state FROM anon;
GRANT SELECT ON TABLE public.finance_incremental_sync_state TO authenticated;
GRANT ALL ON TABLE public.finance_incremental_sync_state TO service_role;
