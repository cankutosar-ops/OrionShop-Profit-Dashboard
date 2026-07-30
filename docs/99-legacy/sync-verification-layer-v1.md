# Sync Verification Layer V1 (Sprint 9.1)

Read-only post-sync freshness check. **Does not change sync behavior.**

## Principle

After an existing sync finishes (or on demand), answer one question:

> Is the database up to date?

Verification only **reads**. It never writes business data, never retries, never repairs, never backfills, and never alters sync status.

## Architecture

```
Existing Sync Flow (unchanged)
        ↓
  dashboard-sync-complete event (client)
        ↓
GET /api/sync/verification?marketplaceAccountId=…
        ↓
sync-verification-service (DB extents only)
        ↓
SyncVerificationPanel (expandable header control)
```

No hooks into `executeDashboardSync`, `WbSyncService`, scheduling, or status transitions.

## Sources

| Source | Table | Date column | Lag warn (days) |
|--------|-------|-------------|-----------------|
| Orders | `wb_orders` | `order_date` | 2 |
| Sales | `wb_sales` | `sale_date` | 2 |
| Finance | `wb_finance` | `operation_date` | 7 |
| Inventory | `wb_stock` | `last_synced_at` | 2 |

Finance allows more lag because Wildberries settlement rows arrive later than operational orders/sales.

## Collected fields (per source)

- Earliest date in DB
- Latest date in DB
- Record count
- Account last sync timestamp (`marketplace_accounts.last_sync_at`)

## Status rules

- **empty** — zero rows → Warning
- **warning** — latest date more than lag threshold behind calendar `expectedAsOf` (today UTC date)
- **healthy** — otherwise

**Overall** = Warning if any source is not healthy; else Healthy.

## UI

Small expandable **Verification** control next to **Sync Wildberries** in the page header (there is no dedicated Sync page).

- Severity / overall badge when collapsed
- Per-source DB range, record count, Healthy / Warning text when expanded
- Refresh button (manual re-read)
- Auto-refresh on `dashboard-sync-complete` (after existing sync finishes)

No new navigation. No dashboard redesign. No AI wording.

## Explicit non-goals

- Do not modify Financial Engine, Dashboard metrics, Reporting, BI, Marketplace Intelligence
- Do not modify existing sync flow, scheduling, APIs, schema, or sync status logic
- Do not auto re-sync / repair / backfill / retry

## Files

- `src/lib/sync-verification/*` — types, thresholds, summary formatter
- `src/services/sync-verification-service.ts` — read-only extents
- `src/app/api/sync/verification/route.ts` — GET only
- `src/components/dashboard/sync-verification-panel.tsx` — expandable UI
- `src/components/layout/page-header.tsx` — mounts panel beside SyncButton
