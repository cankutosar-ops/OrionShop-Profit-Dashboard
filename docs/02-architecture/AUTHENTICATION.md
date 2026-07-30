# Authentication (Sprint 7.1.B)

---

Status

Active

---

## Model

- **Identity:** Supabase Auth (email/password)
- **Session:** HttpOnly cookies via `@supabase/ssr` (server login + middleware refresh)
- **Data plane:** unchanged — service_role clients (`createServerClient` / `createAdminClient`)
- **Containment (7.1.A):** still required on protected `/api/*` (cookie or internal Bearer)
- **Authorization / tenancy:** Sprint 7.1.C — see `docs/02-architecture/AUTHORIZATION.md`

## Request flow

1. Middleware refreshes/validates session with `auth.getUser()` (rejects expired/tampered JWTs).
2. Public paths: `/login`, `/auth/*`, `/api/auth/login`.
3. Document navigations without user → redirect `/login?next=…`.
4. Protected `/api/*` without user (and without internal Bearer) → `401 AUTH_REQUIRED`.
5. Route handlers call `requireAuth(request)` — never trust body/headers for identity.

## Key modules

- `src/middleware.ts`
- `src/lib/security/require-auth.ts`
- `src/lib/security/auth-paths.ts`
- `src/lib/supabase/auth-server.ts` / `auth-browser.ts`
- `src/app/api/auth/login/route.ts`, `session/route.ts`
- `src/app/auth/logout/route.ts`, `auth/callback/route.ts`

## Validation

- `npm run verify:auth-7-1-b`
- Playwright smoke (`e2e/smoke`, includes TC-S09 auth security)
