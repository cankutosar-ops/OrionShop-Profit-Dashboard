-- =============================================================================
-- Migration: Dashboard read access via RLS SELECT policies (anon + authenticated)
-- =============================================================================
-- Run in Supabase SQL Editor AFTER 20260623170001_grant_service_role_permissions.sql
--
-- Context: Dashboard uses NEXT_PUBLIC_SUPABASE_ANON_KEY (anon role).
-- service_role bypasses RLS for sync writes; anon needs explicit SELECT policies.
--
-- Inspection (run first — optional):
--   See section A below.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) INSPECTION — copy/run separately to view current RLS state
-- ---------------------------------------------------------------------------
-- SELECT
--   c.relname AS table_name,
--   c.relrowsecurity AS rls_enabled,
--   COALESCE(p.polname, '(no policy)') AS policy_name,
--   CASE p.polcmd
--     WHEN 'r' THEN 'SELECT'
--     WHEN 'a' THEN 'INSERT'
--     WHEN 'w' THEN 'UPDATE'
--     WHEN 'd' THEN 'DELETE'
--     WHEN '*' THEN 'ALL'
--     ELSE COALESCE(p.polcmd::text, '-')
--   END AS command,
--   COALESCE(array_to_string(p.polroles::regrole[], ', '), '-') AS roles
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relname IN (
--     'brands', 'categories', 'products',
--     'wb_orders', 'wb_sales', 'wb_finance', 'wb_ads',
--     'product_cost_history'
--   )
-- ORDER BY c.relname, p.polname;

-- ---------------------------------------------------------------------------
-- B) Table-level SELECT grants (idempotent; RLS still applies)
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.brands TO anon, authenticated;
GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT SELECT ON TABLE public.wb_orders TO anon, authenticated;
GRANT SELECT ON TABLE public.wb_sales TO anon, authenticated;
GRANT SELECT ON TABLE public.wb_finance TO anon, authenticated;
GRANT SELECT ON TABLE public.wb_ads TO anon, authenticated;
GRANT SELECT ON TABLE public.product_cost_history TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- C) Enable RLS + read-only SELECT policies for dashboard roles
--    USING (true) = single-tenant MVP; all rows readable, no writes via anon.
-- ---------------------------------------------------------------------------

-- brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.brands;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.brands;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.brands
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.categories;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.categories;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.products;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.products;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- wb_orders
ALTER TABLE public.wb_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.wb_orders;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.wb_orders;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.wb_orders
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- wb_sales
ALTER TABLE public.wb_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.wb_sales;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.wb_sales;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.wb_sales
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- wb_finance (already readable by anon in current project; normalize policy name)
ALTER TABLE public.wb_finance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.wb_finance;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.wb_finance;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.wb_finance
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- wb_ads (empty today; needed when ad sync is added)
ALTER TABLE public.wb_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.wb_ads;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.wb_ads;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.wb_ads
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- product_cost_history
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated service" ON public.product_cost_history;
DROP POLICY IF EXISTS "dashboard_read_anon_auth" ON public.product_cost_history;
CREATE POLICY "dashboard_read_anon_auth"
  ON public.product_cost_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;

-- ---------------------------------------------------------------------------
-- D) VERIFICATION — run after COMMIT
-- ---------------------------------------------------------------------------
-- SET ROLE anon;
-- SELECT count(*) FROM products;
-- SELECT count(*) FROM wb_sales;
-- SELECT count(*) FROM wb_orders;
-- RESET ROLE;
