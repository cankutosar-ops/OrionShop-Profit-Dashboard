# Database Security / RLS (Sprint 7.1.D)

---

Status

Active (apply migration before enabling production traffic)

---

## Model

- **App authorization (7.1.C):** unchanged — `authorize` / membership claims
- **DB isolation (7.1.D):** Postgres RLS using JWT `app_metadata.orion.company_ids`
- **Request data plane:** `createServerClient()` uses the user JWT (RLS enforced)
- **Service plane:** `createAdminClient()` / `enterServiceDbContext()` — bypasses RLS (documented exceptions)

## Apply

1. Backup the database
2. Supabase Dashboard → SQL Editor → run (in order):
   - `supabase/migrations/20260729180000_rls_tenant_isolation_7_1_d.sql`
   - `supabase/migrations/20260729183000_rls_marketplace_accounts_no_ciphertext.sql`  
     (follow-up: revoke authenticated SELECT on `marketplace_accounts` base table — column REVOKE is not enough for PostgREST)
3. Or: `npm run apply:rls-7-1-d` (needs `SUPABASE_DB_PASSWORD` or `SUPABASE_ACCESS_TOKEN`)
4. Set `ORION_RLS_DATA_PLANE=1` in `.env.local` (enables JWT data plane)
5. Restart `npm run dev`
6. Validate: `npm run verify:rls-7-1-d`

### Optional tables

`sync_runs`, `finance_sync_reports`, and warehouse audit tables exist only after their feature migrations. The verifier **skips** them when absent (does not fail).

## Policy groups

| Group | Tables | Predicate |
|---|---|---|
| A | `products`, `wb_*` facts, `purchases`, `historical_inventory_snapshots`, … | `marketplace_account_id = ANY (orion_allowed_marketplace_account_ids())` |
| B | `companies`, `marketplace_accounts` | `company_id` / `id` ∈ JWT company_ids |
| C | `product_cost_history`, `purchase_lines`, `wb_ads`, `brands`, `categories` | EXISTS join to tenant products/purchases |
| D | `sync_runs`, `finance_sync_reports`, warehouse sync/audit, verification reports | **service_role only** |

`api_key_encrypted`: SELECT/INSERT/UPDATE revoked for `authenticated`.

## Remaining service_role usage (required)

| Use | Why |
|---|---|
| WB sync / finance sync | Bulk upsert, no user JWT in workers |
| Account lifecycle / backfill | Background `after()` jobs |
| Credential encrypt/decrypt + `has_api_key` | Ciphertext column |
| Tenant membership admin (`grantCompanyToUser`) | Auth Admin API + account expansion |
| Warehouse import / snapshot jobs | Scheduled / internal Bearer |
| Internal API Bearer | CLI / server→self |

## Validation

```bash
npm run verify:rls-7-1-d
npm run verify:authz-7-1-c
npm run verify:auth-7-1-b
npm run test:e2e:smoke
npm run test:e2e:contracts
```
