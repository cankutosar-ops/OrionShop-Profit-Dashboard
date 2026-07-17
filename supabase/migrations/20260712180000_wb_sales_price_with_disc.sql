-- Profit Dashboard V3: persist Sales API commercial and settlement fields on wb_sales.

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS price_with_disc NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS for_pay NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wb_sales.price_with_disc IS
  'Wildberries Sales API priceWithDisc — commercial list price after seller discount.';

COMMENT ON COLUMN public.wb_sales.for_pay IS
  'Wildberries Sales API forPay — goods settlement per sale/return (netForPay building block).';
