-- Ozon source captures only. No WB facts, financial interpretation or credential storage.
BEGIN;
CREATE TABLE public.ozon_source_snapshots (
  id uuid PRIMARY KEY,
  marketplace_account_id bigint NOT NULL REFERENCES public.marketplace_accounts(id),
  entity text NOT NULL CHECK (entity IN ('products', 'prices', 'stocks')),
  observed_at timestamptz NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (row_count = jsonb_array_length(items)),
  UNIQUE (marketplace_account_id, entity, id)
);
CREATE INDEX ozon_source_snapshots_account_time
  ON public.ozon_source_snapshots(marketplace_account_id, entity, observed_at DESC);
CREATE TABLE public.ozon_source_current (
  marketplace_account_id bigint NOT NULL REFERENCES public.marketplace_accounts(id),
  entity text NOT NULL,
  snapshot_id uuid NOT NULL,
  PRIMARY KEY (marketplace_account_id, entity),
  FOREIGN KEY (marketplace_account_id, entity, snapshot_id)
    REFERENCES public.ozon_source_snapshots(marketplace_account_id, entity, id)
);
ALTER TABLE public.ozon_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_source_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ozon_source_snapshots, public.ozon_source_current FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ozon_source_snapshots, public.ozon_source_current TO authenticated;
GRANT SELECT, INSERT ON public.ozon_source_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ozon_source_current TO service_role;
CREATE POLICY ozon_snapshots_read ON public.ozon_source_snapshots FOR SELECT TO authenticated
  USING (marketplace_account_id = ANY (private.orion_allowed_marketplace_account_ids()));
CREATE POLICY ozon_current_read ON public.ozon_source_current FOR SELECT TO authenticated
  USING (marketplace_account_id = ANY (private.orion_allowed_marketplace_account_ids()));

CREATE FUNCTION public.orion_publish_ozon_source_capture(
  p_account_id bigint, p_entity text, p_snapshot_id uuid,
  p_observed_at timestamptz, p_items jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  prior public.ozon_source_snapshots%ROWTYPE;
  current_observed timestamptz;
  n integer;
BEGIN
  IF p_account_id IS NULL OR p_entity IS NULL OR p_snapshot_id IS NULL
     OR p_observed_at IS NULL OR p_items IS NULL
     OR p_entity NOT IN ('products', 'prices', 'stocks')
     OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_ozon_capture';
  END IF;
  n := jsonb_array_length(p_items);
  IF n > 10000 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x
    WHERE jsonb_typeof(x) <> 'object'
      OR jsonb_typeof(x->'product_id') IS DISTINCT FROM 'number'
      OR (x->>'product_id') !~ '^[1-9][0-9]*$'
      OR (x->>'product_id')::numeric > 9007199254740991
  ) OR (SELECT count(DISTINCT x->>'product_id') FROM jsonb_array_elements(p_items) AS x) <> n THEN
    RAISE EXCEPTION 'invalid_ozon_product_identity';
  END IF;
  -- Serialize publications for an account and reject WB/foreign marketplace targets.
  PERFORM 1 FROM public.marketplace_accounts
    WHERE id = p_account_id AND marketplace = 'ozon' AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ozon_account'; END IF;

  SELECT * INTO prior FROM public.ozon_source_snapshots WHERE id = p_snapshot_id;
  IF FOUND THEN
    IF prior.marketplace_account_id <> p_account_id OR prior.entity <> p_entity
       OR prior.observed_at <> p_observed_at OR prior.items <> p_items THEN
      RAISE EXCEPTION 'ozon_capture_identity_conflict';
    END IF;
    RETURN prior.row_count; -- Idempotent replay must never move a newer pointer back.
  END IF;
  SELECT s.observed_at INTO current_observed
    FROM public.ozon_source_current c
    JOIN public.ozon_source_snapshots s ON s.id = c.snapshot_id
    WHERE c.marketplace_account_id = p_account_id AND c.entity = p_entity;
  IF current_observed IS NOT NULL AND p_observed_at <= current_observed THEN
    RAISE EXCEPTION 'stale_ozon_capture';
  END IF;
  INSERT INTO public.ozon_source_snapshots(id, marketplace_account_id, entity, observed_at, items, row_count)
    VALUES (p_snapshot_id, p_account_id, p_entity, p_observed_at, p_items, n);
  INSERT INTO public.ozon_source_current(marketplace_account_id, entity, snapshot_id)
    VALUES (p_account_id, p_entity, p_snapshot_id)
    ON CONFLICT (marketplace_account_id, entity) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.orion_publish_ozon_source_capture(bigint,text,uuid,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_publish_ozon_source_capture(bigint,text,uuid,timestamptz,jsonb)
  TO service_role;
COMMIT;
