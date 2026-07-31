-- Sprint 10.1 — Historical Data Warehouse Platform foundation
-- Structural metadata only: checkpoints, sync sessions, entity catalog, raw intake meta.
-- Does NOT backfill marketplace data. Does NOT call marketplace APIs.

BEGIN;

-- Canonical sync entities for the platform blueprint (extends Sprint 11 set with products/prices).
-- Existing warehouse_entity_sync_state / warehouse_import_audit remain for legacy paths.

CREATE TABLE IF NOT EXISTS public.warehouse_entity_catalog (
  entity TEXT PRIMARY KEY
    CHECK (entity IN (
      'products',
      'orders',
      'sales',
      'finance',
      'stocks',
      'prices',
      'inventory'
    )),
  label TEXT NOT NULL,
  layer TEXT NOT NULL DEFAULT 'normalized'
    CHECK (layer IN ('raw', 'normalized', 'analytics', 'application')),
  description TEXT NOT NULL DEFAULT '',
  is_required_for_healthy BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.warehouse_entity_catalog IS
  'Sprint 10.1 — Entity metadata registry for warehouse platform (no sync logic).';

INSERT INTO public.warehouse_entity_catalog (entity, label, layer, description, is_required_for_healthy)
VALUES
  ('products', 'Products', 'normalized', 'Catalog / content identity for SKU joins', true),
  ('orders', 'Orders', 'normalized', 'Order funnel and logistics matching', true),
  ('sales', 'Sales', 'normalized', 'Completed sales / customer payment facts', true),
  ('finance', 'Finance', 'normalized', 'Settlement / finance detail lines', true),
  ('stocks', 'Stocks', 'normalized', 'Point-in-time stock positions', false),
  ('prices', 'Prices', 'normalized', 'Marketplace price observations', false),
  ('inventory', 'Inventory History', 'normalized', 'Historical inventory snapshots', false)
ON CONFLICT (entity) DO NOTHING;

-- Checkpoint: marketplace × company × account × entity × mode
CREATE TABLE IF NOT EXISTS public.warehouse_checkpoints (
  id BIGSERIAL PRIMARY KEY,
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    REFERENCES public.warehouse_entity_catalog(entity),
  mode TEXT NOT NULL
    CHECK (mode IN ('historical_backfill', 'incremental')),
  shard TEXT NOT NULL DEFAULT '',
  cursor TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'paused', 'failed', 'complete')),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INT NOT NULL DEFAULT 0,
  last_successful_sync_at TIMESTAMPTZ,
  last_attempted_sync_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_until TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouse_checkpoints
    UNIQUE (marketplace_type, company_id, marketplace_account_id, entity, mode, shard)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_checkpoints_account
  ON public.warehouse_checkpoints (marketplace_account_id, entity, mode);

CREATE INDEX IF NOT EXISTS idx_warehouse_checkpoints_status
  ON public.warehouse_checkpoints (status);

COMMENT ON TABLE public.warehouse_checkpoints IS
  'Sprint 10.1 — Generic sync checkpoints (marketplace/company/account/entity/mode). Foundation only.';

-- Sync sessions (exist before synchronization logic)
CREATE TABLE IF NOT EXISTS public.warehouse_sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    REFERENCES public.warehouse_entity_catalog(entity),
  mode TEXT NOT NULL
    CHECK (mode IN ('historical_backfill', 'incremental')),
  trigger_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual', 'lifecycle', 'scheduled', 'recover', 'replay')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  checkpoint_id BIGINT
    REFERENCES public.warehouse_checkpoints(id) ON DELETE SET NULL,
  statistics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_sessions_account_started
  ON public.warehouse_sync_sessions (marketplace_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_sync_sessions_status
  ON public.warehouse_sync_sessions (status);

COMMENT ON TABLE public.warehouse_sync_sessions IS
  'Sprint 10.1 — Sync session records (metadata only; no sync execution in this sprint).';

-- Raw layer metadata (landing fingerprints without payload storage in 10.1)
CREATE TABLE IF NOT EXISTS public.warehouse_raw_intake_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID
    REFERENCES public.warehouse_sync_sessions(id) ON DELETE SET NULL,
  marketplace_type TEXT NOT NULL
    CHECK (marketplace_type IN ('wildberries', 'ozon', 'lamoda', 'shopify')),
  company_id BIGINT NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  entity TEXT NOT NULL
    REFERENCES public.warehouse_entity_catalog(entity),
  endpoint_family TEXT NOT NULL DEFAULT '',
  request_fingerprint TEXT,
  window_from TIMESTAMPTZ,
  window_to TIMESTAMPTZ,
  cursor_before TEXT,
  cursor_after TEXT,
  http_status_class TEXT,
  payload_digest TEXT,
  records_read INT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_raw_intake_account
  ON public.warehouse_raw_intake_meta (marketplace_account_id, created_at DESC);

COMMENT ON TABLE public.warehouse_raw_intake_meta IS
  'Sprint 10.1 — Raw layer intake metadata (replayable audit fingerprints; payloads deferred).';

-- Layer registry (documentation of platform layers in DB)
CREATE TABLE IF NOT EXISTS public.warehouse_layer_registry (
  layer TEXT PRIMARY KEY
    CHECK (layer IN ('raw', 'normalized', 'analytics', 'application')),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.warehouse_layer_registry (layer, label, description)
VALUES
  ('raw', 'Raw Layer', 'Landing / intake metadata and replayable sync artifacts'),
  ('normalized', 'Normalized Layer', 'Canonical tenant-scoped warehouse facts'),
  ('analytics', 'Analytics Layer', 'Rebuildable derived marts and rollups'),
  ('application', 'Application Layer', 'Modules that read the project database only')
ON CONFLICT (layer) DO NOTHING;

COMMENT ON TABLE public.warehouse_layer_registry IS
  'Sprint 10.1 — Warehouse platform layer registry (structural documentation).';

-- Security posture aligned with Sprint 7.1.D warehouse tables: service_role only
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouse_entity_catalog',
    'warehouse_checkpoints',
    'warehouse_sync_sessions',
    'warehouse_raw_intake_meta',
    'warehouse_layer_registry'
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

GRANT USAGE, SELECT ON SEQUENCE public.warehouse_checkpoints_id_seq TO service_role;

COMMIT;
