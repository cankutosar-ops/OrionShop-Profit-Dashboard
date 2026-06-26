-- Sprint 3 Revision: Company + Marketplace Account architecture
-- Replaces single-store model with multi-marketplace foundation.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'RUB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies (name);

-- ---------------------------------------------------------------------------
-- 2. marketplace_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_accounts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  account_name TEXT NOT NULL,
  seller_id TEXT,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_accounts_marketplace_check
    CHECK (marketplace IN ('wildberries', 'ozon', 'lamoda'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_company ON public.marketplace_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace ON public.marketplace_accounts (marketplace);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_active ON public.marketplace_accounts (is_active);

-- ---------------------------------------------------------------------------
-- 3. Seed default company + Wildberries account (legacy single-tenant)
-- ---------------------------------------------------------------------------
INSERT INTO public.companies (name, country, currency)
SELECT 'Default Company', 'RU', 'RUB'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

DO $$
DECLARE
  default_company_id BIGINT;
  default_account_id BIGINT;
BEGIN
  SELECT id INTO default_company_id FROM public.companies ORDER BY id LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.marketplace_accounts) THEN
    INSERT INTO public.marketplace_accounts (
      company_id, marketplace, account_name, seller_id, api_key_encrypted, is_active
    )
    VALUES (
      default_company_id, 'wildberries', 'Wildberries Default', NULL, '', true
    );
  END IF;

  SELECT id INTO default_account_id
  FROM public.marketplace_accounts
  ORDER BY id
  LIMIT 1;

  -- ---------------------------------------------------------------------------
  -- 4. marketplace_account_id on marketplace tables
  --    (migrate from store_id if Sprint 3 stores migration was applied)
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN store_id TO marketplace_account_id;
    ALTER TABLE public.wb_orders RENAME COLUMN store_id TO marketplace_account_id;
    ALTER TABLE public.wb_sales RENAME COLUMN store_id TO marketplace_account_id;
    ALTER TABLE public.wb_finance RENAME COLUMN store_id TO marketplace_account_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_stock' AND column_name = 'store_id'
    ) THEN
      ALTER TABLE public.wb_stock RENAME COLUMN store_id TO marketplace_account_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'store_id'
    ) THEN
      ALTER TABLE public.product_variants RENAME COLUMN store_id TO marketplace_account_id;
    END IF;
  END IF;

  -- Add column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
  END IF;

  UPDATE public.products
  SET marketplace_account_id = default_account_id
  WHERE marketplace_account_id IS NULL;

  ALTER TABLE public.products ALTER COLUMN marketplace_account_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.wb_orders
      ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
  END IF;
  UPDATE public.wb_orders SET marketplace_account_id = default_account_id WHERE marketplace_account_id IS NULL;
  ALTER TABLE public.wb_orders ALTER COLUMN marketplace_account_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.wb_sales
      ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
  END IF;
  UPDATE public.wb_sales SET marketplace_account_id = default_account_id WHERE marketplace_account_id IS NULL;
  ALTER TABLE public.wb_sales ALTER COLUMN marketplace_account_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_finance' AND column_name = 'marketplace_account_id'
  ) THEN
    ALTER TABLE public.wb_finance
      ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
  END IF;
  UPDATE public.wb_finance SET marketplace_account_id = default_account_id WHERE marketplace_account_id IS NULL;
  ALTER TABLE public.wb_finance ALTER COLUMN marketplace_account_id SET NOT NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wb_stock'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_stock' AND column_name = 'marketplace_account_id'
    ) THEN
      ALTER TABLE public.wb_stock
        ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
    END IF;
    UPDATE public.wb_stock SET marketplace_account_id = default_account_id WHERE marketplace_account_id IS NULL;
    ALTER TABLE public.wb_stock ALTER COLUMN marketplace_account_id SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_variants'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'marketplace_account_id'
    ) THEN
      ALTER TABLE public.product_variants
        ADD COLUMN marketplace_account_id BIGINT REFERENCES public.marketplace_accounts(id);
    END IF;
    UPDATE public.product_variants SET marketplace_account_id = default_account_id WHERE marketplace_account_id IS NULL;
    ALTER TABLE public.product_variants ALTER COLUMN marketplace_account_id SET NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Store-scoped unique indexes → marketplace_account-scoped
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_products_store_supplier_article;
DROP INDEX IF EXISTS public.idx_products_supplier_article;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_account_supplier_article
  ON public.products (marketplace_account_id, supplier_article);

DROP INDEX IF EXISTS public.idx_wb_orders_store_srid;
DROP INDEX IF EXISTS public.idx_wb_orders_srid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_orders_account_srid
  ON public.wb_orders (marketplace_account_id, srid);

DROP INDEX IF EXISTS public.idx_wb_sales_store_srid;
DROP INDEX IF EXISTS public.idx_wb_sales_srid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_sales_account_srid
  ON public.wb_sales (marketplace_account_id, srid);

DROP INDEX IF EXISTS public.idx_wb_finance_store_source_key;
DROP INDEX IF EXISTS public.idx_wb_finance_source_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_account_source_key
  ON public.wb_finance (marketplace_account_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_marketplace_account ON public.products (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_wb_orders_marketplace_account ON public.wb_orders (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_wb_sales_marketplace_account ON public.wb_sales (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_wb_finance_marketplace_account ON public.wb_finance (marketplace_account_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wb_stock') THEN
    CREATE INDEX IF NOT EXISTS idx_wb_stock_marketplace_account ON public.wb_stock (marketplace_account_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_variants') THEN
    CREATE INDEX IF NOT EXISTS idx_product_variants_marketplace_account ON public.product_variants (marketplace_account_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Drop legacy stores table if present
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.stores CASCADE;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_read_companies" ON public.companies;
CREATE POLICY "dashboard_read_companies"
  ON public.companies FOR SELECT TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "service_role_write_companies" ON public.companies;
CREATE POLICY "service_role_write_companies"
  ON public.companies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dashboard_read_marketplace_accounts" ON public.marketplace_accounts;
CREATE POLICY "dashboard_read_marketplace_accounts"
  ON public.marketplace_accounts FOR SELECT TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "service_role_write_marketplace_accounts" ON public.marketplace_accounts;
CREATE POLICY "service_role_write_marketplace_accounts"
  ON public.marketplace_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.companies TO anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_accounts TO anon, authenticated;
GRANT ALL ON TABLE public.companies TO service_role;
GRANT ALL ON TABLE public.marketplace_accounts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.companies_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_accounts_id_seq TO service_role;

COMMENT ON TABLE public.companies IS 'Tenant company — owns multiple marketplace accounts.';
COMMENT ON TABLE public.marketplace_accounts IS 'Marketplace seller account (WB, Ozon, Lamoda). api_key_encrypted only.';
COMMENT ON COLUMN public.marketplace_accounts.api_key_encrypted IS 'AES-256-GCM encrypted API token; never expose to client.';

COMMIT;
