# Historical Inventory Reconstruction — Feasibility Study

**Status:** Research only (no implementation)  
**Date:** 2026-07-26  
**Scope:** Reconstruct / approximate warehouse inventory for **2026-07-17 → first Daily Inventory Snapshot** (business need: incident ~2026-07-18)  
**Evidence basis:** Orion DB live extents, Orion WB client surface, WB Analytics OpenAPI / release notes, prior verification history

---

## Executive verdict

### Final business answer

**Can Orion reconstruct daily warehouse inventory from July 17 until the first real Daily Inventory Snapshot with sufficient confidence for operational reporting?**

# PARTIALLY

| Path | Feasible? | Operational confidence |
|------|-----------|------------------------|
| A. Reverse-engineer from Orion DB events (sales / orders / returns / supplies) | **No** — incomplete event ledger | **Impossible** for exact; ~&lt;70% even as rough estimate |
| B. Retrieve WB-held daily history via Analytics CSV (`STOCK_HISTORY_DAILY_CSV`) | **Yes in principle** (≤3 months retention; Jul 17 is in window) | **High for product/day totals** *if* live pull succeeds; **warehouse×SKU×size TBD** until CSV schema is validated |
| C. Use stale `wb_stock` (last sync **2026-07-09**) ± July deltas | **No** for Jul 17 incident | **Low** — wrong anchor, missing adjustments |

**Justification:** Orion does **not** store historical inventory. Event streams available in-DB are **necessary but not sufficient** to invert stock (no write-offs, transfers, WB-internal adjustments; supplies not persisted; stock API currently dead). However, Wildberries itself retains **daily inventory history for up to 3 months** via Seller Analytics CSV — that is the only path with operational-grade confidence for July 17, and it is **not integrated** into Orion today. Until that API is live-validated for this account (token Analytics category + CSV grain), the honest product answer is **PARTIALLY**, not YES.

---

## 1. Can historical inventory be reconstructed backwards from today’s inventory?

**From Orion’s current database: No.**

Evidence:

| Fact | Source |
|------|--------|
| `wb_stock` is a **point-in-time overwrite cache**, not a time series | Sync upsert on `(product_id, tech_size, barcode, warehouse)`; no snapshot table / migration |
| Latest DB stock stamp | `last_synced_at` max = **2026-07-09T15:48:39Z** (live probe 2026-07-26); count **2093** rows / **69** warehouses |
| Current Statistics stocks API | **Disabled** — `PLUG-404-20260720` on `GET /api/v1/supplier/stocks` (verification `exports/verification-history/1/06cb6cfc-…json`) |
| Replacement current API | `POST /api/analytics/v1/stocks-report/wb-warehouses` — **current only**, ~30 min refresh — **not implemented** in Orion |
| True daily history (WB) | `STOCK_HISTORY_DAILY_CSV` / `STOCK_HISTORY_REPORT_CSV` — last **3 months**, EOD **23:59** — **not implemented** |

Backwards math from “today” also fails because Orion cannot currently refresh “today” via the wired stocks endpoint.

**From Wildberries APIs (not yet in Orion): Yes for retrieval, not for reconstruction.**  
Pull `STOCK_HISTORY_DAILY_CSV` for `2026-07-17` … `today` rather than invert events.

---

## 2. Which Wildberries APIs contain inventory-changing events?

### Implemented in Orion (client exists)

| Event class | API | Persisted? | Inventory effect |
|-------------|-----|------------|------------------|
| Current warehouse stock snapshot | Statistics `GET /api/v1/supplier/stocks` | `wb_stock` (overwrite) | Level, not delta — **API deprecated/404** |
| Orders (create / cancel) | Statistics `GET /api/v1/supplier/orders` | `wb_orders` | Soft reservation / release proxy; **not** warehouse qty ledger |
| Sales / returns | Statistics `GET /api/v1/supplier/sales` | `wb_sales` (`is_return`, `warehouse`, size, barcode) | Buyout ↓ stock; return ↑ (with lag / in-transit) |
| FBW supply acceptance | Supplies `POST /api/v1/supplies`, `GET …/goods`, `GET …/{id}` | **Live only** (30 min memory cache, scan cap **80**) | Inbound ↑ stock |
| Finance lines | Finance detail report | `wb_finance` | Fees / acceptance **money**, not unit stock |

### Documented by WB, **not** in Orion client

| Event / level | API | Notes |
|---------------|-----|--------|
| Current WB warehouse inventory | Analytics `POST /api/analytics/v1/stocks-report/wb-warehouses` | Official replacement for deprecated stocks |
| Current inventory metrics (product / size / office) | Analytics `POST /api/v2/stocks-report/products/*`, `…/offices` | Current-day metrics |
| **Daily historical inventory** | Seller Analytics CSV `STOCK_HISTORY_DAILY_CSV` | ≤3 months; balances as of 23:59 (release notes) |
| Inventory metrics CSV | `STOCK_HISTORY_REPORT_CSV` | Same family; no Jam required for inventory CSVs |
| Supplier incomes (inbound history) | Statistics `GET /api/v1/supplier/incomes` | Probed in `scripts/probe-wb-incomes-6-44.mjs`; **not synced** |

### Partially signalled in API payloads but incomplete for stock ledger

| Signal | Where | Gap |
|--------|-------|-----|
| `incomeID` on sales | `WbApiSale` | **Not stored** in `wb_sales` |
| `cancel_dt` on orders | `WbApiOrder` | **Not stored**; only `status` cancelled/active |
| `inWayToClient` / `inWayFromClient` | Stock rows | Current snapshot only; no history |
| Finance `acceptance` | `wb_finance` | Monetary acceptance fee, **not** units received |

---

## 3. Which inventory-changing events are NOT available (or not usable) via APIs / Orion?

| Event | Via WB API? | In Orion DB? | Usable for reconstruction? |
|-------|-------------|--------------|----------------------------|
| Warehouse internal transfers (WB redistribution) | No seller-facing unit ledger found in Orion integrations | No | **No** |
| Manual inventory corrections / recounts | No | No | **No** |
| Write-offs / disposals / damaged / fire / theft | No dedicated API in codebase; not in sync | No | **No** |
| Blocked / quarantine stock (distinct from sellable) | Not modelled beyond `quantity` vs `quantity_full` on current snapshot | Current only | **No** historically |
| Seller warehouse (FBS) vs WB warehouse split | Analytics stocks-report distinguishes `wb` / `mp` | Orion stock path is FBW-oriented Statistics stocks | Partial at best |
| Full FBW supply history | Supplies API yes | **Not persisted**; UI scan capped at 80 supplies | Incomplete for back-calc |
| Ads / promotions affecting stock | N/A | N/A | N/A |
| Marketplace `/api/v3/stocks` (seller-managed FBS stocks) | Not implemented | No | Out of scope for FBW unless used |

**Conclusion:** Unobservable adjustments make **closed-form exact reverse reconstruction impossible**.

---

## 4. Can warehouse-level inventory be reconstructed exactly?

**Exact (100%): No.**

| Accuracy class | Estimate | Why |
|----------------|----------|-----|
| Exact reverse from Orion events | **Impossible** | Missing write-offs, transfers, WB adjustments; no durable supply ledger; orders ≠ stock movements; returns lag vs `inWayFromClient` |
| Heuristic reverse (sales − returns + supplies) | **~60–80%** directional, not operational | July sales have warehouse 100% filled in DB (`salesWithWh=489`, `salesNoWh=0` for Jul 1–26), but supplies incomplete and adjustments unknown — **incident window is exactly when unknown adjustments matter** |
| WB `STOCK_HISTORY_DAILY_CSV` retrieval | **~95–100% of what WB publishes** | Same source of truth as Seller Analytics inventory history; not “reconstruction” — **retrieval**. Grain (warehouse vs nm aggregate) must be validated live |
| Stale Jul 9 snapshot alone | **Useless for Jul 17** | 8 days of unknown motion + incident |

---

## 5. Can SKU + Size + Warehouse inventory be reconstructed?

| Dimension | In current `wb_stock` | In `wb_sales` / `wb_orders` | In Supplies goods | In STOCK_HISTORY_DAILY_CSV |
|-----------|----------------------|-----------------------------|-------------------|----------------------------|
| SKU / nm | Via `product_id` → `nm_id` | `nm_id` | `nmID` | Expected (nm-centric reports) |
| Size | `tech_size` | `tech_size` | `techSize` | Likely via size / chrt — **confirm in CSV** |
| Barcode | `barcode` | `barcode` | `barcode` | TBD |
| Warehouse | `warehouse` name | `warehouse` name (July sales: full) | `actualWarehouseName` / planned | **Uncertain** — daily history may be nm/day without office; warehouse detail may need different report / current offices API only |

**Limitations:**

1. Warehouse **name** strings are not stable IDs (Analytics replacement exposes `warehouseId`).
2. Silent stock sync skips (no `nmId` / no product match) under-count current cache.
3. Supply scan limit (80) can miss SKUs for history build.
4. Orders quantity hardcoded to **1** per row — OK for unit SRID model, but cancels without `cancel_dt` blur reservation timing.
5. Incident-day anomalies (blocked stock, mass redistribution) will not appear as sales/returns.

---

## 6. Algorithm (if attempting reconstruction)

### Path A — Event reverse (not recommended for operations)

```
Anchor = wb_stock as of T0   # only available T0 ≈ 2026-07-09 (stale) OR live Analytics stocks-report (today)
For each day D from today → target:
  qty[D-1] = qty[D]
             + sales[D]          # reverse outflow
             − returns[D]        # reverse inflow (timing fragile)
             − supplies_accepted[D]  # reverse inbound (need full supply pull)
             ± orders_net[D]     # optional reservation model — do NOT mix with sales without rules
             ± UNKNOWN           # transfers, write-offs, corrections → residual error
```

**Do not ship this as “inventory truth” for the July 18 incident.**

### Path B — Recommended: WB daily history retrieval (approximation strategy that is actually accurate)

```
For each date D in [2026-07-17 … first_orion_daily_snapshot]:
  Create STOCK_HISTORY_DAILY_CSV (nm-report downloads)
  Poll until SUCCESS (report kept 48h)
  Download CSV → normalize → warehouse_inventory_snapshot(D)
Validate sample D against:
  - Seller Portal inventory history UI (same day)
  - Optional: Analytics current stocks-report for D=today
Persist into Historical Data Warehouse tables
```

### Path C — Hybrid audit (research / QA only)

```
Compare Path B (WB history) vs Path A (events) per nm/day
residual = WB_history − event_model
Treat residual as “unexplained WB adjustments” during incident window
```

---

## 7. Required assumptions (for any reverse model)

1. Every sellable unit change appears as sale, return, or accepted supply.  
2. No WB-internal warehouse transfers (or they net to zero per SKU globally — **false for warehouse-level**).  
3. No write-offs / damage / loss / recounts in the window.  
4. Return date ≈ stock-return date (ignores in-transit lag).  
5. Order cancel restores stock the same day as cancel (we lack `cancel_dt`).  
6. Supply `acceptedQuantity` equals units that entered sellable stock at `factDate`.  
7. Warehouse name strings match across Orders / Sales / Stock / Supplies.  
8. `wb_stock` silent skips are negligible.  
9. One Statistics sale row = one unit (Orion quantity=1).  
10. Anchor snapshot is complete and contemporaneous with the first reverse step.

**Assumption 1–3 fail under a warehouse incident → reverse model breaks when it is most needed.**

---

## 8. Situations that make reconstruction impossible

- Warehouse internal transfers / redistribution  
- Manual inventory corrections  
- Fire / flood / theft / write-offs / damaged goods  
- Blocked / quarantine stock not mirrored in sales  
- Missing or capped supply history  
- Stock API outage leaving no reliable anchor (`PLUG-404` since ~2026-07-20; last good Orion stamp 2026-07-09)  
- FBS/seller-warehouse stock mixed into FBW without `wb`/`mp` split  
- Any day outside WB’s **3-month** history CSV retention (not an issue for Jul 17 as of Jul 26; **will become an issue if delayed**)

---

## 9. Can the system generate one historical snapshot per day from July 17 → today?

| Approach | Can generate daily series? | Confidence per day |
|----------|----------------------------|--------------------|
| Orion DB reverse | Mechanically yes, semantically no | **Low** (~&lt;70%), **lowest** around Jul 18 incident |
| `STOCK_HISTORY_DAILY_CSV` | Yes (WB retention ≤3 months) | **High** for published balances (~95–100% of WB source); grain TBD |
| Current Analytics stocks-report only | **Only today** (rolling) | N/A historically |
| Existing `wb_stock` | **Single stale frame** (~Jul 9), not a series | **None** for Jul 17+ |

**Urgency:** July 17 is inside the 3-month window **today**. Delaying CSV pull risks losing the pre-incident day permanently from WB’s retention.

---

## 10. Best approximation strategy (when exact reverse cannot be guaranteed)

1. **Immediate (ops):** Manually or via a one-off tool, pull `STOCK_HISTORY_DAILY_CSV` for **2026-07-17 … today**; archive raw CSV + parsed rows. Do **not** wait for Daily Snapshot Engine.  
2. **Validate grain:** Confirm whether CSV is nm×day, nm×size×day, and/or office/warehouse. If warehouse missing, use CSV for SKU totals and treat warehouse split as **estimate** from sales share / last known `wb_stock` mix (label as low confidence).  
3. **Do not** present event-reverse as operational inventory for the incident.  
4. **Architecture going forward:** Daily Snapshot Engine must persist Orion-owned snapshots from Analytics `stocks-report/wb-warehouses` (and/or nightly history CSV) so this gap never recurs.  
5. **Optional residual study:** After CSV import, compute unexplained delta vs sales/returns/supplies to quantify incident-window adjustments.

---

## Available data sources (Orion today)

| Source | Role | Coverage (live 2026-07-26) |
|--------|------|----------------------------|
| `wb_stock` | Current cache only | 2093 rows; synced **2026-06-26 → 2026-07-09**; 69 warehouses |
| `wb_sales` | Sales + returns + warehouse | 4902 rows; **2026-01-18 → 2026-07-26**; Jul window 489 sales, 60 returns, warehouse populated |
| `wb_orders` | Demand / cancel proxy | 4806 rows; **2026-04-11 → 2026-07-26**; Jul 975 orders, 459 cancelled |
| `wb_finance` | Settlement / fees | Present; not a unit inventory ledger |
| Supplies API (live) | Inbound events | Proven for sample product (e.g. ALEXAMOR supplies including **2026-07-14**); **not in DB** |
| Sync verification history | Health, not qty | Documents stock 404 + inventory critical |

## Missing data sources

| Missing | Impact |
|---------|--------|
| Historical `warehouse_inventory_snapshot` table | No first-party time series |
| Integration of Analytics stocks-report + STOCK_HISTORY_* CSV | Cannot refresh current or pull Jul 17 history in-product |
| Persisted FBW supplies / incomes | Incomplete inbound reverse |
| Write-off / transfer / adjustment APIs | Exact reverse impossible |
| `incomeID`, `cancel_dt` persistence | Weaker event linking |

---

## Confidence analysis (summary)

```
Exact reverse reconstruction ................ Impossible
Operational Jul 17 via Orion DB only ....... Insufficient
Operational Jul 17 via WB history CSV ...... High (pending live schema/token validation)
SKU+Size+Warehouse via CSV ................. Unknown until CSV inspected → treat as PARTIAL
Forward Daily Snapshot Engine .............. Required for future certainty
```

---

## Risks

1. **Retention cliff:** waiting past ~3 months loses Jul 17 on WB side.  
2. **Token scope:** Analytics category required; inventory CSV may work without Jam, but token must allow nm-report downloads.  
3. **False confidence** if UI shows reverse-engineered numbers for an incident investigation.  
4. **Warehouse naming drift** across APIs.  
5. Continuing to call deprecated Statistics stocks wastes sync health and blocks freshness SLAs.

---

## Limitations

- Research did **not** execute a live `STOCK_HISTORY_DAILY_CSV` download for this account (out of scope / no production code); feasibility of Path B is based on **official WB documentation**, not a parsed Orion CSV sample.  
- Warehouse grain of daily history CSV remains **unproven** until first download.  
- Incomes Statistics endpoint status was not re-probed in this study (script exists).

---

## Recommended architecture (for Historical Data Warehouse)

```
┌─────────────────────────────────────────────────────────────┐
│  Daily Inventory Snapshot Engine (forward)                  │
│  POST /api/analytics/v1/stocks-report/wb-warehouses         │
│  → warehouse_inventory_snapshot (account, date, nm, size,   │
│     warehouse_id, qty, in_way_*, captured_at)               │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────┴───────────────────────────────┐
│  One-time backfill (Jul 17 → engine go-live)                │
│  STOCK_HISTORY_DAILY_CSV → same snapshot table              │
│  Tag source = 'wb_stock_history_csv'                        │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────┴───────────────────────────────┐
│  Event stores (audit / intelligence — not snapshot truth)   │
│  Persist supplies; store incomeID; optional residual report │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** Snapshot tables are **source of truth** for “inventory as of date.” Event tables explain movement; they do not replace snapshots when WB adjustments exist.

---

## Answers checklist (research questions)

1. Backwards from today via Orion? **No.** Via WB history CSV? **Retrieve, don’t reconstruct.**  
2. Inventory-changing APIs: orders, sales/returns, supplies, current stocks (deprecated), Analytics stocks-report, STOCK_HISTORY_* CSV; incomes probed not synced.  
3. Missing: transfers, write-offs, manual corrections, losses, blocked-stock history, persisted supplies.  
4. Exact warehouse reconstruction? **No.** Theoretical: Impossible exact; CSV retrieval ~95–100% of WB publish; event reverse ~60–80% at best.  
5. SKU+Size+Warehouse? Sales/stock support dimensions; history CSV warehouse grain **TBD**; reverse warehouse exactness **no**.  
6. Algorithms: Path A reverse (unsafe); Path B CSV (recommended); Path C residual audit.  
7. Assumptions: closed event set — fails under incident.  
8. Impossible cases: transfers, corrections, losses, unknown adjustments, API/anchor gaps.  
9. Daily series Jul 17→today? **Yes via CSV**; confidence high for WB published figures; **low** via reverse.  
10. Best approximation: **pull and archive STOCK_HISTORY_DAILY_CSV immediately**, then Daily Snapshot Engine forward.

---

## Business verdict (repeat)

# PARTIALLY

Orion **cannot** truthfully reconstruct July 17 warehouse inventory from data already in Supabase. Orion **can** approach operational confidence for that date **only** by importing Wildberries’ own ≤3-month daily inventory history (`STOCK_HISTORY_DAILY_CSV`) before retention expires, then relying on a forward Daily Snapshot Engine thereafter. Event-based reverse engineering is unsuitable for incident analysis.
