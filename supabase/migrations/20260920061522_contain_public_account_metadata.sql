-- Restrict metadata reads to the same explicit tenant/account scope as facts.
-- No base-table writes, credential changes, data movement or accounting changes.
BEGIN;

CREATE OR REPLACE VIEW public.marketplace_accounts_public AS
SELECT id, company_id, marketplace, account_name, seller_id, is_active,
       is_default, sync_enabled, last_sync_at, last_successful_sync_at,
       last_sync_status, created_at, updated_at
FROM public.marketplace_accounts
WHERE current_user = 'service_role'
   OR id = ANY(public.orion_allowed_marketplace_account_ids());

-- The base table remains inaccessible to authenticated users because it
-- includes credential ciphertext. The view exposes only enumerated safe fields.
ALTER VIEW public.marketplace_accounts_public SET (security_invoker = false);
REVOKE ALL ON public.marketplace_accounts_public FROM anon;
GRANT SELECT ON public.marketplace_accounts_public TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_list_marketplace_accounts_public()
RETURNS SETOF public.marketplace_accounts_public
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT * FROM public.marketplace_accounts_public;
$$;
REVOKE ALL ON FUNCTION public.orion_list_marketplace_accounts_public() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orion_list_marketplace_accounts_public() TO authenticated, service_role;

COMMIT;
