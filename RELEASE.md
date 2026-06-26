# Release — v0.3.0

| Field | Value |
|-------|-------|
| **Version** | v0.3.0 |
| **Sprint** | Sprint 3 — Company & Marketplace Foundation |
| **Release Date** | 2026-06-26 |
| **Git Branch** | `feature/sprint-3-company-marketplace` |
| **Git Commit** | _(see below — filled at tag time)_ |
| **Git Tag** | `v0.3.0` |

## Summary

Multi-company, multi-marketplace account architecture. One company can own multiple Wildberries, Ozon, and Lamoda accounts. All analytics and sync are scoped by `marketplace_account_id`. API keys encrypted at rest.

## Migration Files

Apply in Supabase SQL Editor **in order**:

1. `supabase/migrations/20260626130000_company_marketplace_foundation.sql`
2. `supabase/migrations/20260626140000_tenant_metadata_and_sync_state.sql`

> Prior sprints: migrations through `20260625120000_product_variants_stock.sql` must already be applied.

## Environment

Add to `.env.local` (optional but recommended):

```env
MARKETPLACE_CREDENTIALS_KEY=<openssl rand -base64 32>
```

Legacy `WB_API_TOKEN` is migrated into the default Wildberries account on first run.

## Known Issues

- Ozon and Lamoda **connection test / sync not implemented** — schema and UI ready; Wildberries sync only
- Migrations must be applied manually via Supabase SQL Editor (service role cannot run DDL from app)
- Inventory module (Sprint 4) not yet built — stock column in Product Analytics remains read-only
- `/settings/stores` redirects to `/settings/companies` for backward compatibility

## Rollback

| Action | Reference |
|--------|-----------|
| **Rollback commit** | `02f0866` — _Fix SKU expansion to show catalog sizes only without duplicating parent rows._ |
| **Rollback migration** | Do not apply `20260626130000` / `20260626140000`. If already applied, restore from DB backup or manually drop `companies`, `marketplace_accounts`, and revert `marketplace_account_id` columns (not automated). |

```bash
git checkout 02f0866
# or
git revert <sprint-3-commit-sha>
```

## Production Ready

**YES** — with migrations applied and `MARKETPLACE_CREDENTIALS_KEY` (or service role fallback) configured.

Validation: see `VALIDATION.md`.
