-- Sprint 11.5 follow-up — Reason + Correlation ID on audit events.
-- Safe if base table already applied without these columns.

BEGIN;

ALTER TABLE public.administration_audit_events
  ADD COLUMN IF NOT EXISTS reason text NULL;

ALTER TABLE public.administration_audit_events
  ADD COLUMN IF NOT EXISTS correlation_id text NULL;

CREATE INDEX IF NOT EXISTS administration_audit_events_correlation_id_idx
  ON public.administration_audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN public.administration_audit_events.reason IS
  'Operator explanation for sensitive administrative actions.';
COMMENT ON COLUMN public.administration_audit_events.correlation_id IS
  'Groups events from the same operation (e.g. historical backfill, incremental sync).';

COMMIT;
