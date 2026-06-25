-- wb_finance: deduplicate Wildberries sync rows and enforce unique source_key
-- Wildberries unique line id = rrd_id + fee suffix → stored as source_key (rrd:{rrd_id}:{suffix})

-- 1. Add source_key column
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS source_key TEXT;

-- 2. Backfill from existing description (sync rows use rrd: prefix)
UPDATE public.wb_finance
SET source_key = description
WHERE source_key IS NULL
  AND description IS NOT NULL
  AND description LIKE 'rrd:%';

-- 3. Remove duplicate sync rows — keep lowest id per source_key
DELETE FROM public.wb_finance AS duplicate
USING public.wb_finance AS keeper
WHERE duplicate.source_key IS NOT NULL
  AND duplicate.source_key = keeper.source_key
  AND duplicate.id > keeper.id;

-- 4. Unique constraint on Wildberries line id
CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_source_key_unique
  ON public.wb_finance (source_key)
  WHERE source_key IS NOT NULL;

COMMENT ON COLUMN public.wb_finance.source_key IS
  'Wildberries finance line id: rrd:{rrd_id}:{suffix}. Unique per report fee line.';
