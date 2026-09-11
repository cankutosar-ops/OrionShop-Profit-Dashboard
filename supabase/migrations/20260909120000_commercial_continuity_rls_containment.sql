-- Close the commercial continuity PostgREST exposure (baseline D2).
--
-- WHY
-- ---
-- 20260812130000_commercial_data_continuity.sql created
-- commercial_entity_sync_state and commercial_sync_ticks with:
--   - zero ENABLE ROW LEVEL SECURITY
--   - zero CREATE POLICY
--   - GRANT SELECT TO authenticated
-- and also re-granted SELECT on sync_runs to authenticated, undoing the
-- service_role-only intent established by 20260729180000 (7.1.D Group D).
--
-- Live consequence (schema-safety audit):
--   commercial_entity_sync_state — RLS off → authenticated can read all rows
--   commercial_sync_ticks        — RLS off → authenticated can read all rows
--   sync_runs                    — RLS on + service_role-only policy → SELECT
--                                  returns 0 rows, but the grant still wrongly
--                                  invites PostgREST traffic
--
-- Application consumers all use createAdminClient() (service_role):
--   commercial-entity-sync-state-service.ts
--   commercial-continuity-service.ts
--   sync-run-service.ts
--   api/sync/commercial-continuity/status/route.ts
--   lib/commercial-continuity/persist-outcome.ts
-- so tightening authenticated grants / enabling RLS does not change the
-- warehouse read path or the worker sync path.
--
-- PATTERN
-- -------
-- commercial_entity_sync_state follows
-- 20260906150000_finance_incremental_sync_state.sql (tenant SELECT via
-- orion_allowed_marketplace_account_ids()).
-- commercial_sync_ticks has no marketplace_account_id, so it is treated as
-- 7.1.D Group D (service_role only) — do not invent a tenant policy.
-- sync_runs keeps its existing RLS policies; only the authenticated SELECT
-- grant is revoked.
--
-- SAFETY
-- ------
-- No DROP TABLE, DELETE, TRUNCATE, or data rewrite. Idempotent DROP POLICY IF
-- EXISTS / CREATE POLICY. Does not enable ORION_RLS_DATA_PLANE and does not
-- touch residual dashboard_read_anon_auth policies on warehouse fact tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) commercial_entity_sync_state — tenant-scoped SELECT for authenticated
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.commercial_entity_sync_state') IS NULL THEN
    RAISE NOTICE 'commercial_entity_sync_state missing — nothing to do';
    RETURN;
  END IF;

  ALTER TABLE public.commercial_entity_sync_state ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS commercial_entity_sync_state_service
    ON public.commercial_entity_sync_state;
  CREATE POLICY commercial_entity_sync_state_service
    ON public.commercial_entity_sync_state
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

  DROP POLICY IF EXISTS commercial_entity_sync_state_tenant_select
    ON public.commercial_entity_sync_state;
  CREATE POLICY commercial_entity_sync_state_tenant_select
    ON public.commercial_entity_sync_state
    FOR SELECT
    TO authenticated
    USING (
      marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
    );

  REVOKE ALL ON TABLE public.commercial_entity_sync_state FROM PUBLIC;
  REVOKE ALL ON TABLE public.commercial_entity_sync_state FROM anon;
  GRANT SELECT ON TABLE public.commercial_entity_sync_state TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_entity_sync_state TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 2) commercial_sync_ticks — service_role only (no account column)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.commercial_sync_ticks') IS NULL THEN
    RAISE NOTICE 'commercial_sync_ticks missing — nothing to do';
    RETURN;
  END IF;

  ALTER TABLE public.commercial_sync_ticks ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS commercial_sync_ticks_service
    ON public.commercial_sync_ticks;
  CREATE POLICY commercial_sync_ticks_service
    ON public.commercial_sync_ticks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

  -- No tenant policy: table has no marketplace_account_id.
  DROP POLICY IF EXISTS commercial_sync_ticks_tenant_select
    ON public.commercial_sync_ticks;

  REVOKE ALL ON TABLE public.commercial_sync_ticks FROM PUBLIC;
  REVOKE ALL ON TABLE public.commercial_sync_ticks FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_sync_ticks TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 3) sync_runs — restore 7.1.D service-only grant (keep existing RLS/policies)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sync_runs') IS NULL THEN
    RAISE NOTICE 'sync_runs missing — nothing to do';
    RETURN;
  END IF;

  -- Do NOT recreate policies. 7.1.D already enabled RLS with
  -- service_role_all_sync_runs. Only undo the authenticated SELECT re-grant
  -- introduced by 20260812130000.
  REVOKE ALL ON TABLE public.sync_runs FROM anon, authenticated;
  -- Match 7.1.D Group D privilege for service_role (GRANT ALL).
  GRANT ALL ON TABLE public.sync_runs TO service_role;
END $$;

COMMIT;

-- Verification (run separately):
--   SELECT c.relname, c.relrowsecurity,
--          COALESCE(
--            (SELECT string_agg(p.polname, ', ' ORDER BY p.polname)
--             FROM pg_policy p WHERE p.polrelid = c.oid),
--            '(none)'
--          ) AS policies
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN (
--       'commercial_entity_sync_state',
--       'commercial_sync_ticks',
--       'sync_runs'
--     )
--   ORDER BY c.relname;
--
--   Expected:
--     commercial_entity_sync_state — relrowsecurity=true;
--       commercial_entity_sync_state_service,
--       commercial_entity_sync_state_tenant_select
--     commercial_sync_ticks — relrowsecurity=true;
--       commercial_sync_ticks_service only
--     sync_runs — relrowsecurity=true; existing service_role policy unchanged
--
--   Also: npm run verify:rls-7-1-d — authenticated deny on sync_runs must PASS.
