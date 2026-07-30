-- Marketplace account lifecycle (new-account historical finance backfill → incremental)
-- Safe to re-run (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- Durability: sync lifecycle status + finance historical backfill progress
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS sync_lifecycle_status TEXT;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_from DATE;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_to DATE;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_strategy TEXT;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_started_at TIMESTAMPTZ;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_completed_at TIMESTAMPTZ;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_verified_at TIMESTAMPTZ;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_error TEXT;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS finance_backfill_progress JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Existing accounts must verify before HEALTHY — never auto-promote on migration.
UPDATE public.marketplace_accounts
SET sync_lifecycle_status = 'ACCOUNT_VERIFICATION'
WHERE sync_lifecycle_status IS NULL;

ALTER TABLE public.marketplace_accounts
  ALTER COLUMN sync_lifecycle_status SET DEFAULT 'NEW_ACCOUNT';

ALTER TABLE public.marketplace_accounts
  ALTER COLUMN sync_lifecycle_status SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_accounts_sync_lifecycle_status_check'
  ) THEN
    ALTER TABLE public.marketplace_accounts
      DROP CONSTRAINT marketplace_accounts_sync_lifecycle_status_check;
  END IF;

  ALTER TABLE public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_sync_lifecycle_status_check
    CHECK (
      sync_lifecycle_status IN (
        'NEW_ACCOUNT',
        'ACCOUNT_VERIFICATION',
        'HISTORICAL_BACKFILL_RUNNING',
        'HISTORICAL_BACKFILL_VERIFYING',
        'HISTORICAL_BACKFILL_COMPLETE',
        'INCREMENTAL_SYNC_ACTIVE',
        'HEALTHY',
        'FAILED',
        'PARTIAL',
        'RECOVERING'
      )
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_lifecycle_status
  ON public.marketplace_accounts (sync_lifecycle_status);

COMMENT ON COLUMN public.marketplace_accounts.sync_lifecycle_status IS
  'Lifecycle: NEW_ACCOUNT / ACCOUNT_VERIFICATION → historical backfill → INCREMENTAL_SYNC_ACTIVE → HEALTHY (earned).';
COMMENT ON COLUMN public.marketplace_accounts.finance_backfill_progress IS
  'Durable historical backfill progress: completedWindows, failedWindows, pendingWindows, lastWindow.';
COMMENT ON COLUMN public.marketplace_accounts.finance_backfill_from IS
  'Inclusive start of automatic historical finance backfill (typically year-start).';
COMMENT ON COLUMN public.marketplace_accounts.finance_backfill_to IS
  'Inclusive end of automatic historical finance backfill at start time.';
COMMENT ON COLUMN public.marketplace_accounts.finance_backfill_verified_at IS
  'Set only when verification promotes the account to HEALTHY — migration never sets this.';
