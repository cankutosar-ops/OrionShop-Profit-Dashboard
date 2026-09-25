-- Tax Engine V1 final composition prerequisites.
-- Forward-only and additive: no business facts or historical tax rows are rewritten.
BEGIN;

-- Production is missing the Sprint 11.2 company columns already used by the app.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('active', 'archived'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_tax_percent NUMERIC NOT NULL DEFAULT 6;

CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

COMMENT ON COLUMN public.companies.status IS
  'active | archived; archive is soft and preserves company history.';
COMMENT ON COLUMN public.companies.default_tax_percent IS
  'Company tax-rate input retained for administration; Tax Engine uses the effective tax profile.';

-- Manual expense claims remain unrecognized until document and payment evidence is recorded.
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS document_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

ALTER TABLE public.company_expenses
  DROP CONSTRAINT IF EXISTS company_expenses_payment_status_check,
  DROP CONSTRAINT IF EXISTS company_expenses_paid_amount_check,
  DROP CONSTRAINT IF EXISTS company_expenses_verified_document_check;

ALTER TABLE public.company_expenses
  ADD CONSTRAINT company_expenses_payment_status_check
    CHECK (payment_status IN ('UNVERIFIED','UNPAID','PARTIALLY_PAID','PAID')),
  ADD CONSTRAINT company_expenses_paid_amount_check CHECK (
    (payment_status IN ('UNVERIFIED','UNPAID') AND paid_amount = 0 AND payment_date IS NULL)
    OR (payment_status = 'PARTIALLY_PAID' AND paid_amount > 0 AND paid_amount < amount
      AND payment_date IS NOT NULL AND length(btrim(payment_reference)) > 0)
    OR (payment_status = 'PAID' AND paid_amount = amount
      AND payment_date IS NOT NULL AND length(btrim(payment_reference)) > 0)
  ),
  ADD CONSTRAINT company_expenses_verified_document_check CHECK (
    evidence_status <> 'VERIFIED' OR length(btrim(document_reference)) > 0
  );

COMMENT ON COLUMN public.company_expenses.document_reference IS
  'Reference to the supporting statutory document; required before evidence can be VERIFIED.';
COMMENT ON COLUMN public.company_expenses.payment_status IS
  'Payment evidence state. A deductible checkbox does not establish payment.';
COMMENT ON COLUMN public.company_expenses.payment_reference IS
  'Reference to payment evidence; required for partially or fully paid status.';

-- Supabase default privileges may grant UPDATE/DELETE on newly created tables.
-- Preserve the Sprint 3B append-only policy at the privilege layer as well.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.company_purchase_tax_policies, public.purchase_payment_audit,
  public.tax_purchase_recognition_events FROM service_role;

-- VAT is an explicit effective-profile setting. These overloads preserve the old RPCs
-- while requiring callers using the Tax Engine V1 onboarding flow to supply a VAT state.
CREATE OR REPLACE FUNCTION public.orion_append_company_tax_profile(
  p_company_id BIGINT, p_tax_object TEXT, p_tax_rate NUMERIC,
  p_effective_from DATE, p_vat_status TEXT
) RETURNS public.company_tax_profiles
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prior public.company_tax_profiles;
  result public.company_tax_profiles;
BEGIN
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  IF p_tax_object NOT IN ('USN_INCOME','USN_INCOME_MINUS_EXPENSES')
    OR p_tax_rate IS NULL OR p_tax_rate <= 0 OR p_tax_rate > 100
    OR p_tax_rate <> round(p_tax_rate, 2) OR p_effective_from IS NULL
    OR p_vat_status NOT IN ('UNKNOWN','EXEMPT','VAT_APPLICABLE') THEN
    RAISE EXCEPTION 'Invalid tax profile';
  END IF;
  SELECT * INTO prior FROM public.company_tax_profiles
    WHERE company_id = p_company_id ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF p_effective_from <= (now() AT TIME ZONE 'Europe/Moscow')::date
      OR p_effective_from <= prior.effective_from THEN
      RAISE EXCEPTION 'Existing tax elections may only be superseded on a future date';
    END IF;
    IF prior.effective_to IS NULL OR prior.effective_to >= p_effective_from THEN
      UPDATE public.company_tax_profiles SET effective_to = p_effective_from - 1,
        updated_at = now() WHERE id = prior.id;
    END IF;
  END IF;
  INSERT INTO public.company_tax_profiles(
    company_id, tax_object, tax_rate, effective_from, vat_status
  ) VALUES (
    p_company_id, p_tax_object, p_tax_rate, p_effective_from, p_vat_status
  ) RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.orion_append_company_tax_profile(BIGINT,TEXT,NUMERIC,DATE,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_append_company_tax_profile(BIGINT,TEXT,NUMERIC,DATE,TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.orion_create_company_with_tax_profile(
  p_name TEXT, p_country TEXT, p_currency TEXT, p_timezone TEXT, p_language TEXT,
  p_is_default BOOLEAN, p_tax_object TEXT, p_tax_rate NUMERIC,
  p_effective_from DATE, p_vat_status TEXT
) RETURNS public.companies
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result public.companies;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Company name is required'; END IF;
  IF p_tax_object NOT IN ('USN_INCOME','USN_INCOME_MINUS_EXPENSES')
    OR p_tax_rate IS NULL OR p_tax_rate <= 0 OR p_tax_rate > 100
    OR p_tax_rate <> round(p_tax_rate, 2) OR p_effective_from IS NULL
    OR p_vat_status NOT IN ('UNKNOWN','EXEMPT','VAT_APPLICABLE') THEN
    RAISE EXCEPTION 'Invalid tax profile';
  END IF;
  IF COALESCE(p_is_default, false) THEN
    UPDATE public.companies SET is_default = false WHERE is_default = true;
  END IF;
  INSERT INTO public.companies(
    name, country, currency, timezone, language, is_default, status, default_tax_percent
  ) VALUES (
    btrim(p_name), NULLIF(btrim(p_country),''),
    COALESCE(NULLIF(btrim(p_currency),''),'RUB'),
    COALESCE(NULLIF(btrim(p_timezone),''),'Europe/Moscow'),
    COALESCE(NULLIF(btrim(p_language),''),'ru'),
    COALESCE(p_is_default,false), 'active', p_tax_rate
  ) RETURNING * INTO result;
  INSERT INTO public.company_tax_profiles(
    company_id, tax_object, tax_rate, effective_from, vat_status
  ) VALUES (
    result.id, p_tax_object, p_tax_rate, p_effective_from, p_vat_status
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.orion_create_company_with_tax_profile(
  TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,NUMERIC,DATE,TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_create_company_with_tax_profile(
  TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,NUMERIC,DATE,TEXT
) TO service_role;

COMMIT;
