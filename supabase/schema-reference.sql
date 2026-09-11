-- Reference schema for OrionShop Profit Dashboard
-- These tables should already exist in your Supabase project.

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_article TEXT NOT NULL UNIQUE,
  nm_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id),
  category_id UUID REFERENCES categories(id),
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wildberries Orders
CREATE TABLE IF NOT EXISTS wb_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srid TEXT NOT NULL,
  nm_id BIGINT NOT NULL,
  product_id UUID REFERENCES products(id),
  order_date DATE NOT NULL,
  sale_date DATE,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_with_disc NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_change_date DATE,
  quantity INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new',
  warehouse TEXT,
  tech_size TEXT,
  barcode TEXT
);

-- Wildberries Sales
CREATE TABLE IF NOT EXISTS wb_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('SALE', 'RETURN')),
  srid TEXT NOT NULL,
  nm_id BIGINT NOT NULL,
  nm_id BIGINT NOT NULL,
  product_id UUID REFERENCES products(id),
  sale_date DATE NOT NULL,
  revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_with_disc NUMERIC(12, 2) NOT NULL DEFAULT 0,
  for_pay NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  is_return BOOLEAN NOT NULL DEFAULT false,
  return_date DATE,
  warehouse TEXT,
  tech_size TEXT,
  barcode TEXT
);

-- Wildberries Finance (commissions, logistics, storage, penalties)
CREATE TABLE IF NOT EXISTS wb_finance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  nm_id BIGINT,
  operation_date DATE NOT NULL,
  operation_type TEXT NOT NULL CHECK (
    operation_type IN ('commission', 'logistics', 'return_logistics', 'storage', 'penalty', 'other')
  ),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  source_key TEXT,
  description TEXT,
  srid TEXT,
  finance_category TEXT,
  wb_source_suffix TEXT,
  supplier_oper_name TEXT,
  finance_nature TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_source_key_unique
  ON wb_finance (source_key)
  WHERE source_key IS NOT NULL;

-- Wildberries Advertising
CREATE TABLE IF NOT EXISTS wb_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  supplier_article TEXT,
  nm_id BIGINT,
  campaign_date DATE NOT NULL,
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0
);

-- Product Cost History (COGS tracking)
CREATE TABLE IF NOT EXISTS product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  cost NUMERIC(12, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for dashboard query performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_sales_account_sale_id
  ON wb_sales (marketplace_account_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_wb_sales_account_srid_lookup
  ON wb_sales (marketplace_account_id, srid);
CREATE INDEX IF NOT EXISTS idx_wb_sales_date ON wb_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_wb_sales_product ON wb_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_wb_finance_date ON wb_finance(operation_date);
CREATE INDEX IF NOT EXISTS idx_wb_finance_type ON wb_finance(operation_type);
CREATE INDEX IF NOT EXISTS idx_wb_ads_date ON wb_ads(campaign_date);
CREATE INDEX IF NOT EXISTS idx_wb_orders_date ON wb_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_products_supplier_article ON products(supplier_article);
CREATE INDEX IF NOT EXISTS idx_cost_history_product ON product_cost_history(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode)
);

CREATE TABLE IF NOT EXISTS wb_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tech_size TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  warehouse TEXT,
  quantity INT NOT NULL DEFAULT 0,
  quantity_full INT NOT NULL DEFAULT 0,
  in_way_to_client INT NOT NULL DEFAULT 0,
  in_way_from_client INT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, tech_size, barcode, warehouse)
);
