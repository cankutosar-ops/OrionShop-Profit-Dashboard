-- Cleanup duplicate wb_finance rows from repeated sync INSERTs.
-- Safe to re-run: keeps the row with the smallest id per source_key.
--
-- Run BEFORE applying idx_wb_finance_source_key_unique if migration was not applied yet.
-- Usage (Supabase SQL editor or psql):
--   \i supabase/scripts/cleanup-wb-finance-duplicates.sql

BEGIN;

-- Backfill source_key from description where missing
UPDATE public.wb_finance
SET source_key = description
WHERE source_key IS NULL
  AND description IS NOT NULL
  AND description LIKE 'rrd:%';

-- Preview duplicates (optional — comment out DELETE block to inspect only)
-- SELECT source_key, COUNT(*) AS copies, SUM(amount) AS total_amount
-- FROM public.wb_finance
-- WHERE source_key IS NOT NULL
-- GROUP BY source_key
-- HAVING COUNT(*) > 1
-- ORDER BY copies DESC
-- LIMIT 20;

DELETE FROM public.wb_finance AS duplicate
USING public.wb_finance AS keeper
WHERE duplicate.source_key IS NOT NULL
  AND duplicate.source_key = keeper.source_key
  AND duplicate.id > keeper.id;

-- Report remaining duplicate descriptions without source_key (legacy migrated rows)
-- SELECT description, COUNT(*) AS copies
-- FROM public.wb_finance
-- WHERE source_key IS NULL AND description IS NOT NULL
-- GROUP BY description
-- HAVING COUNT(*) > 1;

COMMIT;

-- Verify: should return 0 rows
-- SELECT source_key, COUNT(*) FROM public.wb_finance
-- WHERE source_key IS NOT NULL GROUP BY source_key HAVING COUNT(*) > 1;
