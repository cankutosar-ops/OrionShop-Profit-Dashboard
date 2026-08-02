-- Sprint 11.2 — Company workspace: soft archive + tax defaults
-- Apply before relying on status / default_tax_percent in production.

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('active', 'archived'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_tax_percent NUMERIC NOT NULL DEFAULT 6;

COMMENT ON COLUMN public.companies.status IS
  'Sprint 11.2 — active | archived (soft archive; historical warehouse data retained).';

COMMENT ON COLUMN public.companies.default_tax_percent IS
  'Sprint 11.2 — default tax rate input for the company (not a calculated Estimated Tax).';

CREATE INDEX IF NOT EXISTS idx_companies_status
  ON public.companies (status);

COMMIT;
