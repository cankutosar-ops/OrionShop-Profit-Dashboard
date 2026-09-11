# Account 2 — Wildberries Reports Data Source: Final Research

**Status:** Research complete — architecture decision ready  
**Date:** 2026-09-06  
**Scope:** Offline analysis only. Wildberries HTTP = 0. Production DB writes = 0. No code, env, progress, or token changes in this task.

**Evidence classes used throughout:**

| Class | Meaning |
|-------|---------|
| **DOCUMENTED** | Stated in official Wildberries API documentation (Financial Reports / Documents) |
| **REPOSITORY EVIDENCE** | Proven by committed exports, code, or prior audits in this repo |
| **INFERENCE** | Reasonable conclusion; not proven as fact |
| **UNKNOWN** | Not proven by docs or repo evidence |

---

## 1. Executive Summary

### Final question

> Can we stop fighting the Statistics V5 rate limit and instead populate the complete Account 2 Finance dataset from Wildberries Reports, using the Reports API as the authoritative ingestion source?

### Hard verdict

**A. YES — with a precise definition of “Reports.”**

Wildberries’ programmatic **Financial Reports / Sales Reports** API (`finance-api.wildberries.ru` → `/api/finance/v1/sales-reports/*`) **is** the official Reports system for weekly (and daily) realization finance. It is the documented replacement for deprecated Statistics `GET /api/v5/supplier/reportDetailByPeriod`. Transaction-level rows from `sales-reports/detailed` are the correct grain for `wb_finance`.

**Critical clarifications (do not lose):**

1. There is **no separate public “Weekly Excel Download API”** that returns the portal `.xlsx` as a distinct product. Portal “Еженедельный отчет” / “Еженедельный детализированный отчет” are the **business surfaces**; Finance V1 `sales-reports` is the **API equivalent**. (**DOCUMENTED** for API; **REPOSITORY EVIDENCE** for portal↔API economic family in Sprint 7.5.)
2. The **Documents API** (`documents-api` / Documents category) is a **different** product (acts, UPDs, notifications, etc.). It is **not** proven as the source of weekly realization ledgers. (**DOCUMENTED** category purpose; **UNKNOWN** whether any document category mirrors weekly finance Excel.)
3. Switching to Reports **does not remove rate pressure**. Finance V1 sales-reports is also published as **1 request / minute, burst 1** per seller account. Account 2 has already received **finance-api 429** on `sales-reports/detailed`. (**DOCUMENTED** quota; **REPOSITORY EVIDENCE** 429.)
4. Therefore the architecture must be **report-oriented ingestion** (discover published weeks → import detail pages → UPSERT → mark imported), **not** a Statistics-v5-style recovery hammer and **not** an unbounded Finance V1 retry storm.

### One-sentence recommendation

**Stop Statistics V5 forever for Account 2 Finance. Treat Finance V1 Sales Reports as the authoritative Reports ingestion source for `wb_finance`, with list-as-control and detailed-as-lines, Personal/Service+Finance token, one HTTP page per controlled wake, and server Reset/Retry as law.**

---

## 2. Previous Recovery Problem

**REPOSITORY EVIDENCE**

| Fact | Evidence |
|------|----------|
| Account 2 Finance max date stuck at **2026-06-28** | Prior audits; recovery progress / DB snapshots |
| Gap begins **2026-06-29 → onward** | Same |
| Recovery used Statistics **`reportDetailByPeriod`** | `scripts/run-account2-finance-chunked-recovery.mjs` (historical), `fetchFinanceReportPage` |
| Punitive Statistics 429 with Reset ≈ **676358 s** (~7.8 days) | Progress `serverRetryUntil` ≈ `2026-09-11T06:50Z`; prior wake logs |
| Historical 20× 429 retry storms worsened seller lock | `account-2-recovery-run.log` / prior RCA |
| Base token → Finance V1 list **403** `base token is not allowed` | `exports/wb-raw-2026-06-30_2026-07-05/sales-reports-list-weekly.json` |
| Finance V1 detailed → **429** on finance-api (seller-scoped) | Same folder `sales-reports-detailed-v1-weekly.json` / `manifest.json` |
| Offline V1 architecture prepared; live gate off; Account 2 still Base in DB at last pre-live audit | Prior session audits |

Strategic intent already agreed: **do not continue Account 2 Finance recovery on Statistics V5.**

---

## 3. Why Statistics V5 Is Not Suitable

| Reason | Class |
|--------|-------|
| Officially **deprecated**; release notes: disable **July 15** (year in notes context) in favor of Finance V1 sales-reports | **DOCUMENTED** |
| Host `statistics-api` / path `reportDetailByPeriod` already produced multi-day Reset for Account 2 | **REPOSITORY EVIDENCE** |
| Same economic family as portal weekly detailed report — redundant to keep two ingestion paths | **REPOSITORY EVIDENCE** (Sprint 7.5) + **DOCUMENTED** migration |
| Continuing V5 for Account 2 recovery re-risks seller-scoped punitive cooldowns | **INFERENCE** from observed Reset behavior |

**Account 2 Finance recovery must not fall back to Statistics V5.** Legacy Account 1 / operator CLIs may still reference v5 until separately retired — out of scope for this decision, but Account 2 recovery isolation must remain absolute.

---

## 4. Wildberries Reports Architecture

### 4.1 What the seller portal means by “Reports” (finance)

**REPOSITORY EVIDENCE** — `docs/99-legacy/management-reporting-specification-sprint-7-5.md`:

| Portal product | Grain | Business question |
|----------------|-------|-------------------|
| **Еженедельный отчет** (Weekly Report) | One row per weekly realization report | “How much will WB pay me this week?” |
| **Еженедельный детализированный отчет** (Weekly Detailed Report) | One row per finance operation line | “Which SKUs/ops produced that settlement?” |

These are **settlement / cash-transfer instruments**, not Orion’s management P&L.

### 4.2 How that maps onto official API taxonomy

Official OpenAPI section **“Documents and Accounting (finances)”** includes three distinct families (**DOCUMENTED**):

```text
┌─────────────────────────────────────────────────────────────┐
│ Documents and Accounting                                    │
├─────────────────┬───────────────────────┬───────────────────┤
│ Balance         │ Financial Reports     │ Documents         │
│ /account/balance│ Sales Reports V1      │ categories/list/  │
│                 │ list + detailed       │ download          │
│ Finance token   │ Finance token         │ Documents token   │
│                 │ Personal/Service      │ (different)       │
└─────────────────┴───────────────────────┴───────────────────┘
```

**For `wb_finance` / Financial Engine Revenue and fee lines, only Financial Reports → Sales Reports matter.**

Documents API answers a different question (legal/accounting file downloads). Using it as the primary Finance ledger source is **not supported by documentation**.

### 4.3 Actual availability model (authoritative)

```text
WB publishes weekly (and optionally daily) sales reports
        ↓
POST /api/finance/v1/sales-reports/list     ← inventory + control totals
        ↓
POST /api/finance/v1/sales-reports/detailed ← transaction lines (by period)
   and/or
POST /api/finance/v1/sales-reports/detailed/{reportId}  ← by report id
        ↓
validate / reconcile list totals vs Σ(detailed)
        ↓
UPSERT wb_finance  (source_key = rrd:{rrdId}:{suffix})
        ↓
Financial Engine / Dashboard read DB only
```

**No client-side “generate report” step is documented** for sales-reports. Reports appear as listable objects after WB forms them (`createDate` on list items). (**DOCUMENTED** list fields; **INFERENCE**: seller does not POST a generate job first.)

---

## 5. Official API Documentation Findings

Primary official source used: Wildberries OpenAPI **Financial Reports and Accounting**  
(`dev.wildberries.ru` / mirrored `dev.wildberries.cn` openapi pages; release notes for Sales Reports methods).

| Finding | Class |
|---------|-------|
| Section title: Financial Reports — “Sales reports list and details for the reports by IDs and period” | **DOCUMENTED** |
| Finance category token required for Financial Reports methods | **DOCUMENTED** |
| List + detailed/{reportId}: **Personal or Service** only | **DOCUMENTED** |
| Detailed by period: token types include Personal / Service / Base-with-secret / Base (Base has much lower quota) | **DOCUMENTED** |
| v5 `reportDetailByPeriod` replaced by V1 `sales-reports/detailed`; v5 to be disabled | **DOCUMENTED** (release notes) |
| Money fields in V1 are **strings** | **DOCUMENTED** |
| Google Sheets save mentioned as convenience — not a different data plane | **DOCUMENTED** |
| List / detailed-by-id: data since **2025-01-01**; may be unavailable for some registration countries | **DOCUMENTED** |
| Detailed by period: data since **2024-01-29** | **DOCUMENTED** |
| detailed/{reportId}: “currently unavailable for your registration country… get this data on request by period” | **DOCUMENTED** (country caveat — treat as **UNKNOWN** for Account 2 until a controlled live check) |

---

## 6. Available Report Types

### 6.1 Financial Reports (Sales Reports) — relevant

| Type | API | Grain | Use for Account 2 Finance |
|------|-----|-------|---------------------------|
| Weekly sales report summary | `POST …/sales-reports/list` `period=weekly` | One object per report (`reportId`) | Control / discovery / reconciliation |
| Daily sales report summary | same, `period=daily` | Same | Optional; not required for weekly recovery |
| Detailed lines by period | `POST …/sales-reports/detailed` | Transaction rows (`rrdId`) | **Primary `wb_finance` source** |
| Detailed lines by reportId | `POST …/sales-reports/detailed/{reportId}` | Same | Preferred when country allows; else period |

**List `reportType` values (DOCUMENTED sample / SDK):** `1` standard, `2` buyout notification, `3` Georgia buyout variant.  
**REPOSITORY EVIDENCE:** Account 1 weekly list shows both `reportType` 1 and 2 for the same week window (Основной / По выкупам family).

### 6.2 Acquiring reports

Separate Finance V1 acquiring list/detailed endpoints exist (**DOCUMENTED**, Russia sellers). **Not** a substitute for realization `wb_finance` lines. Optional future enrichment only.

### 6.3 Documents API

Acts, UPDs, offers, notifications, etc. (**DOCUMENTED**). **Not** proven as weekly realization ledger. **Do not** design Account 2 Finance recovery around Documents download.

### 6.4 Portal Excel

Manual download remains a **human fallback / audit artifact**, not the system source of truth. Prior decision: do not depend on manually uploaded Excel for architecture.

---

## 7. Historical Report Availability

| Question | Answer | Class |
|----------|--------|-------|
| Can list return historical weeks? | Yes, within documented window (list since 2025-01-01) | **DOCUMENTED** |
| Can detailed by period return historical lines? | Yes since 2024-01-29 | **DOCUMENTED** |
| Does week **2026-06-29 → 2026-07-05** exist as a published weekly report? | Yes for Account 1 (`reportId` 771254347 type 1, 771254352 type 2, `createDate` 2026-07-06) | **REPOSITORY EVIDENCE** |
| Will Account 2 have the same calendar week published? | Strongly expected (same WB product); Account 2-specific `reportId`s differ | **INFERENCE** |
| Was Account 2 able to fetch that week via API historically? | List 403 (Base); detailed 429 — **not proven empty** | **REPOSITORY EVIDENCE** |
| Arbitrary historical weeks after Jun 2026? | Within API windows: yes in principle | **DOCUMENTED** + **INFERENCE** |

**Conclusion for missing Account 2 period:** Reports **can** cover `2026-06-29 → 2026-07-05` and subsequent weeks **if** auth and rate limits allow. Non-availability has **not** been proven; blockers were token class and rate limit.

---

## 8. Report API Endpoints

| Method | Host | Path | Role |
|--------|------|------|------|
| POST | `finance-api.wildberries.ru` | `/api/finance/v1/sales-reports/list` | Discover reports + control sums |
| POST | `finance-api.wildberries.ru` | `/api/finance/v1/sales-reports/detailed` | Transaction pages by date range + `rrdId` |
| POST | `finance-api.wildberries.ru` | `/api/finance/v1/sales-reports/detailed/{reportId}` | Transaction pages for one report |
| GET | `statistics-api.wildberries.ru` | `/api/v5/supplier/reportDetailByPeriod` | **Deprecated** — do not use for Account 2 recovery |
| GET/POST | `documents-api.wildberries.ru` | `/api/v1/documents/*` | Unrelated document files |

**Never invent rows from list alone.** List is control/reconciliation only.

---

## 9. Authentication / Token Requirements

| Endpoint family | Token class | Category bit | Class |
|-----------------|-------------|--------------|-------|
| Sales reports **list** | Personal or Service | Finance | **DOCUMENTED** |
| Sales reports **detailed/{reportId}** | Personal or Service | Finance | **DOCUMENTED** |
| Sales reports **detailed** (by period) | Personal / Service / Base-with-secret / Base (Base: 24h / 2 req) | Finance | **DOCUMENTED** |
| Documents | Documents category | Documents | **DOCUMENTED** |
| Statistics v5 finance | Statistics (historical path) | Statistics | **DOCUMENTED** / legacy |

**REPOSITORY EVIDENCE:** Account 2 Base token → list **403** `base token is not allowed`.

**Practical rule for Account 2 Reports ingestion:** require **Personal (`acc=3`) or Service (`acc=4`) + Finance (bit 13)**. Do not rely on Base even if period-detailed allows Base at 24h cadence.

Reports Finance endpoints **do** require Finance permission — same family as “Finance V1,” not a looser Statistics-only path.

---

## 10. Rate Limits

### Published quotas (Sales Reports)

| Endpoint | Limit | Interval | Burst | Class |
|----------|-------|----------|-------|-------|
| list | 1 | 1 min | 1 | **DOCUMENTED** |
| detailed/{reportId} | 1 | 1 min | 1 | **DOCUMENTED** |
| detailed (period) Personal/Service | 1 | 1 min | 1 | **DOCUMENTED** |
| detailed (period) Base | 2 / 24h | 12 h | 1 | **DOCUMENTED** |

### Observed / unresolved

| Topic | Status |
|-------|--------|
| Headers Remaining / Limit / Reset / Retry | Used by our client; treat as authoritative | **REPOSITORY EVIDENCE** (implementation) + **DOCUMENTED** 429 responses exist |
| Seller-scoped limiter (`per seller {sid}`) on finance-api | Observed in Account 2 429 body | **REPOSITORY EVIDENCE** |
| Whether Finance V1 can issue multi-day Reset like Statistics v5 | **UNKNOWN** (not proven or disproven) |
| Shared bucket across list + detailed + balance | **UNKNOWN** (likely seller-scoped finance host — **INFERENCE**) |
| “Wait 60/70s always safe” | **False** as an assumption; honor server | Architecture rule |

**Strategic implication:** Reports ingestion **must** use the same fail-closed, one-page-per-wake, persist-timestamp-before-HTTP discipline already designed for Finance V1. Renaming the source to “Reports” does not create unlimited bandwidth.

---

## 11. Pagination

| Mechanism | Detail | Class |
|-----------|--------|-------|
| List | `limit` ≤ 1000, `offset` | **DOCUMENTED** |
| Detailed | `limit` ≤ 100000; start `rrdId=0`; next = last row `rrdId`; empty/`204` = done | **DOCUMENTED** |
| Incremental by week | Choose `dateFrom`/`dateTo` for one week; or import by `reportId` when available | **DOCUMENTED** + design |
| Safe re-download | Same pages may be requested again; DB must UPSERT by stable key | **INFERENCE** + our unique index **REPOSITORY EVIDENCE** |

---

## 12. Data Fields

### 12.1 List (summary) — control grain

Examples (**DOCUMENTED** / Account 1 **REPOSITORY EVIDENCE**):  
`reportId`, `dateFrom`, `dateTo`, `createDate`, `reportType`, `retailAmountSum`, `forPaySum`, `deliveryServiceSum`, `paidStorageSum`, `paidAcceptanceSum`, `deductionSum`, `penaltySum`, `additionalPaymentSum`, `bankPaymentSum`, cashback sums, `sellerFinanceName`, `currency`, …

### 12.2 Detailed (transaction) — line grain

Official sample fields include (non-exhaustive, **DOCUMENTED**):  
`reportId`, `rrdId`, `nmId`, `vendorCode`, `sku`, `title`, `docTypeName`, `sellerOperName`, `rrDate`, `saleDt`, `orderDt`, `quantity`, `retailAmount`, `retailPrice`, `forPay`, `ppvzSalesCommission`, `deliveryService`, `deliveryAmount`, `returnAmount`, `paidStorage`, `paidAcceptance`, `penalty`, `deduction`, `acquiringFee`, `ppvzReward`, `vw`, `rebillLogisticCost`, `srid`, `bonusTypeName`, offices, promo/loyalty fields, …

This is the same economic family as portal weekly **detailed** Excel (~80 columns). (**REPOSITORY EVIDENCE** Sprint 7.5.)

---

## 13. wb_finance Mapping

Existing persistence model (**REPOSITORY EVIDENCE**): one API row fans out into multiple `wb_finance` lines via `mapFinanceRowsFromReport`, unique on `(marketplace_account_id, source_key)` where `source_key = rrd:{rrdId}:{suffix}`.

| Reports / V1 field | wb_finance target | Transformation | Confidence |
|--------------------|-------------------|----------------|------------|
| `rrdId` | `rrd_id`, key prefix | integer | **High** — **DOCUMENTED** + mapper |
| `reportId` | `realizationreport_id` | number | **High** — release notes map to v5 `realizationreport_id` |
| `nmId` | `nm_id` / product lookup | number | **High** |
| `vendorCode` | (not a dedicated column; used in product identity elsewhere) | — | N/A for line amount |
| `rrDate` | `operation_date` (prefer), `rr_dt` | date | **High** |
| `saleDt` | fallback for `operation_date` | date | **High** |
| `sellerOperName` | `supplier_oper_name` | string | **High** |
| `docTypeName` | return sign for `for_pay` | sale vs return | **High** |
| `forPay` | suffix `for_pay` → Revenue family | parse money; return → negative | **High** |
| `ppvzSalesCommission` | `commission` | abs money | **High** |
| `paidStorage` | `storage` | abs money | **High** |
| `paidAcceptance` | `acceptance` | abs money | **High** |
| `penalty` | `penalty` | abs money | **High** |
| `deduction` | `deduction` | abs money | **High** |
| `acquiringFee` | `acquiring_fee` | abs money | **High** |
| `ppvzReward` | `ppvz_reward` | abs money | **High** |
| `additionalPayment` | `additional_payment` | abs money | **High** |
| `vw` | `ppvz_vw` | abs money | **High** |
| `rebillLogisticCost` | `return_logistics` | abs money | **High** |
| `deliveryService` / `deliveryAmount` | `delivery_rub` / logistics | **Do not invent** | **Uncertain** — left unmapped in V1 normalizer |
| `srid` | `srid` | string | **High** |
| `sku` / barcode | not on `WbFinance` row today | — | **Gap** (metadata unused) |
| `quantity` | not on `WbFinance` | — | **Gap** |
| `retailAmount` | not a finance line suffix | optional on normalized API row only | **Partial** |

### Fields Reports can provide that wb_finance does not store

Many detailed metadata fields (warehouse, office, promo IDs, KIZ, acquiring bank, etc.) — **DOCUMENTED** on API, **not** in `WbFinance`. Acceptable for Phase 1 if Financial Engine only needs fee suffixes + for_pay + dates + nm/srid/report id.

### Fields wb_finance needs that Reports alone cannot provide

| Need | Source |
|------|--------|
| Product cost | Internal cost history |
| Advertising spend | Ads APIs / tables |
| Estimated Tax base `finishedPrice` | **Sales API** (`wb_sales`) — dual tax model unchanged |
| Marketplace Fee from Sales − Sales forPay | **Sales API**, not Finance Reports |

---

## 14. Accounting Coverage

Canonical Financial Engine V4 (unchanged):

| Metric | Formula / source | Reports sufficient? |
|--------|------------------|---------------------|
| Sales | Σ(`priceWithDisc`) | **No** — Sales API |
| Marketplace Fee | Sales − Sales API forPay | **No** — Sales API |
| **Revenue** | Σ(Finance `ppvz_for_pay`) | **Yes** — detailed `forPay` → `for_pay` lines |
| Estimated Tax | Tax% × Σ(`finishedPrice`) | **No** — Sales API (intentional dual model) |
| Logistics / Storage / Acceptance / Penalties / Other | Finance fee lines | **Mostly yes**; **logistics mapping uncertain** until `delivery_*` proven |
| Advertising | Ads | **No** |
| Net Profit | Revenue − costs − tax − ads… | Reports supply Finance half only |

**Verdict on accounting:** Reports detailed ingestion is **necessary and sufficient for the Finance half** of FE V4 (Revenue + WB fee lines we already model). It does **not** replace Sales or Ads. That is expected and correct.

Reconciliation bridge: list `forPaySum` vs Σ(detailed `forPay`) before accepting a week (**design**; helper already sketched offline).

---

## 15. Account 2 Recovery Strategy (Reports-oriented)

### Target

Fill Finance from **MAX 2026-06-28** forward, starting with week **2026-06-29 → 2026-07-05**, then subsequent weeks through the required horizon.

### Safest strategy (recommended)

```text
Prerequisites (separate controlled ops — not this research task):
  • Personal/Service + Finance token saved on Account 2 only
  • ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE=true
  • FINANCE_V1_LIVE_REQUESTS_ENABLED only for authorized wakes
  • No Statistics V5 fallback
  • Cooldown / serverRetryUntil cleared or honored

Per wake (max 1 HTTP):
  1. Validate reservation, lock, schema, timing gate
  2. Persist lastFinanceRequestAt BEFORE HTTP
  3. Either:
       A. list (weekly) for control inventory of next unimported week, OR
       B. detailed page for active week (rrdId cursor)
     — never both in the same wake initially
  4. Capture Remaining/Limit/Reset/Retry; fail closed on 429 / missing headers
  5. On detailed success: UPSERT lines; advance cursor only after persist
  6. When week pages complete (204/empty): reconcile vs list totals; mark week imported
  7. Exit
```

This is **Reports ingestion**, not “hammer Finance V1 until history is full.” Throughput is inherently ~1 request/minute when Remaining allows — plan calendar time accordingly.

### Explicit non-goals

- Do not resume Statistics V5 for Account 2 Finance.
- Do not auto multi-page wakes until many controlled successes.
- Do not invent logistics from uncertain fields.
- Do not use Documents API as Finance ledger.
- Do not upload Excel as primary path.

---

## 16. Idempotency Strategy

| Rule | Detail | Class |
|------|--------|-------|
| Stable line identity | `source_key = rrd:{rrdId}:{suffix}` | **REPOSITORY EVIDENCE** |
| Uniqueness | `(marketplace_account_id, source_key)` | **REPOSITORY EVIDENCE** |
| Write mode | UPSERT only — never DELETE/replace-all | **REPOSITORY EVIDENCE** / safety protocol |
| Cursor advance | Only after successful UPSERT | Architecture |
| Re-download same report | Safe if UPSERT; duplicates must be 0 | Design |
| Report-level tracking | Persist imported `reportId` + week key in recovery progress / sync audit | Design (finance-sync-v2 already thinks in reportIds) |

Do **not** invent a new key namespace unless `rrdId` collision across report types is proven — currently **UNKNOWN**; existing Account 1/2 keys already use `rrd:` successfully.

---

## 17. Account Isolation

| Requirement | Status |
|-------------|--------|
| All UPSERTs scoped `marketplace_account_id = '2'` | Required |
| Token from Account 2 credentials only | Required |
| Account 1 Finance / token / quotas untouched | Required |
| Competing Account 2 Finance paths blocked while campaign reserved | Already designed (CC, syncFinance, Finance Sync V2, warehouse, KPI) |
| Operator CLIs can still bypass if manually run | Residual risk — do not run against Account 2 |

---

## 18. Unknowns

1. Whether Account 2’s registration country can use `detailed/{reportId}` or must use period detailed only.  
2. Whether Finance V1 can apply multi-day Reset (Statistics-style) for Account 2.  
3. Exact equivalence of `deliveryService` / `deliveryAmount` ↔ historical `delivery_rub`.  
4. Whether list + detailed share one seller-global finance bucket.  
5. Whether Documents categories ever include weekly finance Excel binaries suitable for parsing.  
6. Whether report rows are immutable after `createDate` or can be revised (late adjustments).  
7. Account 2-specific `reportId`s for week 2026-06-29 (exist for Account 1; Account 2 not fetched successfully).

---

## 19. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Believing “Reports” means a non-rate-limited channel | High | Treat Finance V1 quotas as binding |
| Using Base token | High | Reject before HTTP |
| Falling back to Statistics V5 | High | Hard-block Account 2 recovery |
| Retry storms | High | maxRetries=1; one page/wake |
| Inventing logistics mapping | Medium | Leave unmapped until proven |
| Confusing Documents API with Sales Reports | Medium | Separate token category; different purpose |
| Enabling live flag without token save | High | Pre-live checklist |
| Operator CLI bypass | Medium | Procedural ban during campaign |

---

## 20. Final Architecture Recommendation

### Verdict

**A. YES** — Wildberries **Financial Reports (Sales Reports V1)** can completely replace the problematic Statistics V5 Finance recovery path as the authoritative ingestion source for Account 2 `wb_finance`.

This is **not** “YES, there is a third unlimited Reports API.” It is **YES, the official Reports API is Finance V1 sales-reports**, and that is the correct source.

### Specification card

| Item | Value |
|------|-------|
| Endpoint (lines) | `POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed` |
| Endpoint (control) | `POST …/sales-reports/list` (`period=weekly`) |
| Optional | `POST …/sales-reports/detailed/{reportId}` when country allows |
| Report type | Weekly sales/realization reports (`period=weekly`; import both `reportType` 1 and 2 if present) |
| Token | Personal or Service + **Finance** category |
| Historical | Detailed-by-period since 2024-01-29; list since 2025-01-01 (**DOCUMENTED**) |
| First missing week | `2026-06-29` → `2026-07-05` (calendar week proven published for Account 1) |
| Pagination | `rrdId` cursor; limit ≤ 100000; 204/empty ends |
| Rate limit | 1 req/min, burst 1 (**DOCUMENTED**); honor Reset/Retry; multi-day Reset **UNKNOWN** |
| Row identity | `rrd:{rrdId}:{suffix}` UPSERT |
| Mapping | Existing V1→mapper; logistics uncertain |
| Import strategy | Report discovery → one detail page per wake → UPSERT → cursor → reconcile |
| Isolation | Account 2 only; reservation active; no Account 1 writes |
| Deprecated path | Statistics v5 `reportDetailByPeriod` — banned for Account 2 recovery |

### Answer to the strategic question

**Yes — stop fighting Statistics V5.** Populate Account 2 Finance from Wildberries **Financial Reports** via the Sales Reports API. Accept that this still requires **disciplined, sparse** Finance-host requests under a hard quota. The win is **correct product surface + official API + report-shaped control**, not unlimited throughput.

---

## Appendix A — Answers to investigation checklist (A–P)

| # | Question | Answer | Class |
|---|----------|--------|-------|
| A | Portal “Reports” | Weekly settlement summary + weekly detailed ledger | **REPOSITORY EVIDENCE** |
| B | API endpoints | Finance V1 sales-reports list/detailed; Documents separate | **DOCUMENTED** |
| C | Weekly financial via API | Yes — `period=weekly` | **DOCUMENTED** |
| D | Historical programmatic | Yes within documented windows | **DOCUMENTED** |
| E | Transaction-level rows | Yes — detailed | **DOCUMENTED** |
| F | Sufficient for wb_finance | Yes for modeled suffixes; logistics uncertain | **REPOSITORY EVIDENCE** + **UNKNOWN** logistics |
| G | Arbitrary historical weeks | Within windows | **DOCUMENTED** |
| H | Auto vs request-generate | Listed after WB creates; no generate API documented for sales-reports | **DOCUMENTED** / **INFERENCE** |
| I | List endpoint | Yes | **DOCUMENTED** |
| J | Detail/download | Yes (JSON detail; not Excel binary API) | **DOCUMENTED** |
| K | Rate limits | 1/min burst 1 | **DOCUMENTED** |
| L | Different from Statistics v5? | Different host/path; **similar published quota**; punitive multi-day Reset on V1 **UNKNOWN** | Mixed |
| M | Pagination | offset/list; rrdId/detailed | **DOCUMENTED** |
| N | Incremental | By week / reportId / rrdId | **DOCUMENTED** |
| O | Safe re-download | Yes with UPSERT | **INFERENCE** + unique key **REPOSITORY EVIDENCE** |
| P | Immutable after publish | **UNKNOWN** | |

---

## Appendix B — This research task safety record

| Constraint | Result |
|------------|--------|
| Wildberries API calls | **0** |
| Production DB writes | **0** |
| Recovery / probe / cron | **0** |
| Code / env / progress / token changes | **0** (documentation file only) |

---

*End of final research. Implementation of Reports-oriented Account 2 ingestion is a separate controlled task.*
