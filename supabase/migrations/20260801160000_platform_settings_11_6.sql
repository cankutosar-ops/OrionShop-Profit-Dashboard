-- Sprint 11.6 — Platform Settings (presentation / preference config only).
-- Does NOT store tax/financial formulas, warehouse engines, or credentials.
-- service_role for Administration APIs; authenticated has no direct access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.platform_settings (id, settings)
VALUES ('default', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS
  'Sprint 11.6 — platform-wide presentation preferences, feature flags, notification toggles, retention config (no cleanup engine).';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_settings FROM anon;
REVOKE ALL ON TABLE public.platform_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_settings TO service_role;

COMMIT;
