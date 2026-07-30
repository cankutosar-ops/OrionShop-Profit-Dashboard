# Sprint 11.2 — Inventory History Table Experience

## Summary

Same page (`/inventory/history`), same filters. Table behavior is controlled by **Table Settings**.

Default columns:

`Brand | Category | Model | Barcode | Size | Total | To Customer | From Customer | <warehouses…>`

## Grouping

Hiding identity columns regroups by the lowest **visible** hierarchy level:

Brand → Category → Model → Size

- Hide **Size** → one row per model (sizes summed)
- Hide **Model** → one row per category
- Hide **Category** → one row per brand

Warehouse columns always remain individual warehouses. Export matches the on-screen columns, grouping, sort, and filters.

## Size labels

Internal WB `chrtId` values are never shown. Daily snapshot resolves `techSize` from Content cards. History load also remaps any leftover numeric size ids via variants / cards.

## Transit columns

Requires DB columns `in_way_to_client` / `in_way_from_client`.

Paste and run in Supabase SQL Editor:

`supabase/apply-now-historical-inventory-transit.sql`

Then refresh the daily snapshot:

```bash
npm run warehouse:inventory-daily-snapshot -- 1
```

### Source of truth

| Snapshot kind | Source | To / From Customer |
|---|---|---|
| Latest (live Analytics) | Analytics `wb-warehouses` | Columns shown (real `inWay*` values) |
| Historical dates | `STOCK_HISTORY_DAILY` CSV | Columns **hidden** — WB does not publish historical transit |

CSV import / archive gap-fill never writes **today** (daily Analytics snapshot owns that day). Do not strip transit columns on upsert failure — apply the migration instead.
