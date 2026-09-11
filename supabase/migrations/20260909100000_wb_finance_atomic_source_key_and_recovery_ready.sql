-- Reproduce production wb_finance upsert arbiter + recovery readiness gate.
--
-- WHY
-- ---
-- Production already has:
--   1. idx_wb_finance_account_source_key_atomic — non-partial UNIQUE on
--      (marketplace_account_id, source_key), required because PostgREST emits
--      ON CONFLICT (marketplace_account_id, source_key) without an index
--      predicate and cannot infer the partial idx_wb_finance_account_source_key.
--   2. orion_finance_recovery_schema_ready() — fail-closed preflight used by
--      src/lib/wildberries/sync-service.ts before finance recovery acquires a
--      lock or calls Wildberries.
--
-- These were applied to production outside tracked migration history (and later
-- appeared as uncommitted edits to the already-applied
-- 20260722180000_finance_sync_architecture_v2.sql). Editing that historical
-- file in place is wrong: a clean checkout would still diverge from production
-- until a forward migration lands.
--
-- This migration copies the exact production-proven definitions. It is a no-op
-- on a database that already has the index and function.
--
-- SAFETY
-- ------
-- Additive only. IF NOT EXISTS / CREATE OR REPLACE. No DROP TABLE, DELETE,
-- TRUNCATE, or rewrite of wb_finance rows. The partial unique index is left in
-- place — both indexes remain, matching production.

BEGIN;

-- PostgREST emits ON CONFLICT (marketplace_account_id, source_key) without an
-- index predicate. Keep a non-partial unique index so PostgreSQL can infer the
-- arbiter atomically. PostgreSQL still permits multiple NULL source_key rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_account_source_key_atomic
  ON public.wb_finance (marketplace_account_id, source_key);

-- Read-only recovery preflight. Recovery must call this before acquiring a
-- lock or making a Wildberries request and fail closed unless it returns true.
CREATE OR REPLACE FUNCTION public.orion_finance_recovery_schema_ready()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_index AS i
      WHERE i.indrelid = 'public.wb_finance'::regclass
        AND i.indisunique
        AND i.indpred IS NULL
        AND i.indnatts = 2
        AND i.indnkeyatts = 2
        AND i.indkey[0] = (
          SELECT a.attnum
          FROM pg_attribute AS a
          WHERE a.attrelid = i.indrelid
            AND a.attname = 'marketplace_account_id'
            AND NOT a.attisdropped
        )
        AND i.indkey[1] = (
          SELECT a.attnum
          FROM pg_attribute AS a
          WHERE a.attrelid = i.indrelid
            AND a.attname = 'source_key'
            AND NOT a.attisdropped
        )
    )
    AND (
      SELECT count(*) = 7
      FROM pg_attribute
      WHERE attrelid = 'public.wb_finance'::regclass
        AND NOT attisdropped
        AND attname IN (
          'finance_category',
          'wb_source_suffix',
          'supplier_oper_name',
          'finance_nature',
          'realizationreport_id',
          'rrd_id',
          'rr_dt'
        )
    )
    AND (
      SELECT count(*) = 2
      FROM pg_attribute
      WHERE attrelid = 'public.marketplace_accounts'::regclass
        AND NOT attisdropped
        AND attname IN ('sync_heartbeat_at', 'sync_lock_expires_at')
    );
$$;

REVOKE ALL ON FUNCTION public.orion_finance_recovery_schema_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orion_finance_recovery_schema_ready() TO service_role;

COMMIT;
