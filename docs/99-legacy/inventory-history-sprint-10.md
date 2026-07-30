# Sprint 10 — Inventory History

Inventory History is **Current Inventory for a past date**.

Same stock terminology. Same idea. Only the date changes.

```
Inventory
├── Current Inventory   (/inventory)          → today
└── Inventory History   (/inventory/history)  → selected date
```

## Design principle

- Flat WB stock grain: **one row = Warehouse + SKU + Size** (never merge)
- Columns match the Wildberries inventory export + Current Inventory labels (`Supplier Article`, `Current Stock`, `Warehouse`, `Size`)
- No invented KPIs, charts, or business metrics
- UI chrome matches Current Inventory (filter bar, card table, muted header row)

## Data

- **Reads:** `historical_inventory_snapshots` only
- **Import:** `npm run import:historical-inventory` from `exports/historical-inventory/`
- **Query:** always `marketplace_account_id` + `snapshot_date` only

## Out of scope

Analytics, trends, date compare, movements, aging, forecasting.
