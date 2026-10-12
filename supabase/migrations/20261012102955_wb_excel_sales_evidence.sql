-- Additive, source-explicit historic sales evidence. No native wb_sales or Finance rewrites.
BEGIN;
CREATE TABLE public.wb_excel_sales_imports (
 marketplace_account_id bigint NOT NULL,
 report_id bigint NOT NULL,
 payload_hash text NOT NULL,
 event_count integer NOT NULL CHECK(event_count>0),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(marketplace_account_id,report_id),
 FOREIGN KEY(marketplace_account_id,report_id) REFERENCES public.wb_finance_excel_imports(marketplace_account_id,report_id)
);
CREATE TABLE public.wb_excel_sales_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 marketplace_account_id bigint NOT NULL,
 report_id bigint NOT NULL,
 source_row_number integer NOT NULL CHECK(source_row_number>0),
 file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),
 product_id bigint NOT NULL REFERENCES public.products(id),
 nm_id bigint NOT NULL CHECK(nm_id>0),
 srid text NOT NULL CHECK(length(btrim(srid))>0),
 event_type text NOT NULL CHECK(event_type IN('SALE','RETURN')),
 sale_date date NOT NULL CHECK(sale_date>='2025-09-05' AND sale_date<'2026-07-14'),
 quantity integer NOT NULL CHECK(quantity=1),
 price_with_disc numeric NOT NULL CHECK(price_with_disc>0 AND price_with_disc<>'NaN'::numeric AND price_with_disc<90071992547409.91),
 customer_paid numeric NOT NULL CHECK(customer_paid>=0 AND customer_paid<>'NaN'::numeric AND customer_paid<90071992547409.91),
 finance_payable_raw numeric NOT NULL CHECK(finance_payable_raw<>'NaN'::numeric AND abs(finance_payable_raw)<90071992547409.91),
 barcode text, tech_size text, warehouse text,
 UNIQUE(marketplace_account_id,report_id,source_row_number),
 UNIQUE(marketplace_account_id,srid,event_type),
 FOREIGN KEY(marketplace_account_id,report_id) REFERENCES public.wb_excel_sales_imports(marketplace_account_id,report_id)
);
CREATE INDEX wb_excel_sales_events_range ON public.wb_excel_sales_events(marketplace_account_id,sale_date,product_id);
ALTER TABLE public.wb_excel_sales_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_excel_sales_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_excel_sales_events,public.wb_excel_sales_imports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.wb_excel_sales_events TO authenticated,service_role;
GRANT SELECT ON public.wb_excel_sales_imports TO service_role;
CREATE POLICY excel_sales_account_read ON public.wb_excel_sales_events FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY excel_sales_service_read ON public.wb_excel_sales_events FOR SELECT TO service_role USING(true);
CREATE POLICY excel_sales_imports_service_read ON public.wb_excel_sales_imports FOR SELECT TO service_role USING(true);
CREATE TABLE public.wb_excel_sales_campaigns (
 marketplace_account_id bigint PRIMARY KEY REFERENCES public.marketplace_accounts(id),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 event_count integer NOT NULL CHECK(event_count=4533),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.wb_excel_sales_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_excel_sales_campaigns FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.wb_excel_sales_campaigns TO authenticated,service_role;
CREATE POLICY excel_campaign_account_read ON public.wb_excel_sales_campaigns FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY excel_campaign_service_read ON public.wb_excel_sales_campaigns FOR SELECT TO service_role USING(true);
CREATE FUNCTION public.orion_import_wb_excel_sales(p_account_id bigint,p_owner text,p_report_id bigint,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_hash text; v_existing text; v_count integer; v_manifest public.wb_finance_excel_imports;
BEGIN
 IF p_account_id IS DISTINCT FROM 6 OR NOT EXISTS(SELECT 1 FROM public.marketplace_accounts WHERE id=p_account_id AND company_id=3 AND marketplace='wildberries') THEN RAISE EXCEPTION 'EXCEL_SALES_ACCOUNT_SCOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orion_finance_source:'||p_account_id::text,0));
 PERFORM 1 FROM public.finance_incremental_sync_state WHERE marketplace_account_id=p_account_id AND lock_owner=p_owner AND lock_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_LEASE_LOST'; END IF;
 SELECT * INTO v_manifest FROM public.wb_finance_excel_imports WHERE marketplace_account_id=p_account_id AND report_id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXCEL_SALES_FINANCE_MANIFEST_REQUIRED'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 THEN RAISE EXCEPTION 'EXCEL_SALES_EMPTY_REPORT'; END IF;
 v_hash=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 SELECT payload_hash INTO v_existing FROM public.wb_excel_sales_imports WHERE marketplace_account_id=p_account_id AND report_id=p_report_id;
 IF FOUND THEN
  IF v_hash<>v_existing THEN RAISE EXCEPTION 'EXCEL_SALES_CONTENT_CONFLICT'; END IF;
  RETURN 0;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE (r->>'marketplace_account_id')::bigint IS DISTINCT FROM p_account_id OR (r->>'report_id')::bigint IS DISTINCT FROM p_report_id OR r->>'file_sha256' IS DISTINCT FROM v_manifest.file_sha256 OR (r->>'source_row_number')::integer NOT BETWEEN 1 AND v_manifest.source_row_count OR NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=(r->>'product_id')::bigint AND p.marketplace_account_id=p_account_id AND p.nm_id=(r->>'nm_id')::bigint)) THEN RAISE EXCEPTION 'EXCEL_SALES_LINE_SCOPE'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r JOIN public.wb_sales s ON s.marketplace_account_id=p_account_id AND s.srid=r->>'srid' AND s.event_type=r->>'event_type') THEN RAISE EXCEPTION 'EXCEL_SALES_NATIVE_OVERLAP'; END IF;
 IF EXISTS(SELECT 1 FROM public.wb_excel_sales_campaigns WHERE marketplace_account_id=p_account_id) THEN RAISE EXCEPTION 'EXCEL_SALES_CAMPAIGN_SEALED'; END IF;
 v_count=jsonb_array_length(p_rows);
 INSERT INTO public.wb_excel_sales_imports VALUES(p_account_id,p_report_id,v_hash,v_count,clock_timestamp());
 INSERT INTO public.wb_excel_sales_events(marketplace_account_id,report_id,source_row_number,file_sha256,product_id,nm_id,srid,event_type,sale_date,quantity,price_with_disc,customer_paid,finance_payable_raw,barcode,tech_size,warehouse)
 SELECT marketplace_account_id,report_id,source_row_number,file_sha256,product_id,nm_id,srid,event_type,sale_date,quantity,price_with_disc,customer_paid,finance_payable_raw,barcode,tech_size,warehouse FROM jsonb_to_recordset(p_rows) AS r(marketplace_account_id bigint,report_id bigint,source_row_number integer,file_sha256 text,product_id bigint,nm_id bigint,srid text,event_type text,sale_date date,quantity integer,price_with_disc numeric,customer_paid numeric,finance_payable_raw numeric,barcode text,tech_size text,warehouse text);
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.orion_import_wb_excel_sales(bigint,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_import_wb_excel_sales(bigint,text,bigint,jsonb) TO service_role;
CREATE FUNCTION public.orion_complete_wb_excel_sales(p_account_id bigint,p_owner text,p_manifest jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actual jsonb; v_hash text; v_existing text; v_count integer;
BEGIN
 IF p_account_id IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'EXCEL_SALES_ACCOUNT_SCOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orion_finance_source:'||p_account_id::text,0));
 PERFORM 1 FROM public.finance_incremental_sync_state WHERE marketplace_account_id=p_account_id AND lock_owner=p_owner AND lock_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_LEASE_LOST'; END IF;
 SELECT jsonb_agg(jsonb_build_object('report_id',report_id,'payload_hash',payload_hash,'event_count',event_count) ORDER BY report_id),sum(event_count) INTO v_actual,v_count FROM public.wb_excel_sales_imports WHERE marketplace_account_id=p_account_id;
 IF p_manifest IS DISTINCT FROM v_actual OR v_count IS DISTINCT FROM 4533 OR (SELECT count(*) FROM public.wb_excel_sales_events WHERE marketplace_account_id=p_account_id)<>4533 THEN RAISE EXCEPTION 'EXCEL_SALES_CAMPAIGN_INCOMPLETE'; END IF;
 v_hash=encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex');
 SELECT manifest_hash INTO v_existing FROM public.wb_excel_sales_campaigns WHERE marketplace_account_id=p_account_id;
 IF FOUND THEN
  IF v_existing<>v_hash THEN RAISE EXCEPTION 'EXCEL_SALES_CONTENT_CONFLICT'; END IF;
  RETURN 0;
 END IF;
 INSERT INTO public.wb_excel_sales_campaigns(marketplace_account_id,manifest_hash,event_count) VALUES(p_account_id,v_hash,v_count);
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.orion_complete_wb_excel_sales(bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_complete_wb_excel_sales(bigint,text,jsonb) TO service_role;
CREATE VIEW public.wb_sales_reporting WITH(security_invoker=true) AS
 SELECT id::text,id::text AS native_row_id,marketplace_account_id,sale_id,event_type,srid,nm_id,product_id,sale_date,revenue,price_with_disc,for_pay,quantity,is_return,return_date,warehouse,tech_size,barcode,'WB_API'::text AS data_source FROM public.wb_sales
 UNION ALL
 SELECT 'xlsx-sale:'||e.report_id||':'||e.source_row_number,NULL::text,e.marketplace_account_id,NULL::text,e.event_type,e.srid,e.nm_id,e.product_id,e.sale_date::timestamp AT TIME ZONE 'UTC',e.customer_paid,e.price_with_disc,NULL::numeric,e.quantity,e.event_type='RETURN',CASE WHEN e.event_type='RETURN' THEN e.sale_date::timestamp AT TIME ZONE 'UTC' ELSE NULL END,e.warehouse,e.tech_size,e.barcode,'WB_EXCEL'::text
 FROM public.wb_excel_sales_events e WHERE EXISTS(SELECT 1 FROM public.wb_excel_sales_campaigns c WHERE c.marketplace_account_id=e.marketplace_account_id) AND NOT EXISTS(SELECT 1 FROM public.wb_sales s WHERE s.marketplace_account_id=e.marketplace_account_id AND s.srid=e.srid AND s.event_type=e.event_type);
REVOKE ALL ON public.wb_sales_reporting FROM PUBLIC,anon;
GRANT SELECT ON public.wb_sales_reporting TO authenticated,service_role;
COMMENT ON TABLE public.wb_excel_sales_events IS 'Append-only financial-report SALE/RETURN source events. No invented native saleID, order or Sales API forPay. Calendar sale_date from the source is represented at UTC midnight for date filtering.';
COMMIT;
