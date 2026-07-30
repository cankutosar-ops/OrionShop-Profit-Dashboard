# Authorization (Sprint 7.1.C)

---

Status

Active

---

## Model

- **Identity:** Supabase Auth session (Sprint 7.1.B) — never from body/query/headers
- **Membership:** `app_metadata.orion.company_ids` (+ optional `marketplace_account_ids`)
- **Organization:** Company (domain tenant) — no separate organizations table
- **Data plane:** service_role (unchanged); authorization is application-layer
- **RLS / DB policies:** not in this sprint (7.1.D)

## Claim shape

```json
{
  "orion": {
    "company_ids": ["<uuid>", "..."],
    "marketplace_account_ids": ["<uuid>"]
  }
}
```

When `marketplace_account_ids` is omitted, all accounts under `company_ids` are allowed.

## Request flow

1. Authenticate (`requireAuth` / session cookies or internal Bearer).
2. `authorize` / `authorizeRequestScope` expands membership and validates untrusted scope claims.
3. Routes use **only** `authz.companyId` / `authz.marketplaceAccountId` for data access.
4. Failures: `401 AUTH_REQUIRED` | `403 AUTHZ_*` — never silent fallback.

## Key modules

- `src/lib/security/authorize.ts`
- `src/lib/security/tenant-membership.ts`
- Protected `src/app/api/**/route.ts`

## Ops

```bash
node scripts/grant-tenant-access.mjs --email user@example.com
npm run verify:authz-7-1-c
```
