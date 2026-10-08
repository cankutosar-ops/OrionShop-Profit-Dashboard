-- Seller warehouse identity is separate from the linked WB delivery office.
-- Additive metadata only; no changes to stock, orders, sales, or finance history.
BEGIN;
CREATE TABLE public.wb_seller_warehouses (
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
  seller_warehouse_id BIGINT NOT NULL CHECK (seller_warehouse_id > 0),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  wb_office_id BIGINT NOT NULL CHECK (wb_office_id > 0),
  delivery_type INTEGER NOT NULL CHECK (delivery_type > 0),
  is_deleting BOOLEAN,
  is_processing BOOLEAN,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (marketplace_account_id, seller_warehouse_id)
);
ALTER TABLE public.wb_seller_warehouses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_seller_warehouses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.wb_seller_warehouses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wb_seller_warehouses TO service_role;
CREATE POLICY wb_seller_warehouses_account_read ON public.wb_seller_warehouses
  FOR SELECT TO authenticated
  USING (marketplace_account_id = ANY (private.orion_allowed_marketplace_account_ids()));
CREATE POLICY wb_seller_warehouses_service ON public.wb_seller_warehouses
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.wb_seller_warehouses IS
  'Account-scoped seller warehouse catalog from GET /api/v3/warehouses. Never infer historical sale/order attribution from this catalog.';
COMMIT;
