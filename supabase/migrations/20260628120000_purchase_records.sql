-- Sprint 5 Foundation: purchase history (not inventory / not ERP)

BEGIN;

CREATE TABLE IF NOT EXISTS public.purchases (
  id BIGSERIAL PRIMARY KEY,
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchases_currency_check CHECK (currency IN ('USD', 'RUB', 'TRY', 'EUR')),
  CONSTRAINT purchases_exchange_rate_check CHECK (exchange_rate > 0)
);

CREATE TABLE IF NOT EXISTS public.purchase_lines (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_article TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12, 4) NOT NULL CHECK (unit_cost >= 0),
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_lines_currency_check CHECK (currency IN ('USD', 'RUB', 'TRY', 'EUR'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_marketplace_account ON public.purchases (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON public.purchases (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase ON public.purchase_lines (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_product ON public.purchase_lines (product_id);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_read_purchases" ON public.purchases;
CREATE POLICY "dashboard_read_purchases"
  ON public.purchases FOR SELECT TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "service_role_write_purchases" ON public.purchases;
CREATE POLICY "service_role_write_purchases"
  ON public.purchases FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dashboard_read_purchase_lines" ON public.purchase_lines;
CREATE POLICY "dashboard_read_purchase_lines"
  ON public.purchase_lines FOR SELECT TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "service_role_write_purchase_lines" ON public.purchase_lines;
CREATE POLICY "service_role_write_purchase_lines"
  ON public.purchase_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.purchases TO anon, authenticated;
GRANT SELECT ON TABLE public.purchase_lines TO anon, authenticated;
GRANT ALL ON TABLE public.purchases TO service_role;
GRANT ALL ON TABLE public.purchase_lines TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.purchases_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.purchase_lines_id_seq TO service_role;

COMMENT ON TABLE public.purchases IS 'Purchase header — supplier invoice metadata, not stock movement.';
COMMENT ON TABLE public.purchase_lines IS 'Purchase line items; quantity stored for future weighted-average only.';
COMMENT ON COLUMN public.purchase_lines.quantity IS 'Required; not used for stock or Product Analytics yet.';

COMMIT;
