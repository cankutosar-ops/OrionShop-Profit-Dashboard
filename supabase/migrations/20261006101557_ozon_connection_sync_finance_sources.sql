-- Ozon source evidence only. No WB/business accounting tables are modified.
BEGIN;
CREATE TABLE public.ozon_sync_leases (
 marketplace_account_id BIGINT PRIMARY KEY REFERENCES public.marketplace_accounts(id),
 token UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.ozon_sync_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ozon_sync_leases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ozon_sync_leases TO service_role;

CREATE TABLE public.ozon_accrual_source_snapshots (
 id UUID PRIMARY KEY,
 marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
 accrual_date DATE NOT NULL CHECK(accrual_date>='2022-01-01'),
 observed_at TIMESTAMPTZ NOT NULL,
 accruals JSONB NOT NULL CHECK(jsonb_typeof(accruals)='array'),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 10000 AND row_count=jsonb_array_length(accruals)),
 pages_fetched INTEGER NOT NULL CHECK(pages_fetched BETWEEN 1 AND 10),
 terminal_reason TEXT NOT NULL CHECK(terminal_reason IN ('EMPTY_PAGE','EMPTY_CURSOR')),
 accounting_complete BOOLEAN NOT NULL DEFAULT false CHECK(NOT accounting_complete),
 UNIQUE(marketplace_account_id,accrual_date,id)
);
CREATE TABLE public.ozon_accrual_source_current (
 marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
 accrual_date DATE NOT NULL, snapshot_id UUID NOT NULL,
 PRIMARY KEY(marketplace_account_id,accrual_date),
 FOREIGN KEY(marketplace_account_id,accrual_date,snapshot_id)
 REFERENCES public.ozon_accrual_source_snapshots(marketplace_account_id,accrual_date,id)
);
ALTER TABLE public.ozon_accrual_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_accrual_source_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ozon_accrual_source_snapshots,public.ozon_accrual_source_current FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ozon_accrual_source_snapshots,public.ozon_accrual_source_current TO authenticated;
GRANT SELECT,INSERT ON public.ozon_accrual_source_snapshots TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.ozon_accrual_source_current TO service_role;
CREATE POLICY ozon_accrual_snapshot_read ON public.ozon_accrual_source_snapshots FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY ozon_accrual_current_read ON public.ozon_accrual_source_current FOR SELECT TO authenticated
 USING(marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));

CREATE FUNCTION public.orion_acquire_ozon_sync(p_account_id BIGINT,p_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_token IS NULL THEN RAISE EXCEPTION 'invalid_ozon_lease_token'; END IF;
 PERFORM 1 FROM public.marketplace_accounts WHERE id=p_account_id AND marketplace='ozon' AND is_active AND sync_enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ozon_sync_account'; END IF;
 INSERT INTO public.ozon_sync_leases VALUES(p_account_id,p_token,clock_timestamp()+interval '5 minutes')
 ON CONFLICT(marketplace_account_id) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at
 WHERE public.ozon_sync_leases.expires_at<=clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION public.orion_release_ozon_sync(p_account_id BIGINT,p_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.ozon_sync_leases SET expires_at=clock_timestamp() WHERE marketplace_account_id=p_account_id AND token=p_token;
 RETURN FOUND;
END; $$;

-- Every publication takes the same account/lease locks as acquisition. An expired/stolen token cannot commit.
CREATE FUNCTION public.orion_publish_ozon_fenced_capture(p_account_id BIGINT,p_token UUID,p_kind TEXT,p_capture JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n INTEGER; prior public.ozon_accrual_source_snapshots%ROWTYPE; latest TIMESTAMPTZ; previous_count INTEGER;
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
 INSERT INTO public.ozon_accrual_source_snapshots VALUES(sid,p_account_id,day,observed,rows,n,pages,terminal,false);
 INSERT INTO public.ozon_accrual_source_current VALUES(p_account_id,day,sid)
 ON CONFLICT(marketplace_account_id,accrual_date) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.orion_acquire_ozon_sync(BIGINT,UUID),public.orion_release_ozon_sync(BIGINT,UUID),
 public.orion_publish_ozon_fenced_capture(BIGINT,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_acquire_ozon_sync(BIGINT,UUID),public.orion_release_ozon_sync(BIGINT,UUID),
 public.orion_publish_ozon_fenced_capture(BIGINT,UUID,TEXT,JSONB) TO service_role;
COMMIT;
