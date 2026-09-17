-- Durable current product-level WB price observations from Content cards.
-- Additive only. This is not Product Cost or historical price reconstruction.
BEGIN;

CREATE TABLE IF NOT EXISTS public.wb_current_prices (
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  nm_id BIGINT NOT NULL,
  price NUMERIC(12, 2),
  currency TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (marketplace_account_id, nm_id),
  CONSTRAINT wb_current_prices_nonnegative CHECK (price IS NULL OR price >= 0)
);

ALTER TABLE public.wb_current_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wb_current_prices_service ON public.wb_current_prices;
CREATE POLICY wb_current_prices_service ON public.wb_current_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.wb_current_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.wb_current_prices TO service_role;

COMMIT;
