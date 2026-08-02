-- Sprint 11.5 — Administration Security & Audit (operational visibility)
-- Append-only event store for Audit Logs / Login History / Security Events.
-- Does NOT redesign Authentication, Authorization, or existing RLS policies.
-- service_role writes; authenticated has no access (admin APIs use service_role).

BEGIN;

CREATE TABLE IF NOT EXISTS public.administration_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  user_email text NULL,
  company_id text NULL,
  module text NOT NULL,
  action text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  result text NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  event_kind text NOT NULL CHECK (event_kind IN ('audit', 'login', 'security')),
  reason text NULL,
  correlation_id text NULL,
  device text NULL,
  ip_masked text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS administration_audit_events_created_at_idx
  ON public.administration_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS administration_audit_events_kind_idx
  ON public.administration_audit_events (event_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS administration_audit_events_action_idx
  ON public.administration_audit_events (action, created_at DESC);

CREATE INDEX IF NOT EXISTS administration_audit_events_user_email_idx
  ON public.administration_audit_events (user_email);

CREATE INDEX IF NOT EXISTS administration_audit_events_correlation_id_idx
  ON public.administration_audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE public.administration_audit_events IS
  'Sprint 11.5 — operational security/audit visibility. Never store secret values in metadata.';

ALTER TABLE public.administration_audit_events ENABLE ROW LEVEL SECURITY;

-- Group D style: service_role only (no authenticated policies).
REVOKE ALL ON TABLE public.administration_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.administration_audit_events FROM anon;
REVOKE ALL ON TABLE public.administration_audit_events FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.administration_audit_events TO service_role;

-- RLS status reporter — reads pg_catalog; does not alter policies.
CREATE OR REPLACE FUNCTION public.orion_admin_rls_status()
RETURNS TABLE (
  table_name text,
  rls_enabled boolean,
  policy_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.relname::text AS table_name,
    c.relrowsecurity AS rls_enabled,
    COALESCE(
      (
        SELECT COUNT(*)::integer
        FROM pg_policy p
        WHERE p.polrelid = c.oid
      ),
      0
    ) AS policy_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = ANY (
      ARRAY[
        'companies',
        'marketplace_accounts',
        'products',
        'product_variants',
        'product_cost_history',
        'brands',
        'categories',
        'purchases',
        'purchase_lines',
        'wb_orders',
        'wb_sales',
        'wb_stocks',
        'wb_finance',
        'wb_ads',
        'historical_inventory_snapshots',
        'sync_runs',
        'finance_sync_reports',
        'sync_verification_reports',
        'warehouse_import_audit',
        'administration_audit_events'
      ]
    )
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.orion_admin_rls_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orion_admin_rls_status() FROM anon;
REVOKE ALL ON FUNCTION public.orion_admin_rls_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.orion_admin_rls_status() TO service_role;

COMMIT;
