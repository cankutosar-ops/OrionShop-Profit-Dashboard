# Sprint 9.6 — Wildberries Historical Stock History Validation

**Status:** Validation complete (no Historical Data Warehouse implementation)  
**Date:** 2026-07-26  
**Account probed:** marketplace account `1` (Wildberries Default)  
**Artifacts:** `exports/stock-history-validation-9-6/`  
**Validation script:** `scripts/validate-stock-history-daily-csv-9-6.mjs`

---

## Final answer

### Can Orion populate the Historical Data Warehouse with accurate inventory snapshots beginning July 17 using Wildberries historical inventory exports?

# YES

**Evidence:** Live create → poll → download of `STOCK_HISTORY_DAILY_CSV` for **2026-07-17 … 2026-07-25** succeeded (HTTP 200). The CSV contains **one row per NmID + Size (ChrtID/SizeName) + Warehouse (OfficeName)** with **one quantity column per calendar day**, including **17.07.2026**. Retention edge confirmed: earliest available date as of 2026-07-26 is **2026-04-26** (~3 months). Single-day request for Jul 17 also accepted.

**Recommended option:** **A — Use `STOCK_HISTORY_DAILY_CSV` as the historical backfill source.**

---

## Phase 1 — Endpoint validation

### Official surface

| Item | Value |
|------|--------|
| Host | `https://seller-analytics-api.wildberries.ru` |
| Create report | `POST /api/v2/nm-report/downloads` |
| List / status | `GET /api/v2/nm-report/downloads?filter[downloadIds]={uuid}` |
| Download ZIP | `GET /api/v2/nm-report/downloads/file/{downloadId}` |
| Retry failed | `POST /api/v2/nm-report/downloads/retry` |
| Report type | `STOCK_HISTORY_DAILY_CSV` |
| Docs | [WB Analytics OpenAPI](https://dev.wildberries.ru/en/docs/openapi/analytics) — Seller Analytics CSV |
| Release notes | New CSV Inventory History Report — balances **as of 23:59**, last **3 months**, **without Jam** ([release notes id≈481/487](https://dev.wildberries.ru/en/release-notes?id=481)) |

### Authentication & permissions

| Requirement | Live result |
|-------------|-------------|
| Token category **Analytics** | **PASS** — list + create + download succeeded with existing Orion WB API key |
| Jam subscription | **Not required** for inventory CSVs (official docs); confirmed by successful create |
| Marketplace | Wildberries seller token for the account |

### Request body (validated live)

```json
{
  "id": "<seller-generated-uuid>",
  "reportType": "STOCK_HISTORY_DAILY_CSV",
  "userReportName": "optional",
  "params": {
    "currentPeriod": { "start": "2026-07-17", "end": "2026-07-25" },
    "stockType": "wb",
    "skipDeletedNm": false
  }
}
```

Optional filters (SDK `InventoryHistoryReportReq`): `nmIds`, `subjectIds`, `brandNames`, `tagIds`.

`stockType`: `""` (all) | `"wb"` | `"mp"` — both `wb` and `""` accepted in probes.

### Limits (official + observed)

| Limit | Value |
|-------|--------|
| Rate limit | 3 req / min, 20 s interval (Personal/Service) |
| Daily report creations | Max **20** / day / seller |
| Generated file retention on WB | **48 hours** — must download promptly |
| Inventory history retention | **~3 months** rolling |
| General analytics CSV max period | Up to 1 year — **inventory types capped at 3 months** |

### Live create evidence

| Step | Result |
|------|--------|
| `GET …/downloads` | **200** `{"data":[]}` |
| `POST …/downloads` (`STOCK_HISTORY_DAILY_CSV`) | **200** `"Началось формирование файла/отчета"` |
| Poll #1 (~15s) | **SUCCESS**, size 6752 (ZIP) |
| Download | **200**, ZIP sha256 `618c3917…`, CSV 121 755 bytes, **760** data rows |

Report id: `346690cc-5b78-4b70-a6c1-81517637d9b5`  
Evidence: `exports/stock-history-validation-9-6/evidence.json`

---

## Phase 2 — File structure

### Delivery format

- ZIP archive containing **one CSV** named `{reportId}.csv`
- Encoding UTF-8
- Wide layout: dimension columns + **one column per date** (`DD.MM.YYYY`)

### Columns observed (complete header)

| # | Column | Meaning |
|---|--------|---------|
| 1 | `VendorCode` | Seller article / SKU |
| 2 | `Name` | Product title |
| 3 | `NmID` | Wildberries article |
| 4 | `SubjectName` | Category / subject |
| 5 | `BrandName` | Brand |
| 6 | `SizeName` | Human size label (e.g. `50-52`, `STD`) |
| 7 | `ChrtID` | WB size/chart ID |
| 8 | `OfficeName` | Warehouse name |
| 9+ | `17.07.2026` … `25.07.2026` | Quantity on that calendar day |

### Fields requested in the sprint brief but **not** present in this CSV

| Field | Present? |
|-------|----------|
| Snapshot Date (as row field) | **No** — dates are **column headers** |
| Warehouse ID | **No** — name only (`OfficeName`) |
| Warehouse Name | **Yes** — `OfficeName` |
| Seller SKU | **Yes** — `VendorCode` |
| WB SKU | **Yes** — `NmID` |
| Barcode | **No** |
| Brand | **Yes** — `BrandName` |
| Category | **Yes** — `SubjectName` |
| Color | **No** |
| Size | **Yes** — `SizeName` + `ChrtID` |
| Quantity | **Yes** — per date column |
| Reserved quantity | **No** |
| Available vs full split | **No** — single qty cell |
| In-transit to/from client | **No** |
| Status / blocked | **No** |

Sample positive row (excerpt):

| VendorCode | NmID | SizeName | ChrtID | OfficeName | 17.07.2026 |
|------------|------|----------|--------|------------|------------|
| ZARALACIVERT01 | 150060261 | 50-52 | 251681598 | Актобе | 1 |

Full analysis: `exports/stock-history-validation-9-6/csv-analysis.json`

---

## Phase 3 — Granularity validation

| Dimension | Available? | Evidence |
|-----------|------------|----------|
| Warehouse | **Yes** | `OfficeName` — **42** distinct offices in sample |
| SKU (WB) | **Yes** | `NmID` — **42** distinct |
| Seller SKU | **Yes** | `VendorCode` |
| Size | **Yes** | `SizeName` + `ChrtID` — **13** size labels |
| **Warehouse + SKU + Size** | **Yes** | **760** unique `(NmID, ChrtID, OfficeName)` keys; **0 duplicates** |

This matches Orion’s required grain for warehouse history: **Warehouse + SKU + Size**.

### Warehouse caveats

1. **Name only** — no `warehouseId` / `officeID` in CSV (map later via Analytics `stocks-report/wb-warehouses` if needed).  
2. Aggregate bucket **`Остальные`** appears — not a physical warehouse.  
3. Naming may differ slightly from Statistics `warehouseName` / Supplies `actualWarehouseName` (normalize on import).

---

## Phase 4 — Historical coverage

| Question | Answer | Evidence |
|----------|--------|----------|
| Earliest available (as of 2026-07-26) | **2026-04-26** | Live `400`: `invalid start day … before earliest available date: 2026-04-26` |
| Latest available | Through **yesterday / recent completed days** in range; sample included through **25.07.2026** | Downloaded CSV columns |
| Max retention | **~3 months** rolling | Official docs + API error |
| Individual day download? | **Yes** | `start=end=2026-07-17` → **200** create |
| Multiple days in one export? | **Yes** | Jul 17–25 → one wide CSV |
| Entire history export? | **Yes within retention** — one or few range requests | Practical; respect 20 reports/day |

Retention probe: `exports/stock-history-validation-9-6/retention-probes.json`

**July 17 is inside the window today.** Do not delay backfill past ~late October 2026 or Jul 17 falls off retention.

---

## Phase 5 — Data quality

### End-of-day?

**Yes (official):** release notes state balances **as of 23:59**.

### Immutable?

| Aspect | Assessment |
|--------|------------|
| After EOD closes | Intended as historical day balance |
| Re-download later | Same report id expires in **48h**; a **new** generation for the same dates should be compared once before trusting immutability |
| This sprint | Did **not** re-generate Jul 17 twice to prove bit-identity — recommend checksum compare in import pilot |

### Match to current Warehouse Inventory?

| Comparison | Result |
|------------|--------|
| vs Orion `wb_stock` | **Not a fair match** — Orion stock last synced **2026-07-09**, Statistics stocks API **deprecated (PLUG-404)** |
| CSV Jul 25 qty sum (`stockType=wb`) | **1495** across 760 rows |
| Incident signal | Jul 17 sum **1531** → Jul 18 sum **1073** (−**458**, ~−30%) — consistent with a major warehouse event around Jul 18 |

### Trust for operational reporting?

**Yes, as WB Seller Analytics inventory history source of truth** for:

- Daily warehouse × size × nm quantities inside the 3-month window  
- Incident forensics (pre/post Jul 18 levels)

**With caveats:** no in-transit split; no barcode; office name normalization; `Остальные` bucket; no reserved/blocked flags.

---

## Phase 6 — Import strategy (architecture only)

```
STOCK_HISTORY_DAILY_CSV (ZIP)
        ↓
  Raw Archive (immutable object store / table)
        ↓
  Normalization (wide → long; map product_id; normalize office)
        ↓
  warehouse_inventory_snapshot (immutable rows)
        ↓
  Reporting / Historical Data Warehouse
```

### Idempotency rules

1. **Natural key:** `(marketplace_account_id, snapshot_date, nm_id, chrt_id, office_name_normalized)`  
   Optional stronger key once warehouse IDs mapped: replace office name with `warehouse_id`.  
2. **Upsert** with `ON CONFLICT DO UPDATE` only if `source_sha256` changes **and** ops explicitly allow replace; default = **DO NOTHING**.  
3. Store `source_report_id`, `source_file_sha256`, `imported_at`.  
4. Re-running import for the same archive must insert **0** duplicate snapshot rows.  
5. Wide CSV unpivots to long: one snapshot row per date column cell (including zeros if policy keeps zero stock rows — recommend **keep zeros** for incident completeness).

### Normalization sketch

| CSV | Snapshot column |
|-----|-----------------|
| Date header `DD.MM.YYYY` | `snapshot_date` (ISO date, Moscow calendar day) |
| `NmID` | `nm_id` → resolve `product_id` |
| `ChrtID` / `SizeName` | `chrt_id` / `tech_size` |
| `OfficeName` | `warehouse_name` (+ later `warehouse_id`) |
| Cell value | `quantity` |
| — | `source = 'wb_stock_history_daily_csv'` |

---

## Phase 7 — Raw archive strategy

### Requirements met by design

| Requirement | Design |
|-------------|--------|
| Never modify | Store as blob / object; app only reads |
| Never overwrite | Path includes content hash or unique download timestamp |
| By account | `{account_id}/` prefix |
| By snapshot period | `{start}_{end}/` or per-day after unpivot metadata |
| Original filename | Preserve WB `{reportId}.csv` + parent `.zip` |
| Download timestamp | Folder or DB column `downloaded_at` |

### Suggested layout (filesystem or object storage)

```
raw/wb_stock_history_daily/
  {marketplace_account_id}/
    downloaded_at={ISO8601}/
      report_id={uuid}/
        request.json          # create payload
        meta.json             # poll status, sizes, sha256
        original.zip          # immutable
        original/{reportId}.csv
```

### DB index table (optional)

`wb_stock_history_raw_files(id, marketplace_account_id, report_id, period_start, period_end, zip_sha256, storage_uri, downloaded_at, UNIQUE(marketplace_account_id, zip_sha256))`

Audits always reopen `original.zip` / CSV — never only normalized tables.

---

## Phase 8 — Architecture decision

| Option | Decision |
|--------|----------|
| **A — STOCK_HISTORY_DAILY_CSV backfill** | **SELECT** |
| B — Reverse reconstruction | Reject for backfill |
| C — Hybrid | Reject as primary; optional residual audit later |

### Justification

1. Live API works on production account with required grain.  
2. Jul 17 is available; multi-day export is efficient.  
3. Official EOD semantics; no Jam tax.  
4. Reverse reconstruction cannot observe transfers/write-offs — exactly the failure mode of a warehouse incident.  
5. Forward Daily Snapshot Engine should still use Analytics `stocks-report/wb-warehouses` (or nightly CSV) going forward; CSV is the **one-time historical bridge**.

---

## Risks

1. **Retention cliff** — Jul 17 ages out ~3 months from “today”.  
2. **20 reports/day** — plan batching (one wide range preferred).  
3. **48h download window** — automate download after SUCCESS.  
4. **Office name drift** vs other WB APIs.  
5. **`Остальные`** aggregation.  
6. Missing in-transit / barcode / warehouse ID.  
7. Immutability of regenerated CSVs not proven bit-identical in this sprint.  
8. Analytics token must remain enabled on the service key.

---

## Limitations

- Validation did not visually reconcile Seller Portal UI cell-by-cell.  
- Did not download `stockType=""` full file for row-count comparison.  
- Did not implement warehouse_id enrichment.  
- Orion `wb_stock` cannot validate absolute levels while Statistics stocks API is dead and cache is stale.

---

## Recommended next steps (out of scope for 9.6)

1. One-time ops pull: archive CSV for **2026-07-17 → yesterday** (and optionally back to **2026-04-26**).  
2. Pilot normalize → snapshot table with idempotent upsert.  
3. Checksum re-download of same period once for immutability QA.  
4. Implement Daily Snapshot Engine for forward days.  
5. Optional: map `OfficeName` → `warehouseId` via Analytics current stocks-report.

---

## Verdict (repeat)

# YES

Orion can populate the Historical Data Warehouse with accurate **Warehouse + SKU + Size** daily inventory snapshots beginning **2026-07-17** using Wildberries `STOCK_HISTORY_DAILY_CSV`, subject to documented field gaps (no barcode / in-transit / warehouse id) and rolling 3-month retention.
