-- Company locale metadata + marketplace account sync state

BEGIN;

-- ---------------------------------------------------------------------------
-- companies: timezone, language, is_default (currency + country already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_default ON public.companies (is_default);

-- Ensure exactly one default company when any exist
DO $$
DECLARE
  default_count INT;
  first_id BIGINT;
BEGIN
  SELECT COUNT(*) INTO default_count FROM public.companies WHERE is_default = true;
  IF default_count = 0 AND EXISTS (SELECT 1 FROM public.companies) THEN
    SELECT id INTO first_id FROM public.companies ORDER BY id LIMIT 1;
    UPDATE public.companies SET is_default = true WHERE id = first_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- marketplace_accounts: sync state + default account flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT;

ALTER TABLE public.marketplace_accounts
  DROP CONSTRAINT IF EXISTS marketplace_accounts_last_sync_status_check;

ALTER TABLE public.marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_last_sync_status_check
  CHECK (
    last_sync_status IS NULL
    OR last_sync_status IN ('idle', 'running', 'success', 'partial', 'failed')
  );

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_is_default
  ON public.marketplace_accounts (company_id, is_default);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_sync_enabled
  ON public.marketplace_accounts (sync_enabled);

-- One default account per company
DO $$
DECLARE
  rec RECORD;
  first_account_id BIGINT;
BEGIN
  FOR rec IN SELECT DISTINCT company_id FROM public.marketplace_accounts LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.marketplace_accounts
      WHERE company_id = rec.company_id AND is_default = true
    ) THEN
      SELECT id INTO first_account_id
      FROM public.marketplace_accounts
      WHERE company_id = rec.company_id
      ORDER BY id
      LIMIT 1;

      IF first_account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET is_default = true
        WHERE id = first_account_id;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.companies.timezone IS 'IANA timezone for date display and scheduling.';
COMMENT ON COLUMN public.companies.language IS 'BCP-47 language code (e.g. ru, en).';
COMMENT ON COLUMN public.companies.is_default IS 'Default company when no ?company= param is set.';
COMMENT ON COLUMN public.marketplace_accounts.is_default IS 'Default account for its company when no ?account= param is set.';
COMMENT ON COLUMN public.marketplace_accounts.sync_enabled IS 'When false, sync is blocked for this account.';
COMMENT ON COLUMN public.marketplace_accounts.last_sync_status IS 'idle | running | success | partial | failed';

COMMIT;
