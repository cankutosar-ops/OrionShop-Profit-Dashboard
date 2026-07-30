-- Sprint 11 — Historical Data Warehouse foundation
-- Per-entity sync state + immutable import audit. Does not replace finance lifecycle columns.

CREATE TABLE IF NOT EXISTS public.warehouse_entity_sync_state (
  id BIGSERIAL PRIMARY KEY,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    CHECK (entity IN ('inventory', 'orders', 'sales', 'finance', 'stocks')),
  stage TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage IN (
      'pending',
      'historical_backfill_running',
      'verifying',
      'complete',
      'incremental_sync_active',
      'healthy',
      'failed'
    )),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_failed_sync_at TIMESTAMPTZ,
  current_dataset TEXT,
  current_page INT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_entity_sync_state UNIQUE (marketplace_account_id, entity)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_entity_sync_account
  ON public.warehouse_entity_sync_state (marketplace_account_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_entity_sync_stage
  ON public.warehouse_entity_sync_state (stage);

COMMENT ON TABLE public.warehouse_entity_sync_state IS
  'Sprint 11 — Historical Data Warehouse per-entity sync state (inventory/orders/sales/finance/stocks).';

CREATE TABLE IF NOT EXISTS public.warehouse_import_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    CHECK (entity IN ('inventory', 'orders', 'sales', 'finance', 'stocks')),
  trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'lifecycle', 'recover', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  current_dataset TEXT,
  current_page INT,
  records_read INT NOT NULL DEFAULT 0,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  validation_result TEXT,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_import_audit_account_started
  ON public.warehouse_import_audit (marketplace_account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_import_audit_entity
  ON public.warehouse_import_audit (entity, started_at DESC);

COMMENT ON TABLE public.warehouse_import_audit IS
  'Sprint 11 — Immutable historical import audit log (INSERT/UPDATE finish only).';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warehouse_entity_sync_state TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.warehouse_entity_sync_state_id_seq TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.warehouse_import_audit TO anon, authenticated, service_role;
