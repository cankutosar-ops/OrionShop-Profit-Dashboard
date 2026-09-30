-- Cover dashboard drill-down filters and the product relation joins reported
-- by the Supabase performance advisor.

create index if not exists idx_wb_finance_product_id
  on public.wb_finance (product_id);

create index if not exists idx_wb_orders_product_id
  on public.wb_orders (product_id);

create index if not exists idx_wb_ads_product_id
  on public.wb_ads (product_id);

create index if not exists idx_products_brand_id
  on public.products (brand_id);

create index if not exists idx_products_category_id
  on public.products (category_id);
