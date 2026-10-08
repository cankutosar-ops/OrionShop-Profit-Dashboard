BEGIN;
CREATE TABLE public.ozon_financial_reference_snapshots (
 id UUID PRIMARY KEY, marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
 kind TEXT NOT NULL CHECK(kind IN ('finance-types','realization-monthly')),
 period_key TEXT NOT NULL, observed_at TIMESTAMPTZ NOT NULL,
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 10000),
 UNIQUE(marketplace_account_id,kind,period_key,id), UNIQUE(marketplace_account_id,id)
);
CREATE TABLE public.ozon_financial_reference_current (
 marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id), kind TEXT NOT NULL, period_key TEXT NOT NULL, snapshot_id UUID NOT NULL,
 PRIMARY KEY(marketplace_account_id,kind,period_key),
 FOREIGN KEY(marketplace_account_id,kind,period_key,snapshot_id) REFERENCES public.ozon_financial_reference_snapshots(marketplace_account_id,kind,period_key,id)
);
ALTER TABLE public.ozon_financial_reference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_financial_reference_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ozon_financial_reference_snapshots,public.ozon_financial_reference_current FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ozon_financial_reference_snapshots,public.ozon_financial_reference_current TO authenticated;
GRANT SELECT,INSERT ON public.ozon_financial_reference_snapshots TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.ozon_financial_reference_current TO service_role;
CREATE POLICY ozon_reference_snapshot_read ON public.ozon_financial_reference_snapshots FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY ozon_reference_current_read ON public.ozon_financial_reference_current FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE FUNCTION public.orion_publish_ozon_financial_reference(p_account_id BIGINT,p_token UUID,p_kind TEXT,p_period_key TEXT,
 p_snapshot_id UUID,p_observed_at TIMESTAMPTZ,p_payload JSONB) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.ozon_financial_reference_snapshots%ROWTYPE; latest TIMESTAMPTZ; rows JSONB; n INTEGER;
BEGIN
 PERFORM 1 FROM public.marketplace_accounts WHERE id=p_account_id AND marketplace='ozon' AND is_active AND sync_enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ozon_sync_account'; END IF;
 PERFORM 1 FROM public.ozon_sync_leases WHERE marketplace_account_id=p_account_id AND token=p_token AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ozon_lease_fence_rejected'; END IF;
 IF p_snapshot_id IS NULL OR p_observed_at IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 THEN RAISE EXCEPTION 'invalid_ozon_reference'; END IF;
 IF p_kind='finance-types' AND p_period_key='*' THEN
  rows:=p_payload->'types';
  IF jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_ozon_types'; END IF;
  n:=jsonb_array_length(rows);
  IF n<1 OR n>2000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE jsonb_typeof(x)<>'object'
   OR (x->>'id') !~ '^[1-9][0-9]*$' OR x->>'id' IS NULL OR jsonb_typeof(x->'name') IS DISTINCT FROM 'string'
   OR btrim(x->>'name')='' OR jsonb_typeof(x->'description') IS DISTINCT FROM 'string')
   OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(rows) x)<>n THEN RAISE EXCEPTION 'invalid_ozon_types'; END IF;
 ELSIF p_kind='realization-monthly' AND p_period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND p_period_key>='2023-08' THEN
  rows:=p_payload->'rows';
  IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'header') IS DISTINCT FROM 'object'
   OR p_payload->'header'->>'from' IS DISTINCT FROM p_period_key||'-01'
   OR p_payload->'header'->>'to' IS DISTINCT FROM ((p_period_key||'-01')::date+interval '1 month'-interval '1 day')::date::text
   OR p_payload->'header' ?| ARRAY['payer_inn','payer_kpp','receiver_inn','receiver_name','contract_number','contract_date']
  THEN RAISE EXCEPTION 'invalid_ozon_realization'; END IF;
  n:=jsonb_array_length(rows);
  IF n>10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE jsonb_typeof(x)<>'object'
    OR x->>'rowNumber' IS NULL OR x->>'rowNumber' !~ '^[0-9]+$'
    OR x->'item'->>'sku' IS NULL OR x->'item'->>'sku' !~ '^[1-9][0-9]*$')
   OR (SELECT count(DISTINCT x->>'rowNumber') FROM jsonb_array_elements(rows) x)<>n
  THEN RAISE EXCEPTION 'invalid_ozon_realization_rows'; END IF;
 ELSE RAISE EXCEPTION 'invalid_ozon_reference_scope'; END IF;
 SELECT * INTO prior FROM public.ozon_financial_reference_snapshots WHERE id=p_snapshot_id;
 IF FOUND THEN
  IF prior.marketplace_account_id<>p_account_id OR prior.kind<>p_kind OR prior.period_key<>p_period_key
   OR prior.observed_at<>p_observed_at OR prior.payload<>p_payload THEN RAISE EXCEPTION 'ozon_reference_identity_conflict'; END IF;
  RETURN prior.row_count;
 END IF;
 SELECT s.observed_at INTO latest FROM public.ozon_financial_reference_current c JOIN public.ozon_financial_reference_snapshots s ON s.id=c.snapshot_id
 WHERE c.marketplace_account_id=p_account_id AND c.kind=p_kind AND c.period_key=p_period_key;
 IF latest IS NOT NULL AND p_observed_at<=latest THEN RAISE EXCEPTION 'stale_ozon_reference'; END IF;
 INSERT INTO public.ozon_financial_reference_snapshots VALUES(p_snapshot_id,p_account_id,p_kind,p_period_key,p_observed_at,p_payload,n);
 INSERT INTO public.ozon_financial_reference_current VALUES(p_account_id,p_kind,p_period_key,p_snapshot_id)
 ON CONFLICT(marketplace_account_id,kind,period_key) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.orion_publish_ozon_financial_reference(BIGINT,UUID,TEXT,TEXT,UUID,TIMESTAMPTZ,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_publish_ozon_financial_reference(BIGINT,UUID,TEXT,TEXT,UUID,TIMESTAMPTZ,JSONB) TO service_role;

-- Historical daily source evidence retains the exact dictionary revision used at publication.
ALTER TABLE public.ozon_accrual_source_snapshots ADD COLUMN type_dictionary_snapshot_id UUID;
ALTER TABLE public.ozon_accrual_source_snapshots ADD CONSTRAINT ozon_accrual_dictionary_scope_fk
 FOREIGN KEY(marketplace_account_id,type_dictionary_snapshot_id) REFERENCES public.ozon_financial_reference_snapshots(marketplace_account_id,id);

CREATE OR REPLACE FUNCTION public.orion_publish_ozon_fenced_capture(p_account_id BIGINT,p_token UUID,p_kind TEXT,p_capture JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n INTEGER; prior public.ozon_accrual_source_snapshots%ROWTYPE; latest TIMESTAMPTZ; previous_count INTEGER; dictionary_id UUID;
 day DATE; observed TIMESTAMPTZ; sid UUID; rows JSONB; pages INTEGER; terminal TEXT;
BEGIN
 PERFORM 1 FROM public.marketplace_accounts WHERE id=p_account_id AND marketplace='ozon' AND is_active AND sync_enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ozon_sync_account'; END IF;
 PERFORM 1 FROM public.ozon_sync_leases WHERE marketplace_account_id=p_account_id AND token=p_token AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ozon_lease_fence_rejected'; END IF;
 IF p_kind IN ('products','prices','stocks') THEN
  RETURN public.orion_publish_ozon_source_capture(p_account_id,p_kind,(p_capture->>'snapshotId')::uuid,
   (p_capture->>'observedAt')::timestamptz,p_capture->'items');
 ELSIF p_kind IN ('fbo','fbs') THEN
  IF p_capture->'complete' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'partial_ozon_posting_capture'; END IF;
  RETURN public.orion_publish_ozon_posting_capture(p_account_id,p_kind,(p_capture->>'snapshotId')::uuid,
   (p_capture->>'from')::timestamptz,(p_capture->>'to')::timestamptz,(p_capture->>'observedAt')::timestamptz,p_capture->'postings');
 ELSIF p_kind IS DISTINCT FROM 'finance' THEN RAISE EXCEPTION 'invalid_ozon_capture_kind'; END IF;
 day:=(p_capture->>'date')::date; observed:=(p_capture->>'observedAt')::timestamptz;
 sid:=(p_capture->>'snapshotId')::uuid; rows:=p_capture->'accruals';
 pages:=(p_capture->>'pagesFetched')::integer; terminal:=p_capture->>'terminalReason';
 IF day IS NULL OR day<'2022-01-01' OR observed IS NULL OR sid IS NULL OR rows IS NULL OR jsonb_typeof(rows)<>'array'
 OR pages IS NULL OR pages NOT BETWEEN 1 AND 10 OR terminal IS NULL OR terminal NOT IN ('EMPTY_PAGE','EMPTY_CURSOR')
 OR p_capture->'accountingComplete' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'invalid_ozon_accrual_capture'; END IF;
 n:=jsonb_array_length(rows);
 IF n>10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE jsonb_typeof(x)<>'object')
 THEN RAISE EXCEPTION 'invalid_ozon_accrual_rows'; END IF;
 SELECT * INTO prior FROM public.ozon_accrual_source_snapshots WHERE id=sid;
 IF FOUND THEN
  IF prior.marketplace_account_id<>p_account_id OR prior.accrual_date<>day OR prior.observed_at<>observed
  OR prior.accruals<>rows OR prior.pages_fetched<>pages OR prior.terminal_reason<>terminal
  THEN RAISE EXCEPTION 'ozon_accrual_identity_conflict'; END IF;
  RETURN prior.row_count;
 END IF;
 SELECT s.observed_at,s.row_count INTO latest,previous_count FROM public.ozon_accrual_source_current c JOIN public.ozon_accrual_source_snapshots s ON s.id=c.snapshot_id
 WHERE c.marketplace_account_id=p_account_id AND c.accrual_date=day;
 IF latest IS NOT NULL AND observed<=latest THEN RAISE EXCEPTION 'stale_ozon_accrual_capture'; END IF;
 IF n=0 AND previous_count>0 THEN RAISE EXCEPTION 'ozon_nonempty_accrual_replacement_requires_review'; END IF;
 SELECT s.id INTO dictionary_id FROM public.ozon_financial_reference_current c
 JOIN public.ozon_financial_reference_snapshots s ON s.id=c.snapshot_id
 WHERE c.marketplace_account_id=p_account_id AND c.kind='finance-types' AND c.period_key='*' AND s.observed_at<=observed;
 INSERT INTO public.ozon_accrual_source_snapshots(id,marketplace_account_id,accrual_date,observed_at,accruals,row_count,pages_fetched,terminal_reason,accounting_complete,type_dictionary_snapshot_id)
 VALUES(sid,p_account_id,day,observed,rows,n,pages,terminal,false,dictionary_id);
 INSERT INTO public.ozon_accrual_source_current VALUES(p_account_id,day,sid)
 ON CONFLICT(marketplace_account_id,accrual_date) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id;
 RETURN n;
END; $$;

COMMIT;
