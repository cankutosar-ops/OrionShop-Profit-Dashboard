-- Advertising warehouse: PostgREST-compatible UNIQUE arbiter for wb_ads upserts.
--
-- WHY
-- ---
-- 20260909090000_wb_ads_account_scope_and_idempotency.sql (still unapplied)
-- creates a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX idx_wb_ads_account_source_key
--     ON public.wb_ads (marketplace_account_id, source_key)
--     WHERE source_key IS NOT NULL;
--
-- src/services/advertising-sync-service.ts upserts with:
--
--   onConflict: "marketplace_account_id,source_key"
--
-- PostgREST emits ON CONFLICT (marketplace_account_id, source_key) without an
-- index predicate. PostgreSQL cannot infer a partial index as the arbiter, so
-- the first real ads upsert would fail with 42P10.
--
-- wb_finance already hit this exact failure mode; production carries both the
-- partial idx_wb_finance_account_source_key and the non-partial
-- idx_wb_finance_account_source_key_atomic. This migration mirrors that fix
-- for wb_ads.
--
-- STRATEGY
-- --------
-- 20260909090000 is unapplied, so amending it in place was considered. A
-- separate forward migration is safer: the original migration's review surface
-- stays intact, the arbiter fix is an explicit audit artefact, and apply order
-- documents the dependency the same way wb_finance did.
--
-- Both indexes remain. The partial index continues to document the
-- source_key-not-null uniqueness contract; the non-partial index is the
-- PostgREST ON CONFLICT arbiter. Do not DROP the partial index.
--
-- SAFETY
-- ------
-- Additive only. IF NOT EXISTS via dynamic SQL. No DROP TABLE, DELETE,
-- TRUNCATE, or policy changes. Safe when 20260909090000 has not yet run
-- (no-op if wb_ads or the columns are absent) and safe when the atomic index
-- already exists.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.wb_ads') IS NULL THEN
    RAISE NOTICE 'public.wb_ads does not exist — nothing to do';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wb_ads'
      AND column_name = 'marketplace_account_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wb_ads'
      AND column_name = 'source_key'
  ) THEN
    RAISE NOTICE
      'wb_ads marketplace_account_id/source_key absent — apply 20260909090000 first';
    RETURN;
  END IF;

  -- PostgREST emits ON CONFLICT (marketplace_account_id, source_key) without an
  -- index predicate. Keep a non-partial unique index so PostgreSQL can infer the
  -- arbiter atomically. PostgreSQL still permits multiple NULL source_key rows.
  EXECUTE $sql$
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_ads_account_source_key_atomic
      ON public.wb_ads (marketplace_account_id, source_key)
  $sql$;

  RAISE NOTICE 'idx_wb_ads_account_source_key_atomic ensured';
END $$;

COMMIT;

-- Verification (run separately after apply):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'wb_ads'
--     AND indexname LIKE 'idx_wb_ads_account_source_key%';
--   -- Expected both:
--   --   idx_wb_ads_account_source_key         (partial WHERE source_key IS NOT NULL)
--   --   idx_wb_ads_account_source_key_atomic  (non-partial)
