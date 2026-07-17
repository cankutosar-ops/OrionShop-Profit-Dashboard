-- Wildberries Orders API commercial fields for Portal-parity Orders Value KPI.

ALTER TABLE public.wb_orders
  ADD COLUMN IF NOT EXISTS price_with_disc NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.wb_orders
  ADD COLUMN IF NOT EXISTS last_change_date DATE;

COMMENT ON COLUMN public.wb_orders.price_with_disc IS
  'Wildberries Orders API priceWithDisc — seller-discounted price; Portal Orders Value field.';

COMMENT ON COLUMN public.wb_orders.last_change_date IS
  'Wildberries Orders API lastChangeDate — portal date axis for Orders widget.';

CREATE INDEX IF NOT EXISTS idx_wb_orders_last_change_date
  ON public.wb_orders(last_change_date);

