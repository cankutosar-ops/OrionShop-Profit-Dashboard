-- Additive Excel-source publication guard. No historical SQL/data replay.
BEGIN;
CREATE TABLE public.wb_finance_excel_imports (
 marketplace_account_id bigint NOT NULL REFERENCES public.marketplace_accounts(id),
 report_id bigint NOT NULL,
 file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
 source_row_count integer NOT NULL CHECK (source_row_count > 0),
 finance_line_count integer NOT NULL CHECK (finance_line_count >= 0),
 event_date_from date NOT NULL,
 event_date_to date NOT NULL CHECK (event_date_to >= event_date_from),
 date_basis text NOT NULL DEFAULT 'SOURCE_SALE_DATE' CHECK (date_basis='SOURCE_SALE_DATE'),
 payload_hash text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (marketplace_account_id,report_id)
);
ALTER TABLE public.wb_finance_excel_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_finance_excel_imports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT ON public.wb_finance_excel_imports TO service_role;

CREATE FUNCTION public.orion_guard_wb_finance_excel_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.source_key LIKE 'xlsx:%' THEN RAISE EXCEPTION 'EXCEL_REPORT_IS_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orion_finance_source:'||NEW.marketplace_account_id::text,0));
 IF TG_OP='UPDATE' AND OLD.source_key LIKE 'xlsx:%' THEN RAISE EXCEPTION 'EXCEL_REPORT_IS_IMMUTABLE'; END IF;
 IF NEW.source_key LIKE 'xlsx:%' THEN
  IF NOT EXISTS (SELECT 1 FROM public.wb_finance_excel_imports i WHERE
    i.marketplace_account_id=NEW.marketplace_account_id AND i.report_id=NEW.realizationreport_id) THEN
   RAISE EXCEPTION 'EXCEL_IMPORT_MANIFEST_REQUIRED';
  END IF;
 ELSIF EXISTS (SELECT 1 FROM public.wb_finance_excel_imports i WHERE
    i.marketplace_account_id=NEW.marketplace_account_id AND
    (i.report_id=NEW.realizationreport_id OR NEW.operation_date BETWEEN i.event_date_from AND i.event_date_to)) THEN
  -- Conservative safe hold: API/legacy facts cannot silently duplicate an
  -- Excel-authoritative interval. Reconciliation/replacement needs review.
  RAISE EXCEPTION 'FINANCE_EXCEL_SOURCE_OVERLAP';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.orion_guard_wb_finance_excel_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_guard_wb_finance_excel_source() TO service_role;
CREATE TRIGGER orion_wb_finance_excel_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.wb_finance
FOR EACH ROW EXECUTE FUNCTION public.orion_guard_wb_finance_excel_source();

CREATE FUNCTION public.orion_import_wb_finance_excel_report(
 p_account_id bigint,p_owner text,p_report jsonb,p_lines jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
#variable_conflict use_variable
DECLARE s public.finance_incremental_sync_state%ROWTYPE;
 existing public.wb_finance_excel_imports%ROWTYPE;
 report_id bigint; row_count integer; from_date date; to_date date; line_count integer; inserted integer;
BEGIN
 SELECT * INTO s FROM public.finance_incremental_sync_state WHERE marketplace_account_id=p_account_id FOR UPDATE;
 IF s.lock_owner IS DISTINCT FROM p_owner OR p_owner IS NULL OR s.lock_expires_at IS NULL OR s.lock_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'FINANCE_LEASE_LOST';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orion_finance_source:'||p_account_id::text,0));
 IF NOT EXISTS (SELECT 1 FROM public.marketplace_accounts a WHERE a.id=p_account_id AND a.marketplace='wildberries') THEN
  RAISE EXCEPTION 'INVALID_WB_ACCOUNT';
 END IF;
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_EXCEL_PAYLOAD'; END IF;
 report_id=(p_report->>'reportId')::bigint; row_count=(p_report->>'sourceRowCount')::integer;
 from_date=(p_report->>'eventDateFrom')::date;to_date=(p_report->>'eventDateTo')::date;line_count=jsonb_array_length(p_lines);
 IF report_id IS NULL OR report_id<=0 OR row_count IS NULL OR row_count<=0 OR from_date IS NULL OR to_date IS NULL OR
   to_date<from_date OR from_date<'2000-01-01' OR line_count>50000 OR
   (p_report->>'fileSha256') IS NULL OR (p_report->>'fileSha256') !~ '^[a-f0-9]{64}$' OR
   p_report->>'dateBasis' IS DISTINCT FROM 'SOURCE_SALE_DATE' THEN RAISE EXCEPTION 'INVALID_EXCEL_MANIFEST'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.wb_finance,p_lines) f WHERE
   f.marketplace_account_id IS DISTINCT FROM p_account_id OR f.realizationreport_id IS DISTINCT FROM report_id OR
   f.source_key IS NULL OR f.source_key !~ ('^xlsx:'||report_id||':[1-9][0-9]*:[a-z_]+$') OR
   f.wb_source_suffix IS NULL OR split_part(f.source_key,':',4) IS DISTINCT FROM f.wb_source_suffix OR
   split_part(f.source_key,':',3)::bigint>row_count OR
   f.rrd_id IS NOT NULL OR f.rr_dt IS NOT NULL OR f.operation_date IS NULL OR
   f.operation_date NOT BETWEEN from_date AND to_date OR f.amount IS NULL OR f.raw_amount IS NULL OR
   (f.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=f.product_id AND p.marketplace_account_id=p_account_id AND p.nm_id=f.nm_id))) THEN
  RAISE EXCEPTION 'INVALID_EXCEL_LINE_SCOPE';
 END IF;
 IF (SELECT count(DISTINCT x->>'source_key') FROM jsonb_array_elements(p_lines) x)<>line_count THEN RAISE EXCEPTION 'DUPLICATE_EXCEL_SOURCE_KEY'; END IF;
 SELECT * INTO existing FROM public.wb_finance_excel_imports i WHERE i.marketplace_account_id=p_account_id AND i.report_id=report_id;
 IF FOUND THEN
  IF existing.file_sha256 IS DISTINCT FROM p_report->>'fileSha256' OR existing.payload_hash<>md5(p_lines::text) OR
     existing.source_row_count<>row_count OR existing.event_date_from<>from_date OR existing.event_date_to<>to_date OR
     existing.finance_line_count<>line_count THEN RAISE EXCEPTION 'EXCEL_REPORT_CONTENT_CONFLICT'; END IF;
  IF (SELECT count(*) FROM public.wb_finance f WHERE f.marketplace_account_id=p_account_id AND f.realizationreport_id=report_id AND f.source_key LIKE 'xlsx:%')<>line_count THEN
   RAISE EXCEPTION 'EXCEL_PERSISTED_LINE_COUNT_MISMATCH';
  END IF;
  RETURN 0;
 END IF;
 IF EXISTS (SELECT 1 FROM public.wb_finance f WHERE f.marketplace_account_id=p_account_id AND
   (f.realizationreport_id=report_id OR f.operation_date BETWEEN from_date AND to_date) AND f.source_key NOT LIKE 'xlsx:%') THEN
  RAISE EXCEPTION 'EXCEL_EXISTING_API_SOURCE_OVERLAP';
 END IF;
 INSERT INTO public.wb_finance_excel_imports VALUES(p_account_id,report_id,p_report->>'fileSha256',row_count,line_count,from_date,to_date,'SOURCE_SALE_DATE',md5(p_lines::text),clock_timestamp());
 INSERT INTO public.wb_finance(marketplace_account_id,product_id,nm_id,operation_date,operation_type,amount,raw_amount,source_key,description,srid,finance_category,wb_source_suffix,supplier_oper_name,finance_nature,realizationreport_id,rrd_id,rr_dt)
 SELECT marketplace_account_id,product_id,nm_id,operation_date,operation_type,amount,raw_amount,source_key,description,srid,finance_category,wb_source_suffix,supplier_oper_name,finance_nature,realizationreport_id,rrd_id,rr_dt
 FROM jsonb_populate_recordset(NULL::public.wb_finance,p_lines);
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted<>line_count THEN RAISE EXCEPTION 'EXCEL_ATOMIC_LINE_COUNT_MISMATCH'; END IF;
 RETURN inserted;
END; $$;
REVOKE ALL ON FUNCTION public.orion_import_wb_finance_excel_report(bigint,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_import_wb_finance_excel_report(bigint,text,jsonb,jsonb) TO service_role;
COMMIT;


