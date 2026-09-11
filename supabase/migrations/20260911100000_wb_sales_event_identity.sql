-- Preserve SALE and RETURN as separate wb_sales events.
-- Unique identity is WB saleID, not SRID. A later return must not overwrite the sale.
-- Idempotent. Does not delete economic rows. Existing rows without a stored saleID
-- receive a placeholder sale_id so the unique constraint can be enforced; sync
-- replaces that placeholder only when the matching WB saleID for the same
-- account + srid + event type arrives.

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS sale_id TEXT;

ALTER TABLE public.wb_sales
  ADD COLUMN IF NOT EXISTS event_type TEXT;

UPDATE public.wb_sales
SET event_type = CASE WHEN is_return THEN 'RETURN' ELSE 'SALE' END
WHERE event_type IS NULL;

UPDATE public.wb_sales
SET sale_id = 'unresolved:' || marketplace_account_id || ':' || srid || ':' ||
  CASE WHEN is_return THEN 'RETURN' ELSE 'SALE' END
WHERE sale_id IS NULL;

ALTER TABLE public.wb_sales
  ALTER COLUMN sale_id SET NOT NULL;

ALTER TABLE public.wb_sales
  ALTER COLUMN event_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wb_sales_event_type_check'
  ) THEN
    ALTER TABLE public.wb_sales
      ADD CONSTRAINT wb_sales_event_type_check
      CHECK (event_type IN ('SALE', 'RETURN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wb_sales_event_type_matches_is_return'
  ) THEN
    ALTER TABLE public.wb_sales
      ADD CONSTRAINT wb_sales_event_type_matches_is_return
      CHECK (
        (event_type = 'SALE' AND is_return = false)
        OR (event_type = 'RETURN' AND is_return = true)
      );
  END IF;
END $$;

-- SRID uniqueness collapses a return onto the original sale. Drop it.
-- Unique indexes created with CREATE UNIQUE INDEX are not table constraints;
-- also drop a uniquely-constrained (account, srid) if one exists under another name.
DROP INDEX IF EXISTS public.idx_wb_sales_account_srid;
DROP INDEX IF EXISTS public.idx_wb_sales_srid;
DROP INDEX IF EXISTS public.idx_wb_sales_store_srid;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'wb_sales'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['marketplace_account_id', 'srid']
  LOOP
    EXECUTE format('ALTER TABLE public.wb_sales DROP CONSTRAINT %I', rec.conname);
  END LOOP;

  FOR rec IN
    SELECT n.nspname, ic.relname
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'wb_sales'
      AND i.indisunique
      AND i.indnatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['marketplace_account_id', 'srid']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', rec.nspname, rec.relname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_sales_account_sale_id
  ON public.wb_sales (marketplace_account_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_wb_sales_account_srid_lookup
  ON public.wb_sales (marketplace_account_id, srid);

COMMENT ON COLUMN public.wb_sales.sale_id IS
  'WB Statistics saleID. Unique economic event. Placeholder unresolved:… until the native saleID is synced.';
COMMENT ON COLUMN public.wb_sales.event_type IS
  'SALE or RETURN. Independent of SRID so both events can coexist.';
