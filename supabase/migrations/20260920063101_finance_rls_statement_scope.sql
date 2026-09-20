-- Evaluate the existing, row-independent account claims once per statement.
-- No tenant scope, grants, financial data, or accounting semantics change.
BEGIN;
DO $$
DECLARE predicate text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO predicate
  FROM pg_policy
  WHERE polrelid = 'public.wb_finance'::regclass
    AND polname = 'tenant_select_wb_finance'
    AND polcmd = 'r' AND polpermissive
    AND polroles = ARRAY['authenticated'::regrole::oid];
  IF predicate IS DISTINCT FROM '(marketplace_account_id = ANY (orion_allowed_marketplace_account_ids()))' THEN
    RAISE EXCEPTION 'Finance tenant policy differs from reviewed preflight';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.wb_finance'::regclass) THEN
    RAISE EXCEPTION 'Finance RLS must be enabled';
  END IF;
END $$;
ALTER POLICY tenant_select_wb_finance ON public.wb_finance
  USING (marketplace_account_id = ANY ((SELECT public.orion_allowed_marketplace_account_ids())::bigint[]));
COMMIT;
