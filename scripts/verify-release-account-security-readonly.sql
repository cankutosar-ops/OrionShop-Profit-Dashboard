-- SELECT-only production postconditions for the two September 20 additions.
-- Inspect definitions and booleans; missing rows or false booleans are failures.
SELECT pg_get_viewdef('public.marketplace_accounts_public'::regclass, true) AS scoped_safe_view;
SELECT pg_get_functiondef('public.orion_list_marketplace_accounts_public()'::regprocedure) AS invoker_scoped_rpc;
SELECT NOT has_table_privilege('anon','public.marketplace_accounts_public','SELECT') AS anon_view_denied,
       NOT has_function_privilege('anon','public.orion_list_marketplace_accounts_public()','EXECUTE') AS anon_rpc_denied,
       NOT has_table_privilege('authenticated','public.marketplace_accounts','SELECT') AS ciphertext_table_denied,
       has_table_privilege('authenticated','public.marketplace_accounts_public','SELECT') AS authenticated_view_read,
       has_table_privilege('service_role','public.marketplace_accounts_public','SELECT') AS service_view_read;
SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual,polrelid) AS predicate
FROM pg_policy WHERE polrelid='public.wb_finance'::regclass AND polname='tenant_select_wb_finance';
-- Expected: same account = ANY helper predicate with one scalar SELECT InitPlan;
-- authenticated-only SELECT, and RLS remains enabled.
SELECT relrowsecurity FROM pg_class WHERE oid='public.wb_finance'::regclass;
