-- Corrective: HEALTHY is earned via verification — never by migration alone.
-- Idempotent. Does not clear finance data or backfill progress.

-- Ensure ACCOUNT_VERIFICATION is allowed by the check constraint.
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

-- Demote unearned HEALTHY (migration default without verification timestamp).
UPDATE public.marketplace_accounts
SET
  sync_lifecycle_status = 'ACCOUNT_VERIFICATION',
  finance_backfill_error = NULL,
  updated_at = now()
WHERE sync_lifecycle_status = 'HEALTHY'
  AND finance_backfill_verified_at IS NULL;

-- Any remaining NULL status also enters verification (safety for partial applies).
UPDATE public.marketplace_accounts
SET
  sync_lifecycle_status = 'ACCOUNT_VERIFICATION',
  updated_at = now()
WHERE sync_lifecycle_status IS NULL;

COMMENT ON COLUMN public.marketplace_accounts.sync_lifecycle_status IS
  'Lifecycle: NEW_ACCOUNT / ACCOUNT_VERIFICATION → backfill → INCREMENTAL_SYNC_ACTIVE → HEALTHY (earned after verification).';
