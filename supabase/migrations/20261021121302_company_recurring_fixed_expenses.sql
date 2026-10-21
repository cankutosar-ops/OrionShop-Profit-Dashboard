BEGIN;
CREATE TABLE public.company_recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id bigint NOT NULL REFERENCES public.companies(id),
  marketplace_account_id bigint NOT NULL REFERENCES public.marketplace_accounts(id),
  category text NOT NULL CHECK (category IN ('ACCOUNTING','PAYROLL','OTHER')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  monthly_amount numeric(14,2) NOT NULL CHECK (monthly_amount > 0),
  start_date date NOT NULL CHECK (extract(day FROM start_date)=1),
  end_date date CHECK (end_date >= start_date),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, marketplace_account_id, category, start_date)
);
CREATE INDEX company_recurring_expenses_scope ON public.company_recurring_expenses(company_id,marketplace_account_id,start_date);
ALTER TABLE public.company_recurring_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_recurring_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_recurring_expenses TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.company_recurring_expenses TO service_role;
CREATE POLICY tenant_read_recurring_expenses ON public.company_recurring_expenses FOR SELECT TO authenticated
  USING (company_id=ANY(public.orion_jwt_company_ids()));
CREATE POLICY service_manage_recurring_expenses ON public.company_recurring_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Preserve every configuration version; accruals are derived by stable rule/month
-- identity. No scheduler or read request writes monthly duplicates or paid facts.
CREATE TABLE public.company_recurring_expense_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  rule_id uuid NOT NULL REFERENCES public.company_recurring_expenses(id),
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE')),
  old_row jsonb,
  new_row jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_recurring_expense_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_recurring_expense_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_recurring_expense_audit TO authenticated;
GRANT SELECT,INSERT ON public.company_recurring_expense_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.company_recurring_expense_audit_id_seq TO service_role;
CREATE POLICY tenant_read_recurring_expense_audit ON public.company_recurring_expense_audit FOR SELECT TO authenticated
  USING (company_id=ANY(public.orion_jwt_company_ids()));
CREATE POLICY service_read_recurring_expense_audit ON public.company_recurring_expense_audit FOR SELECT TO service_role USING (true);
CREATE POLICY service_append_recurring_expense_audit ON public.company_recurring_expense_audit FOR INSERT TO service_role WITH CHECK (true);

CREATE FUNCTION public.guard_company_recurring_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.company_id,NEW.marketplace_account_id,NEW.category,NEW.monthly_amount,NEW.start_date,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.company_id,OLD.marketplace_account_id,OLD.category,OLD.monthly_amount,OLD.start_date,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Historical fixed expense rules are immutable; close the period and create a new rule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_accounts a WHERE a.id=NEW.marketplace_account_id AND a.company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Fixed expense account/company mismatch' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recurring-expense:'||NEW.marketplace_account_id::text||':'||NEW.category,0));
  IF EXISTS (SELECT 1 FROM public.company_recurring_expenses r
    WHERE r.marketplace_account_id=NEW.marketplace_account_id AND r.category=NEW.category AND r.id<>NEW.id
    AND daterange(r.start_date,r.end_date,'[]') && daterange(NEW.start_date,NEW.end_date,'[]')) THEN
    RAISE EXCEPTION 'Overlapping monthly fixed expense' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_company_recurring_expense() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_company_recurring_expense() TO service_role;
CREATE TRIGGER guard_company_recurring_expense BEFORE INSERT OR UPDATE ON public.company_recurring_expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_company_recurring_expense();
CREATE FUNCTION public.audit_company_recurring_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.company_recurring_expense_audit(company_id,rule_id,action,old_row,new_row)
  VALUES (NEW.company_id,NEW.id,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.audit_company_recurring_expense() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.audit_company_recurring_expense() TO service_role;
CREATE TRIGGER audit_company_recurring_expense AFTER INSERT OR UPDATE ON public.company_recurring_expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_company_recurring_expense();
COMMENT ON TABLE public.company_recurring_expenses IS 'Account-scoped monthly management accruals. Not evidence of payment or statutory tax deductibility.';
COMMIT;
