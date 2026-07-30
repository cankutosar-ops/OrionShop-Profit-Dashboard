# Sprint 11 — Historical Data Warehouse Foundation

## Principle

```
Marketplace APIs
        ↓
Historical Data Warehouse   ← single source of truth
        ↓
Dashboard / Reports / Analytics
```

Reporting modules **must not** call marketplace APIs at read time.  
Inventory History already reads `historical_inventory_snapshots` only.

## Account lifecycle (unchanged stage names)

```
NEW_ACCOUNT
  → HISTORICAL_BACKFILL_RUNNING
  → HISTORICAL_BACKFILL_VERIFYING
  → HISTORICAL_BACKFILL_COMPLETE
  → INCREMENTAL_SYNC_ACTIVE
  → HEALTHY
```

**HEALTHY** is earned only after verification (`account-lifecycle-service`).  
Finance historical backfill remains the lifecycle driver today.

## Entity matrix (new)

Table: `warehouse_entity_sync_state`

| Entity | Warehouse tables | Historical backfill | Incremental |
|--------|------------------|---------------------|-------------|
| inventory | `historical_inventory_snapshots` | ✅ archive CSV import | ✅ daily Analytics snapshot (Sprint 11.1) |
| orders | `wb_orders` | ⏳ windowed | ✅ syncOrders |
| sales | `wb_sales` | ⏳ windowed | ✅ syncSales |
| finance | `wb_finance` | ✅ lifecycle | ✅ Finance Sync V2 |
| stocks | `wb_stock` | n/a (PIT) | ✅ syncStock |

Entity stages: `pending` → `historical_backfill_running` → `verifying` → `complete` → `incremental_sync_active` → `healthy` | `failed`

## Import audit (new)

Table: `warehouse_import_audit`

Every historical import records: duration, records read, inserted/updated/skipped, validation, errors. Idempotent re-runs produce new audit rows; data upserts never duplicate grains.

## Apply migration

```bash
# Supabase SQL Editor if CLI credentials missing:
# supabase/migrations/20260726150000_historical_data_warehouse_foundation.sql

npm run apply:historical-data-warehouse-foundation-migration
```

Also ensure Sprint 10 inventory snapshots table exists:

```bash
# supabase/migrations/20260726140000_historical_inventory_snapshots.sql
npm run apply:historical-inventory-snapshots-migration
```

## Run inventory warehouse backfill

```bash
npm run warehouse:backfill-inventory -- 1
npm run warehouse:backfill-inventory -- 2
```

Or API:

```http
POST /api/warehouse/foundation
{ "marketplaceAccountId": "1", "entity": "inventory", "action": "backfill" }

GET /api/warehouse/foundation?marketplaceAccountId=1
```

## Code map

| Piece | Path |
|-------|------|
| Domain registry | `src/lib/historical-warehouse/types.ts` |
| Entity state | `src/services/warehouse-entity-sync-state-service.ts` |
| Import audit | `src/services/warehouse-import-audit-service.ts` |
| Orchestrator | `src/services/historical-warehouse-orchestrator.ts` |
| Daily inventory snapshot | `src/services/inventory-daily-snapshot-service.ts` |
| API | `src/app/api/warehouse/foundation/route.ts` |
| Daily snapshot API | `src/app/api/warehouse/inventory-daily-snapshot/route.ts` |

## Out of scope (this sprint)

New dashboards, KPIs, charts, analytics, reports.  
Orders/Sales windowed warehouse backfill runners (registered, not implemented).  

Daily inventory snapshot: see `docs/inventory-daily-snapshot-sprint-11-1.md`.
