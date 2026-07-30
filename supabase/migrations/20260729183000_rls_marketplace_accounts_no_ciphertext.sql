-- Sprint 7.1.D follow-up — marketplace_accounts ciphertext must not be
-- readable via PostgREST as authenticated. Column-level REVOKE is unreliable
-- with PostgREST schema cache; revoke table SELECT and expose a safe view.
--
-- Idempotent: drop dependent function before the view, then recreate both.

BEGIN;

-- Authenticated must not SELECT the base table (contains api_key_encrypted).
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_accounts FROM authenticated;

-- Drop function first (depends on the view's row type), then the view.
DROP FUNCTION IF EXISTS public.orion_list_marketplace_accounts_public() CASCADE;
DROP VIEW IF EXISTS public.marketplace_accounts_public CASCADE;

CREATE OR REPLACE VIEW public.marketplace_accounts_public AS
SELECT
  id,
  company_id,
  marketplace,
  account_name,
  seller_id,
  is_active,
  is_default,
  sync_enabled,
  last_sync_at,
  last_successful_sync_at,
  last_sync_status,
  created_at,
  updated_at
FROM public.marketplace_accounts;

ALTER VIEW public.marketplace_accounts_public SET (security_invoker = false);

CREATE OR REPLACE FUNCTION public.orion_list_marketplace_accounts_public()
RETURNS SETOF public.marketplace_accounts_public
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    company_id,
    marketplace,
    account_name,
    seller_id,
    is_active,
    is_default,
    sync_enabled,
    last_sync_at,
    last_successful_sync_at,
    last_sync_status,
    created_at,
    updated_at
  FROM public.marketplace_accounts
  WHERE company_id = ANY (public.orion_jwt_company_ids());
$$;

REVOKE ALL ON FUNCTION public.orion_list_marketplace_accounts_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orion_list_marketplace_accounts_public() TO authenticated, service_role;

GRANT SELECT ON public.marketplace_accounts_public TO authenticated;
GRANT SELECT ON public.marketplace_accounts_public TO service_role;

COMMENT ON VIEW public.marketplace_accounts_public IS
  'Sprint 7.1.D — non-secret marketplace account fields for authenticated clients.';

COMMIT;
