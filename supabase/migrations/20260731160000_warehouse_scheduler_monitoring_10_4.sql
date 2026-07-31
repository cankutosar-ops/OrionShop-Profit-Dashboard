-- Sprint 10.4 — Warehouse Scheduler & Monitoring (operational platform)
-- Queue, schedule config, sync history, alerts, retry state.
-- No business KPI tables. No marketplace HTTP.

BEGIN;

-- Configurable per-entity schedule intervals (milliseconds)
CREATE TABLE IF NOT EXISTS public.warehouse_schedule_config (
  id BIGSERIAL PRIMARY KEY,
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    REFERENCES public.warehouse_entity_catalog(entity),
  interval_ms BIGINT NOT NULL CHECK (interval_ms > 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_enqueued_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_schedule_config
    UNIQUE (marketplace_type, company_id, marketplace_account_id, entity)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_schedule_account
  ON public.warehouse_schedule_config (marketplace_account_id, enabled);

COMMENT ON TABLE public.warehouse_schedule_config IS
  'Sprint 10.4 — Configurable incremental sync intervals per account/entity.';

-- Sync job queue (one active job per account enforced in application layer)
CREATE TABLE IF NOT EXISTS public.warehouse_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('incremental', 'retry', 'manual')),
  entities TEXT[] NOT NULL DEFAULT '{}',
  trigger_source TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (trigger_source IN ('manual', 'lifecycle', 'scheduled', 'recover', 'replay', 'api')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'running', 'success', 'failed', 'cancelled', 'deduped')),
  priority INT NOT NULL DEFAULT 100,
  dedupe_key TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  session_id UUID
    REFERENCES public.warehouse_sync_sessions(id) ON DELETE SET NULL,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_queue_account_status
  ON public.warehouse_sync_queue (marketplace_account_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_queue_waiting
  ON public.warehouse_sync_queue (status, available_at, created_at)
  WHERE status = 'waiting';

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_sync_queue_active_dedupe
  ON public.warehouse_sync_queue (marketplace_account_id, dedupe_key)
  WHERE status IN ('waiting', 'running');

COMMENT ON TABLE public.warehouse_sync_queue IS
  'Sprint 10.4 — FIFO sync queue; one active job per account; duplicate triggers ignored.';

-- Queryable sync history (every execution)
CREATE TABLE IF NOT EXISTS public.warehouse_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  queue_job_id UUID
    REFERENCES public.warehouse_sync_queue(id) ON DELETE SET NULL,
  session_id UUID
    REFERENCES public.warehouse_sync_sessions(id) ON DELETE SET NULL,
  trigger_source TEXT NOT NULL DEFAULT 'scheduled',
  entity TEXT
    REFERENCES public.warehouse_entity_catalog(entity),
  status TEXT NOT NULL
    CHECK (status IN ('success', 'partial', 'failed', 'cancelled', 'blocked')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  inserted_rows INT NOT NULL DEFAULT 0,
  updated_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  api_calls INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  queue_wait_ms INT,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_history_account_started
  ON public.warehouse_sync_history (marketplace_account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_history_status
  ON public.warehouse_sync_history (status, started_at DESC);

COMMENT ON TABLE public.warehouse_sync_history IS
  'Sprint 10.4 — Persisted sync execution history (operational, queryable).';

-- Operational alerts (no UI notifications in this sprint)
CREATE TABLE IF NOT EXISTS public.warehouse_ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL
    CHECK (alert_type IN (
      'consecutive_failures',
      'long_running_job',
      'stale_data',
      'queue_overflow'
    )),
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouse_ops_alerts_account_open
  ON public.warehouse_ops_alerts (marketplace_account_id, status, created_at DESC);

COMMENT ON TABLE public.warehouse_ops_alerts IS
  'Sprint 10.4 — Alert records for consecutive failures, long jobs, stale data, queue overflow.';

-- Per-entity retry bookkeeping
CREATE TABLE IF NOT EXISTS public.warehouse_retry_state (
  id BIGSERIAL PRIMARY KEY,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    REFERENCES public.warehouse_entity_catalog(entity),
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'pending', 'exhausted')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_retry_state UNIQUE (marketplace_account_id, entity)
);

COMMENT ON TABLE public.warehouse_retry_state IS
  'Sprint 10.4 — Retry only failed entities; never restart completed ones.';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouse_schedule_config',
    'warehouse_sync_queue',
    'warehouse_sync_history',
    'warehouse_ops_alerts',
    'warehouse_retry_state'
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

GRANT USAGE, SELECT ON SEQUENCE public.warehouse_schedule_config_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.warehouse_retry_state_id_seq TO service_role;

COMMIT;
