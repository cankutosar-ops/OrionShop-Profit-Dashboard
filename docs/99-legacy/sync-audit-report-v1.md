# Synchronization Audit & Verification Report

**Sprint:** 9.1 — Stabilization (read-only)  
**Date:** 2026-07-24  
**Scope:** Wildberries marketplace sync pipeline for OrionShop Profit Dashboard  
**Constraint:** Knowledge and verification only — no sync behavior, business logic, or UI changes in this sprint.

---

## Executive answer

**Can we prove that our database is complete and up to date?**

**Partially — not yet rigorously.**

| What we can prove today | What we cannot prove today |
|-------------------------|----------------------------|
| Sync pipeline architecture is deterministic and documented | Every calendar day of Orders/Sales exists in DB vs WB API |
| Per-table min/max dates and row counts (read-only verification) | Completeness of historical ranges outside the last sync window |
| Finance Sync V2 audits lookback windows via `sync_runs` | That `last_successful_sync_at` means data is fresh (it means the job finished) |
| Ads are **not** synced | Zero silent row drops (stock without product, finance zero-lines, etc.) |

**Live account snapshot (2026-07-24, account `1`):**

| Source | Earliest | Latest | Records | Days behind expected | Status |
|--------|----------|--------|---------|----------------------|--------|
| Orders | 2026-04-11 | 2026-07-12 | 2 974 | 12 | **Warning** |
| Sales | 2026-01-18 | 2026-07-22 | 1 563 | 2 | Healthy |
| Finance | 2026-01-01 | 2026-07-19 | 66 669 | 5 | Healthy |
| Inventory | 2026-06-26 | 2026-07-09 | 1 077 | 15 | **Warning** |

- **Last successful sync timestamp:** 2026-07-23T09:01:55Z  
- **Overall verification:** **Warning**  
- Conclusion: Sales/Finance look recent enough under current thresholds; **Orders and Inventory lag** relative to calendar “today,” so the DB is **not** fully up to date for all sources.

Freshness thresholds used by the verification layer (observation only): Orders/Sales/Inventory ≤ 2 days; Finance ≤ 7 days (`src/lib/sync-verification/thresholds.ts`).

---

## 1. Current architecture

### 1.1 High-level flow

```
Entry (manual Sync / auto-sync / recover / backfill / lifecycle)
  → sync-job-service (background or blocking)
    → executeDashboardSync
      → WbSyncService.syncAll (products, orders, sales, stock)
      → runFinanceSyncV2 → WbSyncService.syncFinance (lookback window)
    → markAccountSyncFinished (+ optional sync_runs for finance)
  → Client: dashboard-sync-complete
  → Optional read-only: GET /api/sync/verification
```

**Direction:** API → Database only. No write-back to Wildberries.

### 1.2 Entry points

| Entry | Path | Notes |
|-------|------|-------|
| Manual dashboard sync | `POST /api/sync` + Sync button | Default background; entities typically products/orders/sales/finance/stock |
| Operational auto-sync | `dashboard-operational-sync.tsx` | Once per session; entities **orders, sales, finance only** (no products/stock) |
| Finance recover | `POST /api/sync/finance-recover` | Finance V2 lookback only |
| Finance history backfill | `POST /api/sync/finance-backfill` | Explicit windows |
| Account lifecycle | `POST /api/sync/account-lifecycle` | Historical finance windows until HEALTHY |
| Status | `GET /api/sync/status` | In-memory job + account + finance health |
| Verification (read-only) | `GET /api/sync/verification` | DB extents only; never writes / never retries |

### 1.3 Per-source pipeline

#### Products

| Field | Detail |
|-------|--------|
| API | Content API `POST /content/v2/get/cards/list` |
| Tables | `products`, `brands`, `categories`, `product_variants` |
| Direction | API → DB |
| Incremental | **Full catalog** each sync (cursor pagination, not date-based) |
| Date field | N/A for filter; DB `created_at` |
| Pagination | Cursor `limit=100` via `nmID` + `updatedAt` |
| Last success | Account-level `last_sync_*` after dashboard job |
| Upsert keys | Product: `(marketplace_account_id, supplier_article)`; variants: `(product_id, tech_size, barcode)` |

#### Orders

| Field | Detail |
|-------|--------|
| API | Statistics `GET /api/v1/supplier/orders` |
| Table | `wb_orders` |
| Direction | API → DB |
| Incremental | Statistics cursor from UI **`dateFrom` T00:00:00** (not from `last_successful_sync_at`) |
| Date fields | Filter: `order_date` **or** `last_change_date` in range; stored: `order_date`, `last_change_date` |
| Pagination | `flag=0`, advance `dateFrom` = last row `lastChangeDate`; stop when batch empty or &lt; 80 000 |
| Upsert | `(marketplace_account_id, srid)` batches of 200 |

#### Sales

| Field | Detail |
|-------|--------|
| API | Statistics `GET /api/v1/supplier/sales` |
| Table | `wb_sales` |
| Direction | API → DB |
| Incremental | Same cursor pattern from UI **`dateFrom`** |
| Date fields | Filter: **`sale_date` only** in range; stored: `sale_date`, `return_date` |
| Pagination | Same 80k / `lastChangeDate` statistics pattern |
| Upsert | `(marketplace_account_id, srid)`; payload deduped last-wins by `sale_date` |

#### Finance

| Field | Detail |
|-------|--------|
| API | Detail: Statistics `GET /api/v5/supplier/reportDetailByPeriod`; optional discovery: Finance `POST /api/finance/v1/sales-reports/list` |
| Table | `wb_finance` (+ audit `sync_runs`, `finance_sync_reports`) |
| Direction | API → DB |
| Incremental (dashboard) | **Finance Sync V2 lookback** (default 14 days ending today) — **ignores UI from/to** |
| Historical | Lifecycle / backfill windows via explicit `dateFrom`–`dateTo` |
| Date field | `operation_date` (from `rr_dt` → `sale_dt` → fallback) |
| Pagination | `limit=100000`, `rrdid` cursor; **5s** delay between pages |
| Upsert | `source_key` = `rrd:{rrd_id}:{suffix}` |
| Last success | `finishSyncRun` updates `finance_latest_operation_date`, `finance_gap_days`, `finance_recovery_needed`, etc. |
| Gate | Incremental finance only if lifecycle allows (`HEALTHY` / `INCREMENTAL_SYNC_ACTIVE` / `RECOVERING` / legacy null) |

#### Inventory (stock)

| Field | Detail |
|-------|--------|
| API | Statistics `GET /api/v1/supplier/stocks` (default `dateFrom=2019-01-01`) |
| Table | `wb_stock` |
| Direction | API → DB |
| Incremental | **Full snapshot** each stock sync (not scoped to UI date range) |
| Date field | `last_synced_at` (sync timestamp stamped on rows) |
| Pagination | Same statistics pattern |
| Upsert | `(product_id, tech_size, barcode, warehouse)` |
| Silent skips | Missing `nmId`; no matching `product_id` → no row |

#### Not in sync pipeline

| Source | Status |
|--------|--------|
| Ads (`wb_ads`) | Table exists; **no WB ads sync implemented** |
| FBW supplies / shipments | Live API reads for inventory intelligence — **not persisted as sync** |
| Product costs | User-managed — not WB sync |

### 1.4 Last successful sync logic

1. Job starts → `markAccountSyncStarted` (`running`, lock ~10 min).  
2. Entities run; per-entity `errors[]` collected.  
3. `resolveSyncStatus`: any entity errors → **`partial`**; finance `failed` → **`failed`**; finance warning/partial propagates.  
4. `markAccountSyncFinished`:
   - Always sets `last_sync_at`, `last_sync_status`
   - Sets **`last_successful_sync_at = now`** for statuses **`success` | `partial` | `warning`**
5. Implication: a **partial** sync still advances “last successful sync” even if some batches failed.

In-memory job snapshots (`sync-runtime`) power `/api/sync/status` while the process lives; they are lost on server restart (DB account fields remain).

### 1.5 Rate limiting

- Minimum ~2 s between WB requests (`WB_RATE_LIMIT_MS`)
- HTTP 429: retry with backoff up to 20 attempts (max wait ~180 s)
- Finance pages: additional ~5 s between pages

---

## 2. Database coverage (observed)

Source: `GET /api/sync/verification?marketplaceAccountId=1` at **2026-07-24T16:03:27Z**.

| Source | Earliest | Latest | Total records | Last sync timestamp |
|--------|----------|--------|---------------|---------------------|
| Orders | 2026-04-11 | 2026-07-12 | 2 974 | 2026-07-23T09:01:55Z |
| Sales | 2026-01-18 | 2026-07-22 | 1 563 | 2026-07-23T09:01:55Z |
| Finance | 2026-01-01 | 2026-07-19 | 66 669 | 2026-07-23T09:01:55Z |
| Inventory | 2026-06-26 | 2026-07-09 | 1 077 | 2026-07-23T09:01:55Z |

### Observed gaps

1. **Orders latest = 2026-07-12** while expectedAsOf = 2026-07-24 (**12 days behind**). Sales are current through 2026-07-22 — Orders lag is inconsistent with Sales freshness.  
2. **Inventory `last_synced_at` latest = 2026-07-09** (**15 days behind**). Auto-sync intentionally **skips stock**; if only auto-sync / finance-heavy runs occur, stock ages.  
3. **Orders earliest starts 2026-04-11** while Sales/Finance reach into January — historical Orders coverage is shorter (API retention and/or sync windows).  
4. **Last sync clock (Jul 23) ≠ Orders data freshness (Jul 12)** — proves `last_successful_sync_at` is a **job clock**, not a data completeness certificate.

Existing diagnostic scripts (not run as part of this document’s mandatory deliverable, but available):

- `npm run verify:api-coverage` — live API vs DB for a date range  
- `npm run verify:finance-sync-v2` — finance V2 checks  
- `scripts/verify-sync.mjs` — schema + sync smoke  

---

## 3. Failure points (where data can be lost or look complete when it is not)

| Failure mode | How it happens | Symptom | Severity |
|--------------|----------------|---------|----------|
| **Partial writes with “success-like” finish** | Batch upsert fails mid-entity; status becomes `partial` but `last_successful_sync_at` still updates | UI shows recent sync; extents lag | **High** |
| **Interrupted pagination / no checkpoint** | Process kill / timeout mid statistics or finance `rrdid` loop | Missing middle of range until full re-pull | **High** |
| **Narrow UI `dateFrom`** | Manual/auto sync starts cursor at recent `from` | Older in-window rows never requested | **High** |
| **Finance V2 window ≠ UI range** | Dashboard finance always lookback (~14d) | Historical finance holes outside lookback unless backfill/lifecycle ran | **High** |
| **Auto-sync omits stock (and products)** | `OPERATIONAL_SYNC_ENTITIES` = orders/sales/finance | Inventory verification warnings while Sales “healthy” | **Medium** |
| **Stock silent skips** | No product match / no nmId | Under-counted inventory; no hard fail | **Medium** |
| **Orders vs Sales filter asymmetry** | Orders keep rows by `last_change_date`; Sales filter `sale_date` only | Different coverage shapes for same calendar period | **Medium** |
| **Rate limit exhaustion** | 429 after max retries | Entity errors; partial job | **Medium** |
| **Lifecycle blocks incremental finance** | Status not incremental-ready | Finance deferred / partial message | **Medium** |
| **Report-list discovery soft-fail** | Finance V2 continues without list metadata | Weaker late-report detection | **Low–Medium** |
| **Schema column probes** | Missing optional columns → legacy path + warnings | Sync continues; some fields absent | **Low** |
| **In-memory status loss** | Server restart mid-job | Status polling confused until stale-lock release | **Low–Medium** |
| **Ads never synced** | No pipeline | Ad spend incomplete in analytics that expect `wb_ads` | **Low** (if unused) |
| **Silent zero-amount finance lines skipped** | Mapper skips | Line-level gaps vs WB portal totals | **Low–Medium** |

### How missing ranges occur (summary)

1. Sync window starts too late (`dateFrom` / finance lookback).  
2. Pagination stops early (crash, timeout, API error) without resume token persistence.  
3. Rows rejected locally (no product, filter, dedupe).  
4. Entity not included in the run (auto-sync without stock).  
5. Job marked successful enough (`partial`/`warning`) so operators stop investigating.

---

## 4. Current risks

| Risk | Description | Priority |
|------|-------------|----------|
| **False confidence from last sync time** | Operators equate `last_successful_sync_at` with “data through today” | **P0** |
| **Orders lag vs Sales** | Observed 12-day Orders lag while Sales healthy — financial/ops KPIs that mix both can disagree | **P0** |
| **Inventory staleness under auto-sync** | Stock not in operational auto-sync → systematic aging | **P1** |
| **No automated API↔DB completeness gate post-sync** | Verification layer reports lag only; does not block or compare to WB API counts | **P1** |
| **Partial status advances success timestamp** | Masks incomplete upserts | **P1** |
| **Finance historical dependence on lifecycle/backfill** | New accounts / gaps outside 14-day lookback need separate paths | **P1** |
| **No pagination checkpoints** | Long jobs are all-or-nothing from original cursor | **P2** |
| **Ads absent** | Future ad-aware P&L cannot rely on sync | **P2** |

---

## 5. Recommended improvements (future stabilization sprints only)

These are **recommendations**, not implemented in this sprint.

| # | Improvement | Why | Priority |
|---|-------------|-----|----------|
| 1 | Treat verification Warning as operator-visible post-sync checklist (already partially present) without auto-repair | Makes “is DB up to date?” answerable after every sync | **P0** |
| 2 | Decouple `last_successful_sync_at` from `partial` **or** store per-entity `latest_data_date` on the account | Removes false confidence | **P0** |
| 3 | Investigate and close Orders lag (API vs filter vs dateFrom vs pagination) using `verify:api-coverage` | Observed gap is actionable | **P0** |
| 4 | Include `stock` in operational auto-sync **or** document that inventory requires manual Sync | Fixes systematic inventory aging | **P1** |
| 5 | Persist pagination checkpoints (`lastChangeDate` / `rrdid`) per entity | Survive interrupts | **P1** |
| 6 | Post-sync optional API count comparison (diagnostic only) for the synced window | Prove completeness, not just freshness | **P1** |
| 7 | Do not advance success markers when critical entity errors remain | Honest status | **P1** |
| 8 | Formalize finance gap playbook (lookback vs backfill vs recover) | Reduce missing settlement ranges | **P2** |
| 9 | Ads sync design (only if product needs it) | Close known non-coverage | **P3** |

---

## 6. Audit conclusions

1. **How synchronization works** — Documented above: five persisted sources (products, orders, sales, finance, stock), finance split into V2 lookback vs historical backfill, success tracked on `marketplace_accounts` (+ `sync_runs` for finance).  
2. **Where data can be lost** — Partial batch writes, silent stock skips, filter asymmetry, omitted entities in auto-sync, interrupted pagination, finance outside lookback.  
3. **How missing ranges occur** — Window choice + incomplete pagination + soft failures that still update success timestamps.  
4. **What to do next** — Stabilization should prioritize **Orders freshness investigation**, **honest success semantics**, and **stock inclusion / expectations** before any new feature work.

### Proof posture today

| Question | Answer |
|----------|--------|
| Do we understand the pipeline? | **Yes** |
| Can we measure DB extents and lag? | **Yes** (`/api/sync/verification`) |
| Can we prove API completeness for every day? | **Not automatically** (needs `verify:api-coverage` / future gate) |
| Is the live DB fully up to date? | **No** — Verification Warning (Orders + Inventory) |

---

## Appendix A — Key files

| Role | Path |
|------|------|
| HTTP client | `src/lib/wildberries/api-client.ts` |
| Entity sync | `src/lib/wildberries/sync-service.ts` |
| Dashboard orchestration | `src/services/dashboard-sync-service.ts` |
| Finance V2 | `src/lib/wildberries/finance-sync-v2.ts` |
| Finance history | `src/lib/wildberries/finance-history-backfill.ts` |
| Jobs / status | `src/services/sync-job-service.ts` |
| Account markers | `src/services/marketplace-account-service.ts` |
| Finance audit | `src/services/sync-run-service.ts` |
| Read-only verification | `src/services/sync-verification-service.ts` |
| Verification docs | `docs/sync-verification-layer-v1.md` |

## Appendix B — Related tooling

| Tool | Purpose |
|------|---------|
| `GET /api/sync/verification` | Read-only extents + lag warnings |
| `npm run verify:api-coverage` | API vs DB comparison for a range |
| `npm run verify:finance-sync-v2` | Finance V2 integrity |
| `scripts/verify-sync.mjs` | Schema + sync smoke |

---

*End of Sprint 9.1 audit report. No sync behavior was changed to produce this document.*
