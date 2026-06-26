# Changelog

All notable changes are grouped by sprint. Version numbers follow `v0.{sprint}.0`.

Format for each sprint:

```markdown
## Sprint N — v0.N.0 (YYYY-MM-DD)

### Added
- …

### Changed
- …

### Fixed
- …

### Performance
- …

### Validation
- …

### Migration
- `YYYYMMDDHHMMSS_description.sql`
```

---

## Sprint 3 — v0.3.0 (2026-06-26)

Company & marketplace account architecture. Replaces the abandoned single-store (`stores`) model.

### Added

- `companies` table — name, country, currency, timezone, language, `is_default`
- `marketplace_accounts` table — Wildberries / Ozon / Lamoda, encrypted API keys, sync state
- `marketplace_account_id` on all marketplace-scoped tables (products, wb_orders, wb_sales, wb_finance, wb_stock, product_variants)
- AES-256-GCM credential encryption (`MARKETPLACE_CREDENTIALS_KEY`)
- Settings → Companies UI — add/edit/delete company and account, test connection, sync account
- Header tenant selectors — Company ▼ + Marketplace ▼ (`?company=` + `?account=`)
- API routes — `/api/companies`, `/api/marketplace-accounts`, scoped `/api/sync`
- Account sync metadata — `sync_enabled`, `last_sync_at`, `last_successful_sync_at`, `last_sync_status`

### Changed

- All analytics, dashboard, costs, and sync flows filter by `marketplace_account_id` instead of `store_id`
- Sync accepts `marketplaceAccountId`; loads decrypted key per account
- Default company/account resolution uses `is_default` flags
- `.env.example` — `MARKETPLACE_CREDENTIALS_KEY`; legacy `WB_API_TOKEN` seeds default account

### Fixed

- Multi-tenant foundation ready for multiple WB / Ozon / Lamoda accounts without another schema redesign
- Removed abandoned `stores` / `store_id` model before production rollout

### Performance

- Account-scoped queries via `marketplace_account_id` indexes on all marketplace tables
- Paginated date-range fetches unchanged; scope filter added without extra round-trips
- Sync state tracked in DB (`last_sync_*`) — no in-memory tenant cache required

### Validation

- `npx tsc --noEmit` — PASS
- Batch sync integrity (`scripts/validate-batch-sync-integrity.mjs`) — PASS (2026-05-24 → 2026-06-23)
- Product Analytics calculations unchanged — scope-only refactor verified
- Multi-marketplace foundation — schema + API + UI smoke-tested

### Migration

- `20260626130000_company_marketplace_foundation.sql`
- `20260626140000_tenant_metadata_and_sync_state.sql`

---

## Sprint 2 — v0.2.0 (2026-06-25)

SKU catalog and stock infrastructure for Product Analytics expansion.

### Added

- `product_variants` — catalog sizes and barcodes per product
- `wb_stock` — cached stock quantities from WB Statistics API
- Stock sync in WB sync pipeline
- SKU-level Product Analytics rows (size, barcode, current stock)
- Batch sync integrity validation script

### Changed

- Product Analytics SKU expand shows catalog sizes with stock (read-only)
- Sync persistence — batched upserts for orders and finance

### Fixed

- Duplicate SRID handling in sales sync (API can return duplicate srids)
- Finance upsert scoped by `source_key` + account

### Migration

- `20260625120000_product_variants_stock.sql`

---

## Sprint 1 — v0.1.0 (2026-06-23)

Initial Wildberries profit dashboard and sync foundation.

### Added

- Next.js dashboard — overview KPIs, revenue charts, category profitability
- Product Analytics v3/v8 — operational funnel and unit economics by SKU
- Smart Pricing and Decision Simulator modules
- Supabase schema — products, wb_orders, wb_sales, wb_finance, wb_ads, cost history
- Wildberries sync service — products, orders, sales, finance
- Product profitability audit page
- Costs management UI

### Changed

- Schema aligned to sync service field mapping
- Anon read policies for dashboard queries
- Service role grants for sync writes

### Fixed

- Finance `source_key` uniqueness for idempotent upserts
- Finance SRID linkage for purchase-matched logistics

### Migration

- `20260623170000_align_schema_to_sync_service.sql`
- `20260623170001_grant_service_role_permissions.sql`
- `20260623170002_rollback_notes.sql`
- `20260623170003_dashboard_anon_read_policies.sql`
- `20260623180000_wb_finance_source_key_unique.sql`
- `20260624120000_wb_finance_srid.sql`

---

## Sprint 4 — v0.4.0 (planned)

Inventory module — see `docs/inventory-architecture.md`.

### Added

- _(planned)_ Inventory module at `/analytics/inventory`
- _(planned)_ Recommended stock, days of cover, alerts

### Changed

- _(planned)_ …

### Fixed

- _(planned)_ …

### Migration

- `20260627xxxx_inventory_module.sql` _(TBD)_
