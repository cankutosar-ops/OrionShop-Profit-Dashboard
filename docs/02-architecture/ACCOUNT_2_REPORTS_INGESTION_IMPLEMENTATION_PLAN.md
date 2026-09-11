# Account 2 — Reports-Based Finance Ingestion
## Final Research Summary + Implementation Plan

**Date:** 2026-09-06  
**Task type:** Offline research + planning only  
**Code changes in this task:** None  
**Companion research:** `docs/02-architecture/ACCOUNT_2_REPORTS_API_FINAL_RESEARCH.md`

| Safety record | Value |
|---------------|-------|
| Wildberries API calls | **0** |
| Production DB writes | **0** |
| Account 1 modified | **NO** |
| Account 2 recovery executed | **NO** |
| Progress / tokens / `.env` modified | **NO** |

---

## Implementation decision (ONE answer)

### **C) Reports API can replace Statistics V5 for Account 2 Finance recovery, but some fields require another source (or remain UNCERTAIN).**

| Scope | Verdict |
|-------|---------|
| Replace deprecated Statistics V5 `reportDetailByPeriod` as Finance ledger source | **Yes** — use Financial Reports / Sales Reports V1 |
| Complete `wb_finance` Revenue (`for_pay` / `ppvz_for_pay`) + most fee lines | **Yes** — from `sales-reports/detailed` |
| Guarantee no 429 / no multi-day Reset | **No** — published 1/min; Account 2 already hit finance-api 429; punitive multi-day Reset on V1 is **UNKNOWN** |
| Logistics (`delivery_rub`) | **UNCERTAIN** — do not invent from `deliveryService` / `deliveryAmount` |
| Sales, Marketplace Fee, Estimated Tax, Ads, Product Cost | **Other sources** (Sales API, ads, cost tables) — not Reports |

---

## 1. What Reports actually is

| Concept | Meaning |
|---------|---------|
| **Portal “Еженедельный отчет”** | Weekly settlement **summary** (one row per realization report) |
| **Portal “Еженедельный детализированный отчет”** | Weekly **transaction ledger** (one row per finance operation) |
| **API “Financial Reports / Sales Reports”** | Official programmatic equivalent: `POST /api/finance/v1/sales-reports/*` on `finance-api.wildberries.ru` |
| **Documents API** | Separate product (acts, UPDs, notifications) — **not** the Finance ledger |
| **Statistics V5 `reportDetailByPeriod`** | Deprecated predecessor of Sales Reports detailed |

There is **no** separate public API whose only job is “download the portal Excel file.” Reports-based recovery **means** Sales Reports V1 ingestion.

---

## 2. Exact official API / source

| Role | Method | Endpoint |
|------|--------|----------|
| Discover weeks + control totals | POST | `https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list` |
| Transaction lines (primary for `wb_finance`) | POST | `…/api/finance/v1/sales-reports/detailed` |
| Lines by report id (optional) | POST | `…/api/finance/v1/sales-reports/detailed/{reportId}` |

**Token:** Personal or Service + **Finance** category. Base → list 403 (repo evidence).

**Body (detailed, first page of missing week):**
```json
{
  "dateFrom": "2026-06-29",
  "dateTo": "2026-07-05",
  "limit": 100000,
  "rrdId": 0,
  "period": "weekly"
}
```

**Pagination:** `rrdId=0` then last-row `rrdId`; empty / `204` = finished.  
**List:** insufficient alone — **no inventing rows from summary**. Detailed is required for `wb_finance`.

---

## 3. Why preferable to V5

1. Official replacement; V5 deprecated / disable date published.  
2. Same economic family as portal weekly detailed report (Sprint 7.5).  
3. camelCase + string money; report discovery via list.  
4. Avoids further Statistics-host punitive path already proven for Account 2.  

**Not preferable because “unlimited.”** Quota is still **1 req/min, burst 1**.

---

## 4. Does it contain the Finance data we need?

| FE V4 need | From Reports detailed? |
|------------|------------------------|
| Revenue Σ(`ppvz_for_pay`) | **Yes** (`forPay` → `for_pay`) |
| Storage / Acceptance / Penalties / Deduction / Commission / Acquiring / Rewards / VW / return logistics | **Yes** (mapped suffixes) when non-zero |
| Logistics | **UNCERTAIN** |
| Sales / Marketplace Fee | **No** — Sales API |
| Estimated Tax | **No** — Σ(`finishedPrice`) Sales API |
| Product Cost / Advertising | **No** |

Account 2 gap week `2026-06-29→2026-07-05` is **published** for Account 1 (list evidence). Account 2 same calendar week expected; prior Account 2 fetch failed on **auth/429**, not proven empty.

---

## 5. Complete field mapping

| Report / V1 field | wb_finance | Transform | Accounting meaning | Class |
|-------------------|------------|-----------|--------------------|-------|
| `rrdId` | `rrd_id`, `source_key` prefix | int | Line identity | **DIRECT** |
| `reportId` | `realizationreport_id` | number | Weekly report id | **DIRECT** |
| `nmId` | `nm_id` (+ product_id lookup) | number | SKU identity | **DIRECT** / **DERIVED** product_id |
| `rrDate` | `operation_date`, `rr_dt` | prefer rrDate | Operation axis | **DIRECT** |
| `saleDt` | `operation_date` fallback | date | Fallback date | **TRANSFORMED** |
| `sellerOperName` | `supplier_oper_name` | string | Oper name / category | **DIRECT** |
| `docTypeName` | signs `for_pay` on return | string | Sale vs return | **TRANSFORMED** |
| `forPay` | suffix `for_pay` | parse money; return − | **Revenue** | **TRANSFORMED** |
| `ppvzSalesCommission` | `commission` | abs | Fee | **TRANSFORMED** |
| `paidStorage` | `storage` | abs | Fee | **TRANSFORMED** |
| `paidAcceptance` | `acceptance` | abs | Fee | **TRANSFORMED** |
| `penalty` | `penalty` | abs | Fee | **TRANSFORMED** |
| `deduction` | `deduction` | abs | Other | **TRANSFORMED** |
| `acquiringFee` | `acquiring_fee` | abs | Fee | **TRANSFORMED** |
| `ppvzReward` | `ppvz_reward` | abs | Fee | **TRANSFORMED** |
| `additionalPayment` | `additional_payment` | abs | Other | **TRANSFORMED** |
| `vw` | `ppvz_vw` | abs | Fee | **TRANSFORMED** |
| `rebillLogisticCost` | `return_logistics` | abs | Fee | **TRANSFORMED** |
| `deliveryService` / `deliveryAmount` | `delivery_rub` / logistics | — | Logistics | **UNCERTAIN** / **NOT AVAILABLE** until proven |
| `srid` | `srid` | string | Attribution | **DIRECT** |
| `sku` / `quantity` / `retailAmount` | not stored as finance lines | — | Metadata | **NOT AVAILABLE** in schema today |
| `source_key` | `rrd:{rrdId}:{suffix}` | build | Idempotency | **DERIVED** |

`marketplace_account_id` = `"2"` at UPSERT time (**DERIVED** from account context, not API).

---

## 6. Account 2 recovery strategy

**Current state (read-only):**

- Rows ≈ **13282**; MAX `operation_date` = **2026-06-28**
- Completed chunk: `2026-06-22:2026-06-28`
- Active / blocked: `2026-06-29:2026-07-05`, cursor **rrdId=0**, `completedPages=[]`
- `campaignStatus=active`; cooldown `serverRetryUntil` ≈ **2026-09-11T06:50Z** (from **Statistics** 429 — still blocks wakes until honored)
- Do **not** resume V5

**Reports-oriented flow:**

```text
Prerequisites (separate tasks — not this document’s execution):
  1. Personal/Service+Finance token saved on Account 2 only
  2. Reservation env true; live flag only for authorized wake
  3. Honor / clear cooldown; lock free; schema ready

Wake model (max 1 HTTP):
  validate gates → persist timestamp BEFORE HTTP
  → ONE of: list(control) OR detailed(page)
  → capture Remaining/Limit/Reset/Retry
  → 429 / missing headers → fail closed, persist cooldown, exit
  → UPSERT → advance cursor only after success → exit

Week complete when detailed returns empty/204.
Then reconcile list forPaySum vs Σ(detailed forPay) offline/DB.
Mark week imported; next week only on a later wake.
```

List alone = **not** recovery. Detailed = **required**.

---

## 7. Rate-limit strategy

| Rule | Rationale |
|------|-----------|
| Do not assume 60/70s is enough | Statistics Reset was multi-day; V1 punitive Reset **UNKNOWN** |
| Capture Remaining/Limit/Reset/Retry (case-insensitive) | Existing client |
| Retry = seconds | Existing parser |
| 429 → immediate fail-closed; no inline storm | Existing |
| Persist `lastFinanceRequestAt` before HTTP | Existing recovery script |
| Persist cooldown across process restart | Existing progress gate |
| `maxPagesPerWake = 1` | Existing |
| Missing Remaining/Reset on V1 detailed → fail closed | Existing `fetchFinanceV1ReportPage` |
| One list **or** one detailed per wake initially | Conservatism |

**Honest safety verdict:** Reports **can** finish the warehouse **if** quota allows over calendar time. It does **not** prove we will avoid another long Reset on finance-api. Design for scarcity; never auto-paginate.

---

## 8. Pagination strategy

1. Week window = 7 days matching WB weekly report (`2026-06-29`→`2026-07-05`, then next).  
2. First detailed request: `rrdId=0`.  
3. After UPSERT: store `lastPersistedRrdId` = last row `rrdId`.  
4. Next wake: same week, resume cursor.  
5. Empty/`204`: week pages done; do not advance to next week in same wake.  
6. Replay same page: safe via UPSERT on `(marketplace_account_id, source_key)`.

---

## 9. Reconciliation strategy

**Per week (after detailed pages complete):**

| Check | Method | Tolerance |
|-------|--------|-----------|
| List exists for week (`reportType` 1 and/or 2) | list response | Required before “week closed” |
| Σ DB `for_pay` vs list `forPaySum` | SQL vs list | Prefer **exact** within money parse (≤ ₽0.01 only if float evidence; otherwise exact after string-normalized cents) — **do not invent looser tolerance without measurement** |
| Unique `rrd_id` / `source_key` | SQL | duplicates = **0** |
| Fee suffixes present | SQL by `wb_source_suffix` | Informational vs list sums where list has matching *Sum fields |
| Returns | signed `for_pay` | Matches docType/oper return rules |
| Logistics | compare only if mapping proven | Else report **UNCERTAIN / gap** |

**Do not** claim settlement Excel “Итого к оплате” equals FE Net Profit (different equation — Sprint 7.5).

---

## 10. Remaining uncertainties

1. Finance V1 multi-day Reset possibility for Account 2.  
2. `deliveryService` / `deliveryAmount` ↔ `delivery_rub`.  
3. Whether `detailed/{reportId}` works for Account 2’s country.  
4. Shared rate-limit bucket across list + detailed + balance.  
5. Report mutability after `createDate`.  
6. Account 2-specific `reportId`s (not fetched successfully yet).  
7. Whether Account 2 token is now Personal in DB (last audit: still Base — verify before any live wake).

---

## 11. Exact files that would need modification (future implementation)

**Already in place (reuse, do not rewrite blindly):**

| File | Role |
|------|------|
| `src/lib/wildberries/finance-v1.ts` | Request builders, normalize, token/live gates, reconcile helper |
| `src/lib/wildberries/api-client.ts` | `fetchSalesReportsList`, `fetchFinanceV1ReportPage` |
| `src/lib/wildberries/sync-service.ts` | `syncFinanceV1Page`; Account 2 v5 refuse |
| `src/lib/wildberries/mappers.ts` | `mapFinanceRowsFromReport`, `buildFinanceSourceKey` |
| `src/lib/wildberries/finance-sync-v2.ts` | List discovery pattern (skip when reserved) |
| `src/lib/finance-recovery/*` | Reservation, cooldown, cursor helpers |
| `scripts/run-account2-finance-chunked-recovery.mjs` | One-page wake skeleton (already V1-oriented) |
| `scripts/verify-finance-v1-migration.mjs` | Offline gates |

**Likely future edits (implementation task, not this one):**

| File | Change |
|------|--------|
| `scripts/run-account2-finance-chunked-recovery.mjs` | Report-week inventory state; optional alternate list vs detailed wakes; progress fields for imported `reportId`s |
| `src/lib/wildberries/finance-v1.ts` | Only if logistics mapping is **proven** later |
| New offline verify script | Report-ingestion checklist (no HTTP) |
| Progress JSON schema docs | `apiSource=finance_v1_sales_reports_detailed`, week import markers |

**Do not touch for Account 2 Reports path:** Statistics v5 callers used by Account 1/legacy CLIs (isolate, don’t delete blindly).

---

## 12. Exact implementation sequence (future tasks)

| Step | Action | Live WB? |
|------|--------|----------|
| 0 | This plan + prior research (done) | No |
| 1 | Save Personal/Service+Finance token to Account 2 only | No HTTP to WB from recovery; Settings write only |
| 2 | Read-only readiness inspect (`financeV1Ready=true`) | No WB HTTP |
| 3 | Wait until cooldown `≥ 2026-09-11T06:50Z` (or prove cleared) | No |
| 4 | Offline verifies: `verify:finance-v1-migration`, page-recovery, campaign, bounds | No |
| 5 | **Separate authorized task:** ONE controlled detailed page for `2026-06-29→2026-07-05`, `rrdId=0` | **Yes — exactly one** |
| 6 | Observe headers; decide next wake spacing from **server** values | — |
| 7 | Continue one-page wakes until week empty; then list reconcile wake | Sparse |
| 8 | Next weeks until `rangeTo` / MAX date goal | Sparse |
| 9 | Only then consider raising `maxPagesPerWake` | Optional |

---

## 13. Safety verdict

| Question | Answer |
|----------|--------|
| Can Account 2 Finance recovery be completed from Reports? | **Yes in principle** — detailed Sales Reports is the correct and complete Finance ledger source for modeled fields |
| Without repeating the previous 429 problem? | **Not guaranteed.** Published limit is still 1/min; Account 2 already received finance-api 429; multi-day Reset on V1 is **UNKNOWN**. Mitigation = fail-closed one-page wakes, never V5, never retry storms |
| READY for unconstrained recovery? | **NO** |
| READY for a future single controlled Reports detailed request (after token + cooldown + live flag)? | **Architecturally prepared; operationally blocked until prerequisites** — do not call “READY” from tests alone |

### Final recommendation line

**Use Reports (Sales Reports V1) as the only Account 2 Finance historical source; treat rate limits as hostile until proven otherwise; leave logistics UNCERTAIN; keep Sales/Tax/Ads on their existing sources.**

---

## Existing project inventory (audit pointer)

| Area | Key locations |
|------|----------------|
| Finance V1 / Reports API client | `finance-v1.ts`, `api-client.ts` |
| Persistence | `sync-service.ts` `syncFinanceV1Page` / `batchUpsertFinance` |
| Finance Sync V2 | `finance-sync-v2.ts` (list + `syncFinance`) |
| Settlement / list consumers | `wb-sales-reports-service.ts`, settlement/cash-received/expected-payout services |
| KPI list | `kpi-snapshot-sync.ts` |
| Schema | `WbFinance` in `src/types/database.ts`; unique `(marketplace_account_id, source_key)` |
| Recovery | `run-account2-finance-chunked-recovery.mjs`, `exports/finance-backfill/account-2-recovery-progress.json` |
| Portal Excel analysis | `docs/99-legacy/management-reporting-specification-sprint-7-5.md` |
| Prior final research | `docs/02-architecture/ACCOUNT_2_REPORTS_API_FINAL_RESEARCH.md` |

---

**WILDBERRIES API CALLS: 0**  
**PRODUCTION DB WRITES: 0**  
**ACCOUNT 1 MODIFIED: NO**  
**ACCOUNT 2 RECOVERY EXECUTED: NO**
