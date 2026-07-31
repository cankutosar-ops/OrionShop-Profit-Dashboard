-- Sprint 8.2 — Purchases UX: optional invoice number on purchase header

BEGIN;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

COMMENT ON COLUMN public.purchases.invoice_number IS
  'Optional supplier invoice / document number — metadata only, not accounting.';

COMMIT;
