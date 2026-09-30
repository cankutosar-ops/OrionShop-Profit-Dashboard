-- Dashboard fact reads always combine tenant scope with a date range and then
-- paginate in date/id order. Single-column indexes forced Postgres to scan both
-- accounts' rows and perform an incremental sort for every page.

create index if not exists idx_wb_finance_account_operation_date_id
  on public.wb_finance (marketplace_account_id, operation_date, id);

create index if not exists idx_wb_sales_account_sale_date_id
  on public.wb_sales (marketplace_account_id, sale_date, id);

create index if not exists idx_wb_orders_account_order_date_id
  on public.wb_orders (marketplace_account_id, order_date, id);

create index if not exists idx_wb_ads_account_campaign_date_id
  on public.wb_ads (marketplace_account_id, campaign_date, id);

create index if not exists idx_products_account_id
  on public.products (marketplace_account_id, id);

create index if not exists idx_product_cost_history_product_effective_id
  on public.product_cost_history (product_id, effective_from desc, id);
