# Historical Inventory Recovery — Final Report

**Operation:** One-time preservation (no DB writes, no HDW, no app changes)  
**Source:** `STOCK_HISTORY_DAILY_CSV` via `https://seller-analytics-api.wildberries.ru`  
**Range:** **2026-07-17 → 2026-07-26** (today)  
**Script:** `scripts/recover-historical-inventory.mjs`  
**Output root:** `exports/historical-inventory/`

---

## Recovered accounts (seller)

| Account | Name | Days | Records (all days) | Warehouses | SKUs | SKU+Size | Failures |
|---------|------|------|--------------------|------------|------|----------|----------|
| **1** | Wildberries Default | 10 / 10 | **7 610** | 42 | 42 | 135 | none |
| **2** | Orion shop | 10 / 10 | **14 370** | 46 | 132 | 447 | none |

### Recovered days (both accounts)

`2026-07-17` … `2026-07-26` — **no missing dates** for accounts 1 and 2.

### Recovered files (accounts 1–2)

Per day × 2 accounts × 3 artifacts = **60 files**:

- `raw.csv`
- `inventory.xlsx`
- `summary.json`

Plus immutable WB sources:

- `account-1/_source/STOCK_HISTORY_DAILY_*.zip`
- `account-1/_source/STOCK_HISTORY_DAILY_wide.csv`
- `account-2/_source/…` (same)

### Totals (accounts 1 + 2)

| Metric | Value |
|--------|-------|
| Recovered day-folders | **20** |
| Recovered day files | **60** |
| Total inventory records | **21 980** |
| Warehouse count (union of names) | see per-account lists in JSON |
| SKU count (sum of accounts) | **174** (42 + 132) |
| SKU+Size count (sum of accounts) | **582** (135 + 447) |
| Missing dates (real accounts) | **none** |
| Download failures (real accounts) | **none** |

### Incident signal (preserved)

| Account | Qty 2026-07-17 | Qty 2026-07-18 | Δ |
|---------|----------------|----------------|---|
| 1 | 1 531 | 1 073 | −458 |
| 2 | 3 091 | 1 937 | −1 154 |

---

## Skipped / failed accounts

Active rows **3** (`Verify Flow Test`) and **4** (`Verify Flow Test 2`) are local verify fixtures. Both returned **HTTP 401** (malformed API token). They are **not** seller marketplaces and were not part of the recovery objective. The recovery script now skips names matching `Verify Flow Test`.

---

## Per-day layout

```
exports/historical-inventory/
  account-1/
    _source/                  # immutable WB ZIP + wide CSV
    2026-07-17/
      raw.csv
      inventory.xlsx
      summary.json
      source-ref.json
    …
    2026-07-26/
    account-report.json
  account-2/
    … (same)
  RECOVERY_REPORT.json
  RECOVERY_REPORT.md
```

### Excel columns (sorted Warehouse → Seller SKU → Size)

Snapshot Date · Warehouse · Seller SKU · WB SKU (NmID) · Size · Quantity

### Validation (all recovered days)

- No duplicate Warehouse+SKU+Size (+ChrtID) rows  
- Warehouse / SKU / Size populated  
- Quantity numeric  
- `summary.json` → `validation.ok: true`

---

## Notes

1. One WB range download per account (Jul 17–26), then split into daily archives — preserves every day without burning the 20-report/day limit.  
2. `stockType: "wb"` (Wildberries warehouses).  
3. Quantities include zero-stock rows present in the WB wide CSV (full grain retained).  
4. Do not delete `exports/historical-inventory/` — this is the pre-HDW retention bridge.
