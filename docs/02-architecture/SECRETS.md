# Secrets & Credential Management (Sprint 7.1.E)

Production-grade secret handling. Auth / Authz / RLS are out of scope here.

## Inventory

| Secret | Env var | Runtime | Notes |
|---|---|---|---|
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Public project URL |
| Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | RLS-constrained; not a bypass key |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never `NEXT_PUBLIC_*`; no anon fallback |
| Credential encryption key | `MARKETPLACE_CREDENTIALS_KEY` | Server only | **Required in production**; AES-256-GCM for WB tokens |
| Internal API / containment | `INTERNAL_API_SECRET` | Server / Edge | **Required in production**; Bearer + cookie HMAC |
| WB / marketplace API tokens | DB `api_key_encrypted` | Server decrypt only | Plaintext never persisted; APIs return `has_api_key` |
| E2E user password | `E2E_USER_PASSWORD` | Local / CI only | `.env.e2e.local` (gitignored) |
| DB password / access token | `SUPABASE_DB_PASSWORD` / `SUPABASE_ACCESS_TOKEN` | Migration scripts | Optional; never in browser |

Future marketplace credentials must use the same encrypt-at-rest pattern (`encryptCredential` / `decryptCredential`).

## Rules

1. Load secrets only from environment variables.
2. No hardcoded production secrets; no production fallback defaults.
3. Production must set `MARKETPLACE_CREDENTIALS_KEY` and `INTERNAL_API_SECRET` (do not reuse service_role as the API Bearer).
4. Never log secrets; use `redactSecrets` / `maskCredential` when surfacing errors.
5. API responses must not include `api_key_encrypted`, decrypted keys, service_role, Bearer tokens, or JWT signing material.
6. Only `NEXT_PUBLIC_*` variables may reach the client bundle.

## Rotation readiness

- **MARKETPLACE_CREDENTIALS_KEY:** changing the key invalidates existing ciphertext. Re-encrypt rows (or re-enter keys in Settings) after rotation. Prefer dual-key decrypt later if needed.
- **INTERNAL_API_SECRET:** rotation invalidates containment cookies and CLI Bearers; redeploy with the new value.
- **SUPABASE_SERVICE_ROLE_KEY:** rotate in Supabase Dashboard; update server env; restart.
- **Marketplace API tokens:** update via Settings (encrypts new value); old ciphertext overwritten.

## Validation

```bash
npm run verify:secrets-7-1-e
# Webpack emit + client-bundle secret scan (skips strict typecheck via ORION_SECRETS_BUILD=1)
npm run verify:secrets-7-1-e -- --with-build-scan

# Strict production build (typecheck on). May fail on pre-existing TS debt unrelated to secrets:
npm run build

npm run test:e2e:smoke
```

Production deploy checklist:

1. Set `MARKETPLACE_CREDENTIALS_KEY` (dedicated; `openssl rand -base64 32`)
2. Set `INTERNAL_API_SECRET` (dedicated; do not reuse service_role)
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only
4. Never commit `.env.local` / `.env.production`
