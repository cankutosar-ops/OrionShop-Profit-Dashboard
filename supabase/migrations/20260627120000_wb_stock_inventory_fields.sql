-- Sprint 4 Phase 2: persist full WB stock payload in wb_stock cache

BEGIN;

ALTER TABLE public.wb_stock
  ADD COLUMN IF NOT EXISTS quantity_full INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_way_to_client INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_way_from_client INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_stock' AND column_name = 'synced_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_stock' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.wb_stock RENAME COLUMN synced_at TO last_synced_at;
  END IF;
END $$;

-- Backfill from legacy rows that only stored quantity
UPDATE public.wb_stock
SET quantity_full = quantity
WHERE quantity_full = 0 AND quantity <> 0;

COMMENT ON COLUMN public.wb_stock.quantity IS 'WB quantity — available for sale';
COMMENT ON COLUMN public.wb_stock.quantity_full IS 'WB quantityFull — total at warehouse';
COMMENT ON COLUMN public.wb_stock.in_way_to_client IS 'WB inWayToClient';
COMMENT ON COLUMN public.wb_stock.in_way_from_client IS 'WB inWayFromClient';
COMMENT ON COLUMN public.wb_stock.last_synced_at IS 'Timestamp when row was last synced from WB API';

COMMIT;
