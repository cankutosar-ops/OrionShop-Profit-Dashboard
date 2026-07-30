-- Sprint 9.5 — Immutable post-sync verification audit history.
-- Read-only snapshots; application must INSERT only (never UPDATE).

CREATE TABLE IF NOT EXISTS public.sync_verification_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_as_of DATE NOT NULL,
  health_score INT NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  overall_result TEXT NOT NULL CHECK (overall_result IN ('PASS', 'WARNING', 'FAIL')),
  schema_status TEXT NOT NULL CHECK (schema_status IN ('PASS', 'FAIL', 'UNKNOWN')),
  orders_status TEXT NOT NULL,
  sales_status TEXT NOT NULL,
  finance_status TEXT NOT NULL,
  inventory_status TEXT NOT NULL,
  sync_status TEXT,
  sync_request_id TEXT,
  sync_duration_ms INT,
  snapshot JSONB NOT NULL,
  failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_verification_reports_account_verified
  ON public.sync_verification_reports (marketplace_account_id, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_verification_reports_result
  ON public.sync_verification_reports (overall_result, verified_at DESC);

COMMENT ON TABLE public.sync_verification_reports IS
  'Sprint 9.5 immutable post-sync verification snapshots — INSERT only; never mutate marketplace data.';

GRANT SELECT, INSERT ON TABLE public.sync_verification_reports TO anon, authenticated, service_role;
