-- Complete source-window evidence only; delivered shipments are not Finance facts.
BEGIN;
CREATE TABLE public.ozon_posting_source_snapshots (
 id UUID PRIMARY KEY,
 marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
 scheme TEXT NOT NULL CHECK (scheme IN ('fbo','fbs')),
 window_from TIMESTAMPTZ NOT NULL,
 window_to TIMESTAMPTZ NOT NULL CHECK (window_to >= window_from),
 observed_at TIMESTAMPTZ NOT NULL,
 postings JSONB NOT NULL CHECK (jsonb_typeof(postings)='array'),
 row_count INTEGER NOT NULL CHECK (row_count BETWEEN 0 AND 5000 AND row_count=jsonb_array_length(postings)),
 UNIQUE(marketplace_account_id,scheme,window_from,window_to,id)
);
CREATE TABLE public.ozon_posting_source_current (
 marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
 scheme TEXT NOT NULL, window_from TIMESTAMPTZ NOT NULL, window_to TIMESTAMPTZ NOT NULL,
 snapshot_id UUID NOT NULL,
 PRIMARY KEY(marketplace_account_id,scheme,window_from,window_to),
 FOREIGN KEY(marketplace_account_id,scheme,window_from,window_to,snapshot_id)
 REFERENCES public.ozon_posting_source_snapshots(marketplace_account_id,scheme,window_from,window_to,id)
);
ALTER TABLE public.ozon_posting_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_posting_source_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ozon_posting_source_snapshots,public.ozon_posting_source_current FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ozon_posting_source_snapshots,public.ozon_posting_source_current TO authenticated;
GRANT SELECT,INSERT ON public.ozon_posting_source_snapshots TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.ozon_posting_source_current TO service_role;
CREATE POLICY ozon_posting_snapshot_read ON public.ozon_posting_source_snapshots FOR SELECT TO authenticated
 USING (marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE POLICY ozon_posting_current_read ON public.ozon_posting_source_current FOR SELECT TO authenticated
 USING (marketplace_account_id=ANY(private.orion_allowed_marketplace_account_ids()));
CREATE FUNCTION public.orion_publish_ozon_posting_capture(p_account_id BIGINT,p_scheme TEXT,p_snapshot_id UUID,
 p_from TIMESTAMPTZ,p_to TIMESTAMPTZ,p_observed_at TIMESTAMPTZ,p_postings JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.ozon_posting_source_snapshots%ROWTYPE; latest TIMESTAMPTZ; n INTEGER;
BEGIN
 IF p_account_id IS NULL OR p_scheme IS NULL OR p_scheme NOT IN ('fbo','fbs') OR p_snapshot_id IS NULL
 OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>interval '366 days' OR p_observed_at IS NULL
 OR p_postings IS NULL OR jsonb_typeof(p_postings)<>'array' THEN RAISE EXCEPTION 'invalid_ozon_posting_capture'; END IF;
 n:=jsonb_array_length(p_postings);
 IF n>5000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_postings) AS x WHERE jsonb_typeof(x)<>'object'
 OR jsonb_typeof(x->'posting_number') IS DISTINCT FROM 'string' OR length(btrim(x->>'posting_number'))=0
 OR x ?| ARRAY['customer','addressee','address','legal_info','financial_data'])
 OR (SELECT count(DISTINCT x->>'posting_number') FROM jsonb_array_elements(p_postings) AS x)<>n
 THEN RAISE EXCEPTION 'invalid_ozon_posting_identity_or_privacy'; END IF;
 PERFORM 1 FROM public.marketplace_accounts WHERE id=p_account_id AND marketplace='ozon' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ozon_account'; END IF;
 SELECT * INTO prior FROM public.ozon_posting_source_snapshots WHERE id=p_snapshot_id;
 IF FOUND THEN
  IF prior.marketplace_account_id<>p_account_id OR prior.scheme<>p_scheme OR prior.window_from<>p_from
  OR prior.window_to<>p_to OR prior.observed_at<>p_observed_at OR prior.postings<>p_postings
  THEN RAISE EXCEPTION 'ozon_posting_capture_identity_conflict'; END IF;
  RETURN prior.row_count;
 END IF;
 SELECT s.observed_at INTO latest FROM public.ozon_posting_source_current c JOIN public.ozon_posting_source_snapshots s ON s.id=c.snapshot_id
 WHERE c.marketplace_account_id=p_account_id AND c.scheme=p_scheme AND c.window_from=p_from AND c.window_to=p_to;
 IF latest IS NOT NULL AND p_observed_at<=latest THEN RAISE EXCEPTION 'stale_ozon_posting_capture'; END IF;
 INSERT INTO public.ozon_posting_source_snapshots VALUES(p_snapshot_id,p_account_id,p_scheme,p_from,p_to,p_observed_at,p_postings,n);
 INSERT INTO public.ozon_posting_source_current VALUES(p_account_id,p_scheme,p_from,p_to,p_snapshot_id)
 ON CONFLICT(marketplace_account_id,scheme,window_from,window_to) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.orion_publish_ozon_posting_capture(BIGINT,TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orion_publish_ozon_posting_capture(BIGINT,TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,JSONB) TO service_role;
COMMIT;
