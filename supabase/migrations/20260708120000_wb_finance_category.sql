-- Sprint 6.11: normalized finance categorization (sync/backfill only)
-- operation_type remains the permanent high-level profit bucket.

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_category TEXT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS wb_source_suffix TEXT;

ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS supplier_oper_name TEXT;

-- Reserved for a future FinanceNature dimension (expense vs credit, etc.)
ALTER TABLE public.wb_finance
  ADD COLUMN IF NOT EXISTS finance_nature TEXT;

CREATE INDEX IF NOT EXISTS idx_wb_finance_category
  ON public.wb_finance (finance_category)
  WHERE finance_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wb_finance_account_category_date
  ON public.wb_finance (marketplace_account_id, finance_category, operation_date)
  WHERE finance_category IS NOT NULL;

COMMENT ON COLUMN public.wb_finance.finance_category IS
  'Normalized fee category — analytical source of truth. Set at sync/backfill only.';

COMMENT ON COLUMN public.wb_finance.wb_source_suffix IS
  'Fee line suffix from rrd:{id}:{suffix} — denormalized for query/debug.';

COMMENT ON COLUMN public.wb_finance.supplier_oper_name IS
  'Wildberries supplier_oper_name from reportDetailByPeriod.';

COMMENT ON COLUMN public.wb_finance.finance_nature IS
  'Reserved for a future FinanceNature reporting dimension. Nullable until populated.';
