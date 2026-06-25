-- =============================================================================
-- Migration: Align schema to sync service (BIGINT-safe, live-schema aware)
-- =============================================================================
-- Live schema detected (2026-06-23):
--   All PKs/FKs are BIGINT — NOT UUID
--   brands.id, categories.id, products.id, wb_*.id → bigint
--   products.brand_id, products.category_id → bigint
--   order_date / sale_date → timestamptz (kept as-is; sync sends date strings)
--
-- Run AFTER backup. Idempotent — safe to re-run if a prior attempt failed.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: resolve PK column type by table OID (no regclass text parsing)
-- Returns normalized names: 'bigint', 'uuid', 'integer', etc.
-- PostgreSQL internal typname 'int8' is normalized to 'bigint'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.pk_type(p_table regclass)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE t.typname
    WHEN 'int8' THEN 'bigint'
    WHEN 'int4' THEN 'integer'
    WHEN 'int2' THEN 'smallint'
    ELSE t.typname
  END
  FROM pg_index i
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
   AND a.attnum = ANY(i.indkey)
   AND a.attnum > 0
   AND NOT a.attisdropped
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE i.indrelid = p_table::oid
    AND i.indisprimary
  ORDER BY a.attnum
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 0. Cleanup partial failed migration (wrong UUID parent_id)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'parent_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;
    ALTER TABLE public.categories DROP COLUMN parent_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. brands: brand_name → name
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'brand_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.brands RENAME COLUMN brand_name TO name;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.brands ADD COLUMN name TEXT;
    UPDATE public.brands SET name = 'Unknown' WHERE name IS NULL;
    ALTER TABLE public.brands ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. categories: category_name → name, parent_id BIGINT (matches categories.id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.categories'::regclass) INTO v_pk_type;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'category_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.categories RENAME COLUMN category_name TO name;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN name TEXT;
    UPDATE public.categories SET name = 'Uncategorized' WHERE name IS NULL;
    ALTER TABLE public.categories ALTER COLUMN name SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'parent_id'
  ) THEN
    IF v_pk_type = 'bigint' THEN
      ALTER TABLE public.categories ADD COLUMN parent_id BIGINT REFERENCES public.categories(id);
    ELSIF v_pk_type = 'uuid' THEN
      ALTER TABLE public.categories ADD COLUMN parent_id UUID REFERENCES public.categories(id);
    ELSE
      RAISE EXCEPTION 'Unsupported categories.id type: %', v_pk_type;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. products: model_code/product_name → supplier_article/name, add nm_id/barcode
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'supplier_article'
  ) THEN
    ALTER TABLE public.products ADD COLUMN supplier_article TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.products ADD COLUMN name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'nm_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN nm_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE public.products ADD COLUMN barcode TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'model_code'
  ) THEN
    UPDATE public.products SET supplier_article = model_code
    WHERE supplier_article IS NULL AND model_code IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_name'
  ) THEN
    UPDATE public.products SET name = product_name
    WHERE name IS NULL AND product_name IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'supplier_article'
  ) THEN
    UPDATE public.products p SET nm_id = sub.nm_id
    FROM (
      SELECT DISTINCT ON (supplier_article) supplier_article, nm_id
      FROM public.wb_orders
      WHERE supplier_article IS NOT NULL AND nm_id IS NOT NULL
      ORDER BY supplier_article, order_date DESC NULLS LAST
    ) sub
    WHERE p.supplier_article = sub.supplier_article AND p.nm_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'supplier_article'
  ) THEN
    UPDATE public.products p SET nm_id = sub.nm_id
    FROM (
      SELECT DISTINCT ON (supplier_article) supplier_article, nm_id
      FROM public.wb_sales
      WHERE supplier_article IS NOT NULL AND nm_id IS NOT NULL
      ORDER BY supplier_article, sale_date DESC NULLS LAST
    ) sub
    WHERE p.supplier_article = sub.supplier_article AND p.nm_id IS NULL;
  END IF;

  UPDATE public.products SET nm_id = abs(hashtext(supplier_article))
  WHERE nm_id IS NULL AND supplier_article IS NOT NULL;

  UPDATE public.products SET supplier_article = 'unknown-' || id::text WHERE supplier_article IS NULL;
  UPDATE public.products SET name = supplier_article WHERE name IS NULL;

  ALTER TABLE public.products ALTER COLUMN supplier_article SET NOT NULL;
  ALTER TABLE public.products ALTER COLUMN name SET NOT NULL;
  ALTER TABLE public.products ALTER COLUMN nm_id SET NOT NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3b. product_cost_history: align live schema (model_code/cost_price/valid_from)
--     → sync schema (product_id/cost/effective_from)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.products'::regclass) INTO v_pk_type;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_cost_history'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_cost_history' AND column_name = 'product_id'
    ) THEN
      IF v_pk_type = 'bigint' THEN
        ALTER TABLE public.product_cost_history ADD COLUMN product_id BIGINT REFERENCES public.products(id);
      ELSE
        ALTER TABLE public.product_cost_history ADD COLUMN product_id UUID REFERENCES public.products(id);
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_cost_history' AND column_name = 'cost'
    ) THEN
      ALTER TABLE public.product_cost_history ADD COLUMN cost NUMERIC(12, 2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_cost_history' AND column_name = 'effective_from'
    ) THEN
      ALTER TABLE public.product_cost_history ADD COLUMN effective_from DATE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_cost_history' AND column_name = 'effective_to'
    ) THEN
      ALTER TABLE public.product_cost_history ADD COLUMN effective_to DATE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'product_cost_history' AND column_name = 'model_code'
    ) THEN
      UPDATE public.product_cost_history pch SET product_id = p.id
      FROM public.products p
      WHERE pch.product_id IS NULL AND p.supplier_article = pch.model_code;

      UPDATE public.product_cost_history SET cost = cost_price
      WHERE cost IS NULL AND cost_price IS NOT NULL;

      UPDATE public.product_cost_history SET effective_from = valid_from
      WHERE effective_from IS NULL AND valid_from IS NOT NULL;
    END IF;
  ELSE
    CREATE TABLE public.product_cost_history (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES public.products(id),
      cost NUMERIC(12, 2) NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost_price'
  ) THEN
    INSERT INTO public.product_cost_history (product_id, cost, effective_from)
    SELECT p.id, p.cost_price, COALESCE(p.created_at::date, CURRENT_DATE)
    FROM public.products p
    WHERE p.cost_price IS NOT NULL AND p.cost_price > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.product_cost_history pch
        WHERE pch.product_id = p.id AND pch.cost = p.cost_price
      );
    ALTER TABLE public.products DROP COLUMN cost_price;
  END IF;

  ALTER TABLE public.product_cost_history DROP COLUMN IF EXISTS model_code;
  ALTER TABLE public.product_cost_history DROP COLUMN IF EXISTS cost_price;
  ALTER TABLE public.product_cost_history DROP COLUMN IF EXISTS valid_from;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'model_code'
  ) THEN
    ALTER TABLE public.products DROP COLUMN model_code;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_name'
  ) THEN
    ALTER TABLE public.products DROP COLUMN product_name;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_supplier_article ON public.products(supplier_article);

-- ---------------------------------------------------------------------------
-- 4. wb_orders: product_id BIGINT FK, sale_date, status, warehouse
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.products'::regclass) INTO v_pk_type;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'product_id'
  ) THEN
    IF v_pk_type = 'bigint' THEN
      ALTER TABLE public.wb_orders ADD COLUMN product_id BIGINT REFERENCES public.products(id);
    ELSE
      ALTER TABLE public.wb_orders ADD COLUMN product_id UUID REFERENCES public.products(id);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'sale_date'
  ) THEN
    ALTER TABLE public.wb_orders ADD COLUMN sale_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.wb_orders ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'warehouse'
  ) THEN
    ALTER TABLE public.wb_orders ADD COLUMN warehouse TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_orders' AND column_name = 'supplier_article'
  ) THEN
    UPDATE public.wb_orders o SET product_id = p.id
    FROM public.products p
    WHERE o.product_id IS NULL AND o.supplier_article = p.supplier_article;
    ALTER TABLE public.wb_orders DROP COLUMN supplier_article;
  END IF;

  ALTER TABLE public.wb_orders DROP COLUMN IF EXISTS tech_size;

  INSERT INTO public.brands (name) SELECT 'Unknown' WHERE NOT EXISTS (SELECT 1 FROM public.brands);
  INSERT INTO public.categories (name) SELECT 'Uncategorized' WHERE NOT EXISTS (SELECT 1 FROM public.categories);

  INSERT INTO public.products (supplier_article, nm_id, name, brand_id, category_id, barcode)
  SELECT DISTINCT 'nm-' || o.nm_id, o.nm_id, 'nm-' || o.nm_id,
    (SELECT id FROM public.brands LIMIT 1),
    (SELECT id FROM public.categories LIMIT 1), NULL
  FROM public.wb_orders o
  WHERE o.product_id IS NULL AND o.nm_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.nm_id = o.nm_id);

  UPDATE public.wb_orders o SET product_id = p.id
  FROM public.products p WHERE o.product_id IS NULL AND p.nm_id = o.nm_id;

  UPDATE public.products SET brand_id = (SELECT id FROM public.brands LIMIT 1) WHERE brand_id IS NULL;
  UPDATE public.products SET category_id = (SELECT id FROM public.categories LIMIT 1) WHERE category_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_orders_srid ON public.wb_orders(srid);

-- ---------------------------------------------------------------------------
-- 5. wb_sales: product_id BIGINT, revenue, is_return, return_date
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.products'::regclass) INTO v_pk_type;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'product_id'
  ) THEN
    IF v_pk_type = 'bigint' THEN
      ALTER TABLE public.wb_sales ADD COLUMN product_id BIGINT REFERENCES public.products(id);
    ELSE
      ALTER TABLE public.wb_sales ADD COLUMN product_id UUID REFERENCES public.products(id);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'revenue'
  ) THEN
    ALTER TABLE public.wb_sales ADD COLUMN revenue NUMERIC(12, 2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'is_return'
  ) THEN
    ALTER TABLE public.wb_sales ADD COLUMN is_return BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'return_date'
  ) THEN
    ALTER TABLE public.wb_sales ADD COLUMN return_date DATE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'sale_price'
  ) THEN
    UPDATE public.wb_sales SET revenue = sale_price WHERE revenue = 0 AND sale_price IS NOT NULL;
    ALTER TABLE public.wb_sales DROP COLUMN sale_price;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales' AND column_name = 'supplier_article'
  ) THEN
    UPDATE public.wb_sales s SET product_id = p.id
    FROM public.products p WHERE s.product_id IS NULL AND s.supplier_article = p.supplier_article;
    ALTER TABLE public.wb_sales DROP COLUMN supplier_article;
  END IF;

  ALTER TABLE public.wb_sales DROP COLUMN IF EXISTS tech_size;

  UPDATE public.wb_sales s SET product_id = p.id
  FROM public.products p WHERE s.product_id IS NULL AND p.nm_id = s.nm_id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_sales_srid ON public.wb_sales(srid);

-- ---------------------------------------------------------------------------
-- 6. wb_finance: wide → tall (BIGINT ids, BIGINT product_id FK)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.products'::regclass) INTO v_pk_type;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_finance' AND column_name = 'commission'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_finance' AND column_name = 'operation_type'
  ) THEN

    IF v_pk_type = 'bigint' THEN
      CREATE TABLE public.wb_finance_new (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT REFERENCES public.products(id),
        nm_id BIGINT,
        operation_date DATE NOT NULL,
        operation_type TEXT NOT NULL CHECK (
          operation_type IN ('commission','logistics','return_logistics','storage','penalty','other')
        ),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        description TEXT
      );
    ELSE
      CREATE TABLE public.wb_finance_new (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES public.products(id),
        nm_id BIGINT,
        operation_date DATE NOT NULL,
        operation_type TEXT NOT NULL CHECK (
          operation_type IN ('commission','logistics','return_logistics','storage','penalty','other')
        ),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        description TEXT
      );
    END IF;

    INSERT INTO public.wb_finance_new (product_id, nm_id, operation_date, operation_type, amount, description)
    SELECT p.id, p.nm_id, f.report_date, 'commission', f.commission, 'migrated:commission'
    FROM public.wb_finance f
    LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.commission IS NOT NULL AND f.commission <> 0
    UNION ALL
    SELECT p.id, p.nm_id, f.report_date, 'logistics', f.logistics, 'migrated:logistics'
    FROM public.wb_finance f LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.logistics IS NOT NULL AND f.logistics <> 0
    UNION ALL
    SELECT p.id, p.nm_id, f.report_date, 'return_logistics', f.return_logistics, 'migrated:return_logistics'
    FROM public.wb_finance f LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.return_logistics IS NOT NULL AND f.return_logistics <> 0
    UNION ALL
    SELECT p.id, p.nm_id, f.report_date, 'storage', f.storage_fee, 'migrated:storage'
    FROM public.wb_finance f LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.storage_fee IS NOT NULL AND f.storage_fee <> 0
    UNION ALL
    SELECT p.id, p.nm_id, f.report_date, 'penalty', f.penalties, 'migrated:penalty'
    FROM public.wb_finance f LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.penalties IS NOT NULL AND f.penalties <> 0
    UNION ALL
    SELECT p.id, p.nm_id, f.report_date, 'other', f.other_expenses, 'migrated:other'
    FROM public.wb_finance f LEFT JOIN public.products p ON p.supplier_article = f.supplier_article
    WHERE f.other_expenses IS NOT NULL AND f.other_expenses <> 0;

    DROP TABLE public.wb_finance;
    ALTER TABLE public.wb_finance_new RENAME TO wb_finance;

  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_finance' AND column_name = 'operation_type'
  ) THEN
    IF v_pk_type = 'bigint' THEN
      CREATE TABLE public.wb_finance (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT REFERENCES public.products(id),
        nm_id BIGINT,
        operation_date DATE NOT NULL,
        operation_type TEXT NOT NULL CHECK (
          operation_type IN ('commission','logistics','return_logistics','storage','penalty','other')
        ),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        description TEXT
      );
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. wb_ads: extend live table (BIGINT id already exists)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pk_type text;
BEGIN
  SELECT pg_temp.pk_type('public.products'::regclass) INTO v_pk_type;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wb_ads'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'product_id'
    ) THEN
      IF v_pk_type = 'bigint' THEN
        ALTER TABLE public.wb_ads ADD COLUMN product_id BIGINT REFERENCES public.products(id);
      ELSE
        ALTER TABLE public.wb_ads ADD COLUMN product_id UUID REFERENCES public.products(id);
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'nm_id'
    ) THEN
      ALTER TABLE public.wb_ads ADD COLUMN nm_id BIGINT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'campaign_date'
    ) THEN
      ALTER TABLE public.wb_ads ADD COLUMN campaign_date DATE;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'report_date'
      ) THEN
        UPDATE public.wb_ads SET campaign_date = report_date WHERE campaign_date IS NULL;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'clicks'
    ) THEN
      ALTER TABLE public.wb_ads ADD COLUMN clicks INT NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wb_ads' AND column_name = 'impressions'
    ) THEN
      ALTER TABLE public.wb_ads ADD COLUMN impressions INT NOT NULL DEFAULT 0;
    END IF;

    UPDATE public.wb_ads a SET product_id = p.id
    FROM public.products p
    WHERE a.product_id IS NULL AND a.supplier_article = p.supplier_article;
  ELSE
    CREATE TABLE public.wb_ads (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT REFERENCES public.products(id),
      supplier_article TEXT,
      nm_id BIGINT,
      campaign_date DATE NOT NULL DEFAULT CURRENT_DATE,
      spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
      clicks INT NOT NULL DEFAULT 0,
      impressions INT NOT NULL DEFAULT 0
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wb_sales_date ON public.wb_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_wb_sales_product ON public.wb_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_wb_finance_date ON public.wb_finance(operation_date);
CREATE INDEX IF NOT EXISTS idx_wb_finance_type ON public.wb_finance(operation_type);
CREATE INDEX IF NOT EXISTS idx_wb_ads_date ON public.wb_ads(campaign_date);
CREATE INDEX IF NOT EXISTS idx_wb_orders_date ON public.wb_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_cost_history_product ON public.product_cost_history(product_id);

COMMIT;
