# Inventory Module — Architecture (planned)

Status: **design only** — not implemented. Product Analytics keeps a read-only **Current Stock** column on SKU rows until this module ships.

## Goals

- Dedicated **stock management** screen at `/analytics/inventory` (route TBD)
- Full inventory intelligence (recommended stock, days of cover, alerts) lives here — **not** in Product Analytics
- Product Analytics expanded SKU rows: **Current Stock only** (no recommendations, no stock value)

## Current state

| Layer | Today |
|-------|--------|
| **Product Analytics SKU expand** | Size, Barcode, Current Stock, Orders, Purchases |
| **`wb_stock`** | Migration exists; may be unapplied in some environments |
| **`product_variants`** | Catalog sizes/barcodes; same migration |
| **`stock-service.ts`** | Fetch WB Statistics API → cache in `wb_stock` → match by `tech_size` |
| **`inventory-intelligence.ts`** | Pure functions (recommended stock, days of stock, labels) — **unused in PA UI** |
| **Verify script** | `scripts/verify-inventory-intelligence.mjs` — dev validation only |

## Data model

```
products (id, nm_id, supplier_article)
    │
    ├── product_variants (product_id, tech_size, barcode)   ← catalog sizes
    │
    └── wb_stock (product_id, tech_size, barcode, quantity, synced_at)   ← cache
            ▲
            │ syncStockForProduct() ← WB GET /api/v1/supplier/stocks (filter nm_id)
```

**Join rule (Product Analytics):** variant `tech_size` → sum `wb_stock.quantity` where `tech_size` matches (barcode not used for display total).

## Planned module structure

```
src/
  app/analytics/inventory/
    page.tsx                    # Server page — date range + product filters
  components/inventory/
    inventory-table.tsx         # SKU × size grid
    inventory-summary.tsx       # Portfolio KPIs
    inventory-filters.tsx
  services/
    inventory-service.ts        # Orchestration (NEW)
    stock-service.ts            # WB fetch + wb_stock cache (EXISTING, shared)
  lib/
    inventory-intelligence.ts   # Metrics + recommendations (EXISTING, move consumer here)
    inventory-types.ts          # Shared DTOs (NEW)
  hooks/
    use-inventory-report.ts     # React Query (NEW)
  app/api/analytics/inventory/
    route.ts                    # Optional JSON API for client refresh
```

## Service boundaries

### `stock-service` (shared)

- **Owns:** WB stock API, `wb_stock` read/write, TTL cache
- **Used by:** Product Analytics SKU expand (read-only quantity), Inventory module (full context)

### `inventory-service` (new)

- **Owns:** Combining stock + 30d purchases + unit cost → `inventory-intelligence` metrics
- **Does not:** Duplicate funnel or profitability logic from Product Analytics
- **Inputs:** `product_id`, optional date range, `targetDaysOfStock` (default 60)

### Product Analytics (unchanged scope)

- Calls `getProductSkuAnalytics` → `syncStockForProduct` → `currentStock` per size only
- No import of `inventory-intelligence` in PA components

## UI split

| Feature | Product Analytics | Inventory (future) |
|---------|-------------------|-------------------|
| Current Stock per size | Yes | Yes |
| Recommended stock | No | Yes |
| Days of stock | No | Yes |
| Produce / Stop / Overstock labels | No | Yes |
| Stock value | No | Yes |
| Portfolio stock summary | No | Yes |
| Sync / refresh stock | No (on expand) | Yes (explicit action) |

## Sync & migration prerequisites

1. Apply `supabase/migrations/20260625120000_product_variants_stock.sql`
2. Run **Sync Wildberries** (products → variants persisted)
3. Stock populates on expand or via future Inventory “Refresh stock”
4. Optional: add `stock` entity to `WbSyncService.syncAll()` for batch refresh

## Implementation phases (when approved)

1. **Phase A — Data:** Migration applied; `stock-service` stable with DB + API fallback
2. **Phase B — Inventory service + API:** `inventory-service`, types, route
3. **Phase C — UI:** `/analytics/inventory` page, sidebar link
4. **Phase D — Batch sync:** Stock in main sync; alerts/export if needed

## Non-goals (this roadmap)

- Moving Product Analytics columns or profitability into Inventory
- Changing parent-row calculations
- Adding inventory metrics back into Product Analytics SKU expand
