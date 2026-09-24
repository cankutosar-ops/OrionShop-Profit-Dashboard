\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_company_id BIGINT;
  v_legacy_id BIGINT;
  v_profile_count INTEGER;
  v_constraint_failed BOOLEAN := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies'
      AND column_name = 'status' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies'
      AND column_name = 'default_tax_percent' AND data_type = 'numeric'
  ) THEN
    RAISE EXCEPTION 'Forward company columns are missing or have wrong types';
  END IF;
  IF has_table_privilege('service_role', 'public.tax_purchase_recognition_events', 'UPDATE')
    OR has_table_privilege('service_role', 'public.tax_purchase_recognition_events', 'DELETE')
    OR has_table_privilege('service_role', 'public.purchase_payment_audit', 'UPDATE')
    OR has_table_privilege('service_role', 'public.company_purchase_tax_policies', 'DELETE') THEN
    RAISE EXCEPTION 'Append-only Tax Sprint 3B tables expose mutation privileges';
  END IF;

  INSERT INTO public.companies(name) VALUES ('Legacy default verification')
  RETURNING id INTO v_legacy_id;
  IF (SELECT status FROM public.companies WHERE id = v_legacy_id) <> 'active'
    OR (SELECT default_tax_percent FROM public.companies WHERE id = v_legacy_id) <> 6 THEN
    RAISE EXCEPTION 'Existing-company-safe defaults are incorrect';
  END IF;

  SELECT id INTO v_company_id
  FROM public.orion_create_company_with_tax_profile(
    'Tax Final Verification', 'RU', 'RUB', 'Europe/Moscow', 'ru', false,
    'USN_INCOME_MINUS_EXPENSES', 13.5, '2026-01-01', 'EXEMPT'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.company_tax_profiles
    WHERE company_id = v_company_id AND tax_object = 'USN_INCOME_MINUS_EXPENSES'
      AND tax_rate = 13.5 AND vat_status = 'EXEMPT'
  ) THEN
    RAISE EXCEPTION 'Atomic company/profile onboarding did not preserve rate and VAT';
  END IF;
  IF (SELECT default_tax_percent FROM public.companies WHERE id = v_company_id) <> 13.5 THEN
    RAISE EXCEPTION 'Company administration tax input does not match the effective profile';
  END IF;

  PERFORM public.orion_append_company_tax_profile(
    v_company_id, 'USN_INCOME_MINUS_EXPENSES', 13.5, '2099-01-01', 'VAT_APPLICABLE'
  );
  SELECT count(*) INTO v_profile_count FROM public.company_tax_profiles
  WHERE company_id = v_company_id;
  IF v_profile_count <> 2 OR NOT EXISTS (
    SELECT 1 FROM public.company_tax_profiles
    WHERE company_id = v_company_id AND effective_from = '2099-01-01'
      AND vat_status = 'VAT_APPLICABLE'
  ) THEN
    RAISE EXCEPTION 'Effective VAT profile append failed';
  END IF;

  INSERT INTO public.company_expenses(
    company_id, expense_date, category, description, amount, tax_deductible,
    category_default, tax_deductible_origin, evidence_status, document_reference,
    payment_status, payment_date, paid_amount, payment_reference
  ) VALUES (
    v_company_id, '2026-09-24', 'ACCOUNTING', 'Verified evidence', 100, true,
    true, 'CATEGORY_DEFAULT', 'VERIFIED', 'invoice-1',
    'PAID', '2026-09-24', 100, 'bank-1'
  );

  BEGIN
    INSERT INTO public.company_expenses(
      company_id, expense_date, category, description, amount, tax_deductible,
      category_default, tax_deductible_origin, evidence_status,
      payment_status, paid_amount
    ) VALUES (
      v_company_id, '2026-09-24', 'ACCOUNTING', 'Invalid evidence', 100, true,
      true, 'CATEGORY_DEFAULT', 'VERIFIED', 'PAID', 100
    );
  EXCEPTION WHEN check_violation THEN
    v_constraint_failed := true;
  END;
  IF NOT v_constraint_failed THEN
    RAISE EXCEPTION 'Invalid operating evidence was accepted';
  END IF;
END;
$$;

ROLLBACK;
