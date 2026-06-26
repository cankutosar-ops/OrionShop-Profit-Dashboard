-- Product Analytics V8 / Sprint 2: SKU variants, order/sale size keys, stock cache
-- BIGINT-safe for live schema (products.id is bigint)

BEGIN;

ALTER TABLE public.wb_orders
  ADD COLUMN IF NOT EXISTS tech_size TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS tech_size TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nm_id BIGINT,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_nm_id ON public.product_variants(nm_id);
CREATE INDEX IF NOT EXISTS idx_wb_orders_barcode ON public.wb_orders(barcode);
CREATE INDEX IF NOT EXISTS idx_wb_sales_barcode ON public.wb_sales(barcode);

CREATE TABLE IF NOT EXISTS public.wb_stock (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  warehouse TEXT,
  quantity INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode, warehouse)
);

CREATE INDEX IF NOT EXISTS idx_wb_stock_product ON public.wb_stock(product_id);

-- Upgrade path if tables were created with UUID schema from an earlier draft
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'nm_id'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_variants'
  ) THEN
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS nm_id BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_stock' AND column_name = 'warehouse'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wb_stock'
  ) THEN
    ALTER TABLE public.wb_stock ADD COLUMN IF NOT EXISTS warehouse TEXT;
    ALTER TABLE public.wb_stock DROP CONSTRAINT IF EXISTS wb_stock_product_id_tech_size_barcode_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_stock_product_size_barcode_wh
      ON public.wb_stock (product_id, tech_size, barcode, warehouse);
  END IF;
END $$;

COMMIT;

-- Dashboard read access for SKU analytics (anon key)
BEGIN;

GRANT SELECT ON TABLE public.product_variants TO anon, authenticated;
GRANT SELECT ON TABLE public.wb_stock TO anon, authenticated;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.product_variants;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.product_variants
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.wb_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.wb_stock;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.wb_stock
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
