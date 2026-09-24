-- Reassert the intended server-only boundary for finance_sync_reports.
-- No rows are changed. This closes schema drift where the table exists with
-- RLS disabled or client grants restored after the original containment pass.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.finance_sync_reports') IS NULL THEN
    RAISE EXCEPTION 'finance_sync_reports is required before RLS hardening';
  END IF;
END $$;

ALTER TABLE public.finance_sync_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_finance_sync_reports
  ON public.finance_sync_reports;
CREATE POLICY service_role_all_finance_sync_reports
  ON public.finance_sync_reports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.finance_sync_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.finance_sync_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.finance_sync_reports_id_seq TO service_role;

COMMIT;
