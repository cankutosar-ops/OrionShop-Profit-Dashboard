-- Additive canonical current stock. Legacy wb_stock remains the active read source.
BEGIN;

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS chrt_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_product_variants_account_nm_chrt
  ON public.product_variants (marketplace_account_id, nm_id, chrt_id)
  WHERE chrt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wb_current_stocks (
  marketplace_account_id BIGINT NOT NULL REFERENCES public.marketplace_accounts(id),
  nm_id BIGINT NOT NULL CHECK (nm_id > 0),
  chrt_id BIGINT NOT NULL CHECK (chrt_id > 0),
  warehouse_key TEXT NOT NULL CHECK (warehouse_key <> ''),
  warehouse_id BIGINT,
  warehouse_name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  in_way_to_client INTEGER NOT NULL DEFAULT 0 CHECK (in_way_to_client >= 0),
  in_way_from_client INTEGER NOT NULL DEFAULT 0 CHECK (in_way_from_client >= 0),
  barcode TEXT,
  tech_size TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (marketplace_account_id, nm_id, chrt_id, warehouse_key)
);

CREATE INDEX IF NOT EXISTS idx_wb_current_stocks_account_warehouse
  ON public.wb_current_stocks (marketplace_account_id, warehouse_key);

ALTER TABLE public.wb_current_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wb_current_stocks_service ON public.wb_current_stocks;
CREATE POLICY wb_current_stocks_service ON public.wb_current_stocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS wb_current_stocks_tenant_select ON public.wb_current_stocks;
CREATE POLICY wb_current_stocks_tenant_select ON public.wb_current_stocks
  FOR SELECT TO authenticated
  USING (marketplace_account_id = ANY (public.orion_allowed_marketplace_account_ids()));
REVOKE ALL ON TABLE public.wb_current_stocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wb_current_stocks TO service_role;
GRANT SELECT ON TABLE public.wb_current_stocks TO authenticated;

-- A complete Analytics pull replaces one account's current cache atomically.
-- No legacy stock or historical snapshots are touched.
CREATE OR REPLACE FUNCTION public.replace_wb_current_stocks(p_account_id BIGINT, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid canonical stock replacement input';
  END IF;
  PERFORM pg_advisory_xact_lock(p_account_id);

  INSERT INTO public.wb_current_stocks (
    marketplace_account_id, nm_id, chrt_id, warehouse_key, warehouse_id,
    warehouse_name, quantity, in_way_to_client, in_way_from_client,
    barcode, tech_size, observed_at, updated_at
  )
  SELECT p_account_id, r.nm_id, r.chrt_id, r.warehouse_key, r.warehouse_id,
    r.warehouse_name, r.quantity, r.in_way_to_client, r.in_way_from_client,
    r.barcode, r.tech_size, r.observed_at, now()
  FROM jsonb_to_recordset(p_rows) AS r(
    nm_id BIGINT, chrt_id BIGINT, warehouse_key TEXT, warehouse_id BIGINT,
    warehouse_name TEXT, quantity INTEGER, in_way_to_client INTEGER,
    in_way_from_client INTEGER, barcode TEXT, tech_size TEXT, observed_at TIMESTAMPTZ
  )
  ON CONFLICT (marketplace_account_id, nm_id, chrt_id, warehouse_key)
  DO UPDATE SET warehouse_id = EXCLUDED.warehouse_id,
    warehouse_name = EXCLUDED.warehouse_name, quantity = EXCLUDED.quantity,
    in_way_to_client = EXCLUDED.in_way_to_client,
    in_way_from_client = EXCLUDED.in_way_from_client,
    barcode = EXCLUDED.barcode, tech_size = EXCLUDED.tech_size,
    observed_at = EXCLUDED.observed_at, updated_at = now();

  DELETE FROM public.wb_current_stocks AS existing
  WHERE existing.marketplace_account_id = p_account_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(
        nm_id BIGINT, chrt_id BIGINT, warehouse_key TEXT
      )
      WHERE r.nm_id = existing.nm_id AND r.chrt_id = existing.chrt_id
        AND r.warehouse_key = existing.warehouse_key
    );
  RETURN jsonb_array_length(p_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_wb_current_stocks(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_wb_current_stocks(BIGINT, JSONB) TO service_role;

COMMIT;
