-- Independent current FBS facts; never mix seller warehouse IDs with WB warehouse IDs.
BEGIN;
CREATE TABLE public.wb_fbs_current_stocks (
 marketplace_account_id bigint NOT NULL REFERENCES public.marketplace_accounts(id),
 seller_warehouse_id bigint NOT NULL,
 chrt_id bigint NOT NULL CHECK(chrt_id>0),
 product_id bigint NOT NULL REFERENCES public.products(id),
 warehouse_name text NOT NULL CHECK(length(btrim(warehouse_name))>0),
 tech_size text, sku text,
 quantity bigint CHECK(quantity>=0), -- NULL = requested but absent from WB response, never assumed zero.
 observed_at timestamptz NOT NULL,
 PRIMARY KEY(marketplace_account_id,seller_warehouse_id,chrt_id),
 FOREIGN KEY(marketplace_account_id,seller_warehouse_id) REFERENCES public.wb_seller_warehouses(marketplace_account_id,seller_warehouse_id)
);
ALTER TABLE public.wb_fbs_current_stocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_fbs_current_stocks FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.wb_fbs_current_stocks TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wb_fbs_current_stocks TO service_role;
CREATE POLICY wb_fbs_stocks_account_read ON public.wb_fbs_current_stocks FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY wb_fbs_stocks_service ON public.wb_fbs_current_stocks FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.replace_wb_fbs_current_stocks(p_account_id bigint,p_rows jsonb) RETURNS integer
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Invalid FBS capture'; END IF;
 IF jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>50000 THEN RAISE EXCEPTION 'Empty or oversized FBS capture is not authoritative'; END IF;
 PERFORM 1 FROM public.marketplace_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown account'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(marketplace_account_id bigint,seller_warehouse_id bigint,chrt_id bigint,product_id bigint,quantity bigint)
 WHERE r.marketplace_account_id IS DISTINCT FROM p_account_id OR r.quantity<0 OR r.chrt_id IS NULL OR r.chrt_id<=0
 OR NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=r.product_id AND p.marketplace_account_id=p_account_id)
 OR NOT EXISTS(SELECT 1 FROM public.product_variants v WHERE v.marketplace_account_id=p_account_id AND v.product_id=r.product_id AND v.chrt_id=r.chrt_id)
 OR NOT EXISTS(SELECT 1 FROM public.wb_seller_warehouses w WHERE w.marketplace_account_id=p_account_id AND w.seller_warehouse_id=r.seller_warehouse_id AND w.delivery_type=1 AND w.is_deleting IS DISTINCT FROM true))
 THEN RAISE EXCEPTION 'Invalid FBS capture scope or identity'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(seller_warehouse_id bigint,chrt_id bigint)
 GROUP BY r.seller_warehouse_id,r.chrt_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate FBS capture identity'; END IF;
 -- A complete snapshot must explicitly represent every requested warehouse/variant,
 -- including NULL quantities for variants omitted by WB. Never erase on partial capture.
 IF EXISTS(
 SELECT 1 FROM public.wb_seller_warehouses w
 CROSS JOIN (SELECT DISTINCT chrt_id FROM public.product_variants WHERE marketplace_account_id=p_account_id AND chrt_id>0) v
 WHERE w.marketplace_account_id=p_account_id AND w.delivery_type=1 AND w.is_deleting IS DISTINCT FROM true
 AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(seller_warehouse_id bigint,chrt_id bigint)
 WHERE r.seller_warehouse_id=w.seller_warehouse_id AND r.chrt_id=v.chrt_id))
 THEN RAISE EXCEPTION 'Incomplete FBS capture'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(observed_at timestamptz)
 WHERE r.observed_at IS NULL OR r.observed_at>now()+interval '5 minutes')
 OR (SELECT count(DISTINCT r.observed_at) FROM jsonb_to_recordset(p_rows) AS r(observed_at timestamptz))<>1
 THEN RAISE EXCEPTION 'Invalid FBS capture timestamp'; END IF;
 IF (SELECT min(r.observed_at) FROM jsonb_to_recordset(p_rows) AS r(observed_at timestamptz))
 < (SELECT max(observed_at) FROM public.wb_fbs_current_stocks WHERE marketplace_account_id=p_account_id)
 THEN RAISE EXCEPTION 'Stale FBS capture'; END IF;
 DELETE FROM public.wb_fbs_current_stocks WHERE marketplace_account_id=p_account_id;
 INSERT INTO public.wb_fbs_current_stocks SELECT * FROM jsonb_populate_recordset(NULL::public.wb_fbs_current_stocks,p_rows);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END;$$;
REVOKE ALL ON FUNCTION public.replace_wb_fbs_current_stocks(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_wb_fbs_current_stocks(bigint,jsonb) TO service_role;
COMMENT ON TABLE public.wb_fbs_current_stocks IS 'Current seller FBS inventory from read-only POST /api/v3/stocks/{warehouseId}; NULL quantity means WB omitted a requested chrtId. Not financial or historical inventory facts.';
COMMIT;
