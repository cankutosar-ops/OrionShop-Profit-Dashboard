-- Sprint 6.17C: finance persistence prerequisites (idempotent)
-- 1) Deduplicate legacy rows by source_key
-- 2) finance_category columns
-- 3) Composite unique index for sync upsert

BEGIN;

UPDATE public.wb_finance
SET source_key = description
WHERE source_key IS NULL
  AND description IS NOT NULL
  AND description LIKE 'rrd:%';

DELETE FROM public.wb_finance AS duplicate
USING public.wb_finance AS keeper
WHERE duplicate.source_key IS NOT NULL
  AND duplicate.source_key = keeper.source_key
  AND duplicate.id > keeper.id;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_category TEXT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS wb_source_suffix TEXT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS supplier_oper_name TEXT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_nature TEXT;

CREATE INDEX IF NOT EXISTS idx_wb_finance_category
  ON public.wb_finance (finance_category)
  WHERE finance_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wb_finance_account_category_date
  ON public.wb_finance (marketplace_account_id, finance_category, operation_date)
  WHERE finance_category IS NOT NULL;

DROP INDEX IF EXISTS public.idx_wb_finance_source_key_unique;
DROP INDEX IF EXISTS public.idx_wb_finance_store_source_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wb_finance_account_source_key
  ON public.wb_finance (marketplace_account_id, source_key)
  WHERE source_key IS NOT NULL;

COMMIT;
