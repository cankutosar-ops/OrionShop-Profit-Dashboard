SET ROLE service_role;
INSERT INTO public.company_recurring_expenses(company_id,marketplace_account_id,category,description,monthly_amount,start_date,created_by) VALUES
 (3,6,'ACCOUNTING','Muhasebe',20000,'2026-10-01','fixture'),
 (3,6,'PAYROLL','Maaş',40000,'2026-10-01','fixture'),
 (3,6,'OTHER','Diğer',5000,'2026-10-01','fixture'),
 (2,2,'OTHER','Other company',999,'2026-10-01','fixture');
DO $$ BEGIN
 IF (SELECT sum(monthly_amount) FROM company_recurring_expenses WHERE company_id=3)<>65000 THEN RAISE EXCEPTION 'Total wrong'; END IF;
 IF (SELECT count(*) FROM company_recurring_expense_audit)<>4 THEN RAISE EXCEPTION 'Audit missing'; END IF;
 BEGIN
  INSERT INTO company_recurring_expenses(company_id,marketplace_account_id,category,description,monthly_amount,start_date,created_by)
   VALUES (2,6,'PAYROLL','Invalid scope',40000,'2026-11-01','fixture');
  RAISE EXCEPTION 'Cross company allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO company_recurring_expenses(company_id,marketplace_account_id,category,description,monthly_amount,start_date,created_by)
   VALUES (3,6,'ACCOUNTING','Duplicate overlap',20000,'2026-11-01','fixture');
  RAISE EXCEPTION 'Overlap allowed';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 BEGIN
  UPDATE company_recurring_expenses SET monthly_amount=1 WHERE company_id=3;
  RAISE EXCEPTION 'Historical amount rewrite allowed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Historical fixed expense rules%' THEN RAISE; END IF;
 END;
 BEGIN
  DELETE FROM company_recurring_expense_audit;
  RAISE EXCEPTION 'Audit delete allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"app_metadata":{"orion":{"company_ids":[3]}}}';
DO $$ BEGIN
 IF (SELECT count(*) FROM company_recurring_expenses)<>3 THEN RAISE EXCEPTION 'Company isolation broken'; END IF;
 IF EXISTS (SELECT 1 FROM company_recurring_expenses WHERE company_id<>3) THEN RAISE EXCEPTION 'Leaked company'; END IF;
 IF (SELECT count(*) FROM company_recurring_expense_audit)<>3 THEN RAISE EXCEPTION 'Audit isolation broken'; END IF;
 BEGIN
  UPDATE company_recurring_expenses SET monthly_amount=1;
  RAISE EXCEPTION 'Client can mutate budgets';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.jwt.claims='{"app_metadata":{"orion":{"company_ids":[2]}}}';
DO $$ BEGIN IF (SELECT count(*) FROM company_recurring_expenses)<>1 THEN RAISE EXCEPTION 'Other company isolation broken'; END IF; END $$;
SET request.jwt.claims='{"user_metadata":{"orion":{"company_ids":[3]}}}';
DO $$ BEGIN IF EXISTS (SELECT 1 FROM company_recurring_expenses) THEN RAISE EXCEPTION 'User metadata granted access'; END IF; END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM company_recurring_expenses; RAISE EXCEPTION 'Anon can read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: local additive migration, 65k rules, append audit, duplicate/overlap prevention, immutable historical amounts, FK scope, JWT RLS, no authenticated writes, no anon access' AS result;
