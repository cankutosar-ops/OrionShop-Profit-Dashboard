-- Store Wildberries srid on finance lines for product-level logistics attribution.
-- Re-sync finance after applying to backfill existing rows.

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS srid TEXT;

CREATE INDEX IF NOT EXISTS idx_wb_finance_srid ON public.wb_finance (srid)
  WHERE srid IS NOT NULL;

COMMENT ON COLUMN public.wb_finance.srid IS
  'Wildberries shipment/order id from reportDetailByPeriod; used for purchase-SRID logistics attribution.';
