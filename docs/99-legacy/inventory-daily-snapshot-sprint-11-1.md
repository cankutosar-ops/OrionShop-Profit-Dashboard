# Sprint 11.1 — Inventory Daily Snapshot Sync

## Objective

Historical inventory grows automatically every day without manual CSV imports.

```
Marketplace Inventory API (Analytics wb-warehouses)
        ↓
Daily Inventory Snapshot (idempotent upsert)
        ↓
historical_inventory_snapshots
        ↓
Inventory History UI (unchanged — date selector from DB dates)
```

## Snapshot grain

One row per **Warehouse + SKU (nm_id) + Size + seller_article + barcode** per account per `snapshot_date`.

Never aggregate. Re-runs update existing rows (unique constraint upsert).

## Source API

Deprecated Statistics `GET /api/v1/supplier/stocks` returns PLUG-404.

Daily capture uses:

`POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses`

Brand / subject / seller article / barcode are enriched from Orion `products` (+ variant barcode fallback).

**Size:** Analytics returns `chrtId` (size id), not SizeName. Daily rows store `size = String(chrtId)` so sizes stay unique. Historical CSV imports keep SizeName strings.

## Triggers

1. After successful dashboard sync (background fire-and-forget) — per account  
2. Manual / cron:
   - `npm run warehouse:inventory-daily-snapshot`
   - `npm run warehouse:inventory-daily-snapshot -- 1`
   - `POST /api/warehouse/inventory-daily-snapshot` `{ "marketplaceAccountId": "1" }`
   - `POST /api/warehouse/inventory-daily-snapshot` `{ "allAccounts": true }`

## Gap detection

After each capture, missing dates between oldest snapshot and today are listed in warehouse entity progress / audit meta.

- **Today:** filled from live Analytics API  
- **Past:** filled from local `exports/historical-inventory/account-{id}` archives when present  
- Live API cannot reconstruct past days; unfilled gaps are recorded and do not block future daily sync

## Warehouse integration

Updates:

- `warehouse_entity_sync_state` (inventory → `incremental_sync_active` / `healthy`)
- `warehouse_import_audit` (started/finished, duration, rows, validation, errors)

## Validation checklist

- [ ] One snapshot date per account per day (selector lists new date after sync)
- [ ] Re-run same day → no duplicate grains
- [ ] Warehouse names preserved from API
- [ ] Size values present (chrtId for daily API rows)
- [ ] Quantities match marketplace warehouse report
- [ ] Inventory History still reads only `historical_inventory_snapshots`

## Out of scope

Inventory analytics, stock movement, trends, comparisons, Inventory Intelligence.
