-- Sprint 5 Purchase UX: optional exchange rate, currency on header only

BEGIN;

ALTER TABLE public.purchases
  ALTER COLUMN exchange_rate DROP NOT NULL,
  ALTER COLUMN exchange_rate DROP DEFAULT;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_exchange_rate_check;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_exchange_rate_check
  CHECK (exchange_rate IS NULL OR exchange_rate > 0);

ALTER TABLE public.purchase_lines
  DROP COLUMN IF EXISTS currency;

COMMIT;
