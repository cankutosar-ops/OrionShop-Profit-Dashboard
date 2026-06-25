-- Product Analytics V8: SKU variants, order/sale size keys, stock cache

ALTER TABLE public.wb_orders
  ADD COLUMN IF NOT EXISTS tech_size TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS tech_size TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_wb_orders_barcode ON public.wb_orders(barcode);
CREATE INDEX IF NOT EXISTS idx_wb_sales_barcode ON public.wb_sales(barcode);

CREATE TABLE IF NOT EXISTS public.wb_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  quantity INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode)
);

CREATE INDEX IF NOT EXISTS idx_wb_stock_product ON public.wb_stock(product_id);
