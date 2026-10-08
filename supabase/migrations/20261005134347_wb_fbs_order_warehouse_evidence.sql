BEGIN;
CREATE TABLE public.wb_fbs_order_warehouse_evidence (
  marketplace_account_id BIGINT NOT NULL,
  rid TEXT NOT NULL CHECK (length(btrim(rid)) > 0),
  assembly_order_id BIGINT NOT NULL CHECK (assembly_order_id > 0),
  seller_warehouse_id BIGINT NOT NULL,
  nm_id BIGINT NOT NULL CHECK (nm_id > 0),
  chrt_id BIGINT NOT NULL CHECK (chrt_id > 0),
  created_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (marketplace_account_id, rid),
  UNIQUE (marketplace_account_id, assembly_order_id),
  FOREIGN KEY (marketplace_account_id, seller_warehouse_id)
    REFERENCES public.wb_seller_warehouses(marketplace_account_id, seller_warehouse_id)
);
ALTER TABLE public.wb_fbs_order_warehouse_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_fbs_order_warehouse_evidence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.wb_fbs_order_warehouse_evidence TO authenticated;
GRANT SELECT, INSERT ON public.wb_fbs_order_warehouse_evidence TO service_role;
CREATE POLICY wb_fbs_evidence_account_read ON public.wb_fbs_order_warehouse_evidence
 FOR SELECT TO authenticated USING (marketplace_account_id = ANY (private.orion_allowed_marketplace_account_ids()));
CREATE POLICY wb_fbs_evidence_service_read ON public.wb_fbs_order_warehouse_evidence FOR SELECT TO service_role USING (true);
CREATE POLICY wb_fbs_evidence_service_insert ON public.wb_fbs_order_warehouse_evidence FOR INSERT TO service_role WITH CHECK (true);
COMMENT ON TABLE public.wb_fbs_order_warehouse_evidence IS
 'Append-only FBS assembly order identity evidence. RID matches stored SRID with nm_id verification. No transaction values or history are rewritten.';
COMMIT;
