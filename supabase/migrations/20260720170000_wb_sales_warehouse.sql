-- Sprint 6.45 / 6.45.1: persist fulfilling warehouse on completed sales (WB Sales API warehouseName).
-- Schema gate for Warehouse Sales Analytics — apply before mapper writes warehouse on upsert.

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS warehouse TEXT;

COMMENT ON COLUMN public.wb_sales.warehouse IS
  'Wildberries Sales API warehouseName — warehouse that fulfilled the customer sale.';

CREATE INDEX IF NOT EXISTS idx_wb_sales_warehouse
  ON public.wb_sales (warehouse)
  WHERE warehouse IS NOT NULL;
