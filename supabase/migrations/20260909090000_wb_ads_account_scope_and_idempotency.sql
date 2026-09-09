-- Advertising warehouse: account scoping + idempotency key for wb_ads.
--
-- WHY
-- ---
-- `wb_ads` was created by 20260623170000 before the multi-tenant foundation
-- (20260626130000) existed, and it was the ONLY warehouse table that migration
-- skipped. Consequences today:
--
--   1. No `marketplace_account_id`. Tenant isolation is achieved transitively —
--      the app filters `product_id IN (account's products)` and RLS joins to
--      `products`. Both break down for a row whose `product_id` is NULL, which
--      is silently invisible instead of loudly wrong.
--   2. No unique constraint of any kind. There is no conflict target, so an
--      idempotent `ON CONFLICT` upsert is impossible and re-running an ads sync
--      would duplicate every row.
--
-- Both must exist BEFORE any advertising ingestion runs. This migration adds
-- them and changes no runtime behaviour on its own.
--
-- Natural key for WB advertising: GET /adv/v3/fullstats returns spend nested as
-- campaign -> day -> platform -> nmId. Summing over platforms, one warehouse row
-- is uniquely identified by (advert campaign, product, day) within one seller
-- account, expressed as source_key = 'adv:{advertId}:{nmId}:{YYYY-MM-DD}'.
--
-- SAFETY
-- ------
-- Additive only. No DROP TABLE, no DELETE, no TRUNCATE, no data rewrite beyond
-- backfilling the new account column from the already-linked product. Every
-- step is guarded by IF [NOT] EXISTS so re-running is a no-op.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_accounts bigint;
BEGIN
  IF to_regclass('public.wb_ads') IS NULL THEN
    RAISE NOTICE 'public.wb_ads does not exist — nothing to do';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_ads'
      AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.wb_ads
      ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'source_key'
  ) THEN
    ALTER TABLE public.wb_ads ADD COLUMN source_key TEXT;
  END IF;

  -- campaign_id exists on the live table but is absent from 20260623170000's
  -- CREATE branch, so a freshly built database would not have it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE public.wb_ads ADD COLUMN campaign_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.wb_ads ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Backfill the account from the product the row is already linked to. This is
  -- the only attribution that was ever trustworthy for legacy rows; rows with a
  -- NULL product_id cannot be attributed and are deliberately left NULL rather
  -- than guessed by supplier_article (which can collide across accounts).
  UPDATE public.wb_ads a
  SET marketplace_account_id = p.marketplace_account_id
  FROM public.products p
  WHERE a.marketplace_account_id IS NULL
    AND a.product_id IS NOT NULL
    AND p.id = a.product_id;

  SELECT count(*) INTO v_null_accounts
  FROM public.wb_ads
  WHERE marketplace_account_id IS NULL;

  IF v_null_accounts = 0 THEN
    ALTER TABLE public.wb_ads ALTER COLUMN marketplace_account_id SET NOT NULL;
    RAISE NOTICE 'wb_ads.marketplace_account_id set NOT NULL';
  ELSE
    -- Leave nullable so the migration never fails on unattributable legacy rows.
    -- Ingestion always writes the column; verify-ads-account-isolation asserts it.
    RAISE WARNING
      'wb_ads.marketplace_account_id left NULLABLE — % row(s) have no attributable product',
      v_null_accounts;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Idempotency + lookup indexes
-- ---------------------------------------------------------------------------
-- Conflict target for the ingestion upsert. Mirrors idx_wb_finance_account_source_key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_ads_account_source_key
  ON public.wb_ads (marketplace_account_id, source_key)
  WHERE source_key IS NOT NULL;

-- Read path: fetchAdsInRange filters by account + campaign_date.
CREATE INDEX IF NOT EXISTS idx_wb_ads_account_date
  ON public.wb_ads (marketplace_account_id, campaign_date);

CREATE INDEX IF NOT EXISTS idx_wb_ads_account_nm
  ON public.wb_ads (marketplace_account_id, nm_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — scope directly on the account instead of joining through products
-- ---------------------------------------------------------------------------
-- 20260729180000 (7.1.D) had to reach tenancy transitively via products because
-- wb_ads had no account column. Now that it does, scope on it directly: this
-- also stops a NULL product_id row from being invisible-but-present.
DO $$
BEGIN
  IF to_regclass('public.wb_ads') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.wb_ads ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS service_role_all_wb_ads ON public.wb_ads;
  DROP POLICY IF EXISTS tenant_select_wb_ads ON public.wb_ads;
  -- Residual permissive policy from 20260623170003; harmless if already dropped.
  DROP POLICY IF EXISTS dashboard_read_anon_auth ON public.wb_ads;

  CREATE POLICY service_role_all_wb_ads
    ON public.wb_ads FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  CREATE POLICY tenant_select_wb_ads
    ON public.wb_ads FOR SELECT TO authenticated
    USING (
      marketplace_account_id IS NOT NULL
      AND marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids())
    );

  REVOKE ALL ON TABLE public.wb_ads FROM anon;
  GRANT SELECT ON TABLE public.wb_ads TO authenticated;
  GRANT ALL ON TABLE public.wb_ads TO service_role;
END $$;

COMMIT;

-- Verification (run separately):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'wb_ads'
--   ORDER BY ordinal_position;
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'wb_ads';
--   -- Expected: idx_wb_ads_account_source_key (UNIQUE), idx_wb_ads_account_date,
--   --           idx_wb_ads_account_nm, idx_wb_ads_date.
--
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--   WHERE polrelid = 'public.wb_ads'::regclass;
--   -- Expected: service_role_all_wb_ads, tenant_select_wb_ads (account-scoped).
