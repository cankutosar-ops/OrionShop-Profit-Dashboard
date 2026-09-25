\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.companies(name, country, currency, timezone, language, is_default, status, default_tax_percent)
VALUES ('tax-test-a','RU','RUB','Europe/Moscow','ru',false,'active',6) RETURNING id AS a \gset
INSERT INTO public.companies(name, country, currency, timezone, language, is_default, status, default_tax_percent)
VALUES ('tax-test-b','RU','RUB','Europe/Moscow','ru',false,'active',6) RETURNING id AS b \gset

SELECT id AS c FROM public.orion_create_company_with_tax_profile(
  'tax-test-created','RU','RUB','Europe/Moscow','ru',false,'USN_INCOME_MINUS_EXPENSES',15,'2026-09-24') \gset
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_tax_profiles
      WHERE company_id=(SELECT id FROM public.companies WHERE name='tax-test-created' ORDER BY id DESC LIMIT 1)) <> 1 THEN
    RAISE EXCEPTION 'Company onboarding did not create a tax profile atomically';
  END IF;
END $$;

SELECT id AS profile_id FROM public.orion_append_company_tax_profile(:a,'USN_INCOME',6,'2026-01-01') \gset
SELECT id AS future_profile_id FROM public.orion_append_company_tax_profile(:a,'USN_INCOME_MINUS_EXPENSES',15,'2027-01-01') \gset
DO $$ BEGIN
  IF (SELECT effective_to FROM public.company_tax_profiles
      WHERE company_id=(SELECT id FROM public.companies WHERE name='tax-test-a' ORDER BY id DESC LIMIT 1)
      AND effective_from='2026-01-01') <> '2026-12-31'::date THEN
    RAISE EXCEPTION 'Future profile did not close prior interval';
  END IF;
END $$;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.company_tax_profiles(company_id,tax_object,tax_rate,effective_from)
    SELECT company_id,'USN_INCOME_MINUS_EXPENSES',15,'2026-06-01'
    FROM public.company_tax_profiles WHERE id = (SELECT id FROM public.company_tax_profiles
      WHERE company_id=(SELECT id FROM public.companies WHERE name='tax-test-a' ORDER BY id DESC LIMIT 1)
      LIMIT 1);
    RAISE EXCEPTION 'Overlapping profile was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
END $$;

INSERT INTO public.company_expenses(company_id,expense_date,category,description,amount,tax_deductible,
  category_default,tax_deductible_origin,updated_by)
VALUES (:a,'2026-09-24','ACCOUNTING','tax test',100.00,true,true,'CATEGORY_DEFAULT','test')
RETURNING id AS expense_id \gset
UPDATE public.company_expenses SET tax_deductible=false, tax_deductible_origin='USER_OVERRIDE',
  updated_by='test', updated_at=now() WHERE id=:expense_id;
UPDATE public.company_expenses SET deleted_at=now(), updated_by='test' WHERE id=:expense_id;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_expense_audit
    WHERE expense_id=(SELECT id FROM public.company_expenses WHERE description='tax test' ORDER BY id DESC LIMIT 1)) <> 3 THEN
    RAISE EXCEPTION 'Expense audit did not record create, update, soft delete';
  END IF;
END $$;

INSERT INTO public.company_tax_profiles(company_id,tax_object,tax_rate,effective_from)
VALUES (:b,'USN_INCOME',6,'2026-01-01');
INSERT INTO public.company_expenses(company_id,expense_date,category,description,amount,tax_deductible,
  category_default,tax_deductible_origin)
VALUES (:b,'2026-09-24','RENT','tax test b',100,false,false,'CATEGORY_DEFAULT');

SELECT set_config('request.jwt.claims',
  json_build_object('app_metadata',json_build_object('orion',json_build_object('company_ids',array[:a])))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_tax_profiles) <> 2 THEN
    RAISE EXCEPTION 'Cross-company profile read';
  END IF;
  IF (SELECT count(*) FROM public.company_expenses WHERE deleted_at IS NULL) <> 0 THEN
    RAISE EXCEPTION 'Cross-company expense read';
  END IF;
  BEGIN
    INSERT INTO public.company_expenses(company_id,expense_date,category,description,amount,tax_deductible,
      category_default,tax_deductible_origin)
    VALUES ((SELECT id FROM public.companies WHERE name='tax-test-a' ORDER BY id DESC LIMIT 1),
      '2026-09-24','OTHER','forbidden',1,false,false,'CATEGORY_DEFAULT');
    RAISE EXCEPTION 'Direct authenticated write was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('app_metadata',json_build_object('orion',json_build_object('company_ids',array[:b])))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_tax_profiles) <> 1 OR
     (SELECT count(*) FROM public.company_expenses WHERE deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Company B own-scope read failed';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.company_tax_profiles;
    RAISE EXCEPTION 'Anonymous tax profile read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.company_expenses;
    RAISE EXCEPTION 'Anonymous expense read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
