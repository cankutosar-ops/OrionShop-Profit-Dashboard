# Phase 7 — Reports & Business Intelligence

# Master Blueprint

**Status:** Official architectural reference — **final product decisions locked**  
**Implementation:** None until Sprint 7.1 is explicitly started  
**Baseline:** Dashboard architecture is stable and production-ready  
**Phase 6 (Inventory):** Officially frozen  
**Last revised:** 2026-07-21 (final documentation gate before Sprint 7.1)

This document is the **master blueprint** for every future Reports sprint.  
All Phase 7 work must comply with it. Deviations require explicit approval.

---

# Part I — Permanent Standards

## 1. WB Dashboard Engineering Principles

The following principles are **permanent project standards**.  
Every architectural and implementation decision in Phase 7 (and beyond) must comply with them.

| # | Principle |
|---|-----------|
| 1 | **Business correctness over implementation speed.** |
| 2 | **Existing dashboard architecture is stable.** |
| 3 | **Never redesign existing modules unless explicitly approved.** |
| 4 | **Never duplicate business logic.** |
| 5 | **One calculation has one owner.** |
| 6 | **Reports never calculate business data.** Reports present existing business knowledge. |
| 7 | **Every layer has a single responsibility.** |
| 8 | **Reuse before creating.** |
| 9 | **Architecture evolves incrementally.** |
| 10 | **Prefer simplicity over speculative abstractions.** |
| 11 | **Every abstraction must solve a real business problem.** |
| 12 | **Breaking existing workflows requires explicit approval.** |

### Architecture Guardrails (derived from the principles)

| Guardrail | Current baseline |
|-----------|------------------|
| Navigation | Fixed sidebar: Dashboard, Reports, Product Analytics, Cost Management, Inventory, Smart Pricing, Purchases, Settings |
| Routing | Next.js App Router under `src/app/`; legacy `/profit-v3` → `/` |
| Module boundaries | Modules keep their routes and layouts; Inventory sub-tabs stay in-page |
| Scope | `FILTER_PARAMS` + `resolveScopedDateRange` only |
| Business logic | Owned by `src/lib/` + `src/services/`; Reports does not fork formulas |
| Data access | `persisted-query-service.ts` shared by Dashboard and Reports |
| Reports surface | Extends `/reports` only — does not redesign the dashboard |

---

## 2. Design Philosophy

### Dashboard explores. Reports communicate.

| Surface | Role |
|---------|------|
| **Dashboard** | Where users **explore and analyze** data — interactive filters, sync, drill-down, operational decisions |
| **Reports** | Where users **receive professional business documents** generated from trusted dashboard data |

**Reports are NOT another dashboard.**

Reports are professional business documents.  
They never calculate business logic.  
They present existing business knowledge in a structured, shareable format.

### Phase 7 final goal

When Phase 7 is complete, the business should **no longer need to prepare its current management Excel manually**.  
The dashboard generates that document automatically from trusted services.

### Reports must never

- Duplicate calculation engines
- Grow into a second exploration UI with sync, competing KPIs, or parallel workflows
- Introduce report-only SQL or report-only profit math
- Change how users interact with existing modules
- Generate an empty workbook when the selected period has no business data

### Reports must always

- Consume **trusted** outputs from existing dashboard / module services
- Preserve global scope consistency
- Remain **read-only** (no sync triggers from Reports)
- Present and serialize — never recalculate
- Fail clearly when there is nothing meaningful to report (see §14 No-Data Behaviour)

### Canonical data flow

```
Dashboard Services
        ↓
   ReportPayload
        ↓
  Report Template
        ↓
   Excel Export
```

| Layer | Owns | Must not own |
|-------|------|--------------|
| **Dashboard Services** | Business truth (already calculated) | Report layout / file bytes |
| **Report Engine** | Registry lookup, provider sequencing, payload assembly, version stamping, no-data gate | SQL, formulas, aggregations |
| **Report Providers** | Thin `scope → existingService()` adapters | Business math |
| **Templates** | Sections, worksheets, columns, layout, translation keys, version metadata | Data fetching / calculation |
| **Export Adapters** | File structure, formatting, branding tokens, optional charts | Business metrics |
| **Snapshot layer** *(future)* | Immutable capture of business state used for a generation | Live recalculation |
| **Artifact layer** *(future)* | Stored outputs, delivery, history | Calculation |

**No additional calculation layer. No duplicated business logic.**

**The Report Engine orchestrates. Dashboard Services calculate. Templates present. Export Adapters serialize.**  
Each layer has exactly one responsibility.

---

# Part II — Engine Architecture

## 3. Vision & Goals

### Vision

Phase 7 turns `/reports` into a **template-driven document factory**.  
Every business document (Business Report, Product Report, Financial Report, Inventory Report, Executive Report, etc.) is a **versioned template** applied by one shared Report Engine — not a bespoke pipeline per report.

### Goals

1. Single source of truth — reuse existing dashboard services and libs  
2. Zero duplicate calculations  
3. Template-driven, versioned output  
4. Scope / period consistency with the dashboard  
5. Excel-first professional workbooks (other formats via Export Adapters)  
6. Incremental delivery — lightweight 7.1, one report family per sprint thereafter  
7. Replace the manually prepared management Excel with an automated Business Report  

### Non-goals until explicitly scheduled

- Snapshot persistence (reserved; live data in early sprints)  
- Scheduled execution, email, artifact storage (Sprint 7.8)  
- PDF adapter implementation (Sprint 7.8)  
- Full multi-language runtime (keys from day one; resources mature in 7.7)  
- New database migrations unless a later sprint (e.g. Snapshots/Artifacts) is approved  
- Sidebar / routing / module redesign  
- Reproducing every dashboard chart inside Excel  

---

## 4. Report Engine (Sprint 7.1 — intentionally simple)

### 4.1 YAGNI for Sprint 7.1

Sprint 7.1 introduces **only**:

| Deliverable | Purpose |
|-------------|---------|
| Report Engine | `runReport()` / `exportReport()` orchestration |
| Template Registry | Versioned template definitions |
| Report Providers | Thin adapters to existing dashboard services |
| `ReportPayload` | Typed, versioned document model |
| Export Adapter | Formal serialization interface |
| Excel Export | First adapter implementation |
| Report Versioning | Metadata on registry + payload |
| No-data gate | Refuse empty generations with a clear user message |

Everything else in this blueprint is **future architecture** until a sprint needs it.

### 4.2 Current codebase foundation

| Asset | Role today |
|-------|------------|
| `src/app/reports/page.tsx` | Catalog / roadmap UI |
| `src/app/reports/product-profit/page.tsx` | First live report page |
| `src/services/reports-query-service.ts` | Finance categories + Model B/C |
| `src/services/reports-product-profit-service.ts` | Product P&L rows |
| `src/services/reports-export-service.ts` | CSV/JSON formatters (no math) |
| `src/components/reports/reports-header.tsx` | Scope filters only — no sync |

No central orchestrator exists yet. Sprint 7.1 adds one **without** moving business logic out of existing services.

### 4.3 Target shape

```
Reports UI (/reports/*)
        │
        ▼
Report Engine
  • resolve template + version
  • resolve period (scope)
  • run providers (existing dashboard services)
  • no-data gate (abort if period has no business data)
  • optional ReportRunContext (optimization only)
  • assemble ReportPayload
  • dispatch Export Adapter
        │
        ▼
Dashboard / module services
        │
        ▼
persisted-query-service
```

### 4.4 Minimal file layout (7.1)

```
src/lib/reports/
  report-engine-types.ts
  report-engine.ts
  report-template-registry.ts
  report-providers.ts
  excel/excel-export-adapter.ts

src/app/api/reports/generate/route.ts
src/app/reports/…          # catalog + preview routes as needed
```

Split provider files or design-system packages only when a later sprint justifies it.

### 4.5 Core types (conceptual)

```typescript
type ReportTemplateId = string;
type ReportTemplateVersion = number;
type ReportTemplateStatus = "draft" | "active" | "deprecated";

/** Reporting period is always expressed as scoped from/to — presets only help pick the range. */
type ReportRequest = {
  templateId: ReportTemplateId;
  templateVersion?: ReportTemplateVersion; // omit → default active version
  scope: ScopedDateRange;
  /** UI preset that produced the range (does not change template structure). */
  periodPreset?:
    | "weekly"
    | "monthly"
    | "quarterly"
    | "last_6_months"
    | "yearly"
    | "custom";
  options?: Record<string, unknown>;
  dataMode?: "live" | "snapshot"; // 7.1: always live
  locale?: "en" | "ru" | "tr";
};

type ReportSection<T = unknown> = {
  id: string;
  titleKey: string; // e.g. "report.sales.totalRevenue"
  data: T;
};

/** Standard identity + freshness metadata on every payload — see §15. */
type ReportIdentity = {
  reportName: string;
  company: string;
  marketplace: string;
  account: string;
  reportingPeriod: { from: string; to: string; presetLabel?: string };
  currency: string;
  generatedAt: string;
  templateVersion: ReportTemplateVersion;
  lastSuccessfulSyncAt: string | null;
};

type ReportPayload = {
  templateId: ReportTemplateId;
  templateVersion: ReportTemplateVersion;
  generatedAt: string;
  scope: ScopedDateRange;
  periodPreset?: string;
  locale: string;
  snapshotId: string | null;
  /** Standard report identity + freshness — see §15. Not a worksheet. */
  identity: ReportIdentity;
  sections: ReportSection[];
  meta?: { warnings?: string[]; rowCounts?: Record<string, number> };
};

/** Returned instead of a file when the period has no reportable business data. */
type ReportNoDataResult = {
  ok: false;
  code: "NO_DATA_FOR_PERIOD";
  messageKey: string; // localized user-facing explanation
  scope: ScopedDateRange;
};
```

### 4.6 Provider rule

```typescript
// Correct — same function the dashboard page uses
{ sectionId: "overview", fn: (scope) => getOverviewMetrics(scope) }

// Forbidden — report-owned calculation or raw SQL
{ sectionId: "overview", fn: (scope) => customRollup(await fetchSalesInRange(scope)) }
```

**Reports never calculate business data.**

---

## 5. Report Versioning

### 5.1 Purpose

Templates evolve. Historical exports must remain interpretable after layout or section changes.

### 5.2 Template metadata (required)

Every registry entry includes:

| Field | Meaning |
|-------|---------|
| **Template ID** | Stable family id (e.g. `business-report`) |
| **Version** | Integer revision (`1`, `2`, …) |
| **Created Date** | When this version was registered |
| **Status** | `draft` \| `active` \| `deprecated` |

Example: **Business Report v1** (`templateId: "business-report"`, `version: 1`, `status: "active"`).

### 5.3 Coexistence

- Shipping **v2** does not delete **v1**.
- Requests may pin a version for reproducibility.
- Omitting version selects the registry default (latest **active**).
- Every `ReportPayload` and Excel Report Info / Cover sheet records `templateId` + `templateVersion`.

### 5.4 Sprint 7.1

Implement metadata fields and stamp them on payloads/exports.  
Multi-version lifecycle tooling (UI for deprecated versions, artifact replay) remains future work.

---

## 6. Snapshot Strategy

### 6.1 Problem

A report reflects business state **at generation time**. Later cost updates, corrections, or recalculations must not silently rewrite the meaning of a previously shared document.

### 6.2 Reserved flow

```
Business Data (services / persisted queries)
        ↓
   Snapshot          ← immutable capture (future)
        ↓
  ReportPayload
        ↓
    Export
```

Live mode (Sprint 7.1+ until Snapshots ship):

```
Dashboard Services → ReportPayload → Template → Excel Export
(snapshotId = null)
```

### 6.3 Engine integration (future)

| Concern | Live | Snapshot |
|---------|------|----------|
| Request | `dataMode: "live"` | `dataMode: "snapshot"` + optional `snapshotId` |
| Inputs | Providers call live services | Engine reads frozen snapshot |
| Payload | `snapshotId: null` | `snapshotId` set |
| Export | Same adapters | Same adapters |

### 6.4 Sprint 7.1 policy

- Use **live** data.
- Reserve `snapshotId` on `ReportPayload`.
- Do **not** implement snapshot storage or capture pipelines.
- Document that early exports are point-in-time live reads, not immutable archives.

Implement Snapshots only when a concrete business need requires reproducible historical packs (e.g. locked accounting periods, scheduled packs).

---

## 7. ReportRunContext (optimization layer)

### 7.1 Role

`ReportRunContext` is an **optional optimization**: a per-generation bag that can hold a once-loaded scoped SQL result, WB strip, or similar shared inputs so composite templates do not refetch the same scope repeatedly.

### 7.2 Sprint 7.1 posture

- **Do not** require `ReportRunContext` for the foundation to ship.
- Providers may call services directly.
- Introduce context **only** where profiling shows measurable duplicate-fetch cost on a real template (likely starting with Business / Executive composites).

### 7.3 Rule

`ReportRunContext` never owns business formulas. It only caches **trusted service outputs** for the duration of one `runReport()` call.

---

## 8. Export Adapter

### 8.1 Abstraction

All exporters consume the **same** `ReportPayload`.  
Adapters **never calculate**.

```typescript
type ExportFormat = "xlsx" | "csv" | "json" | "pdf";

type ExportAdapter = {
  format: ExportFormat;
  render(payload: ReportPayload): Promise<ArrayBuffer | string>;
};
```

### 8.2 Adapter roadmap

| Format | When |
|--------|------|
| **Excel (xlsx)** | Sprint 7.1 |
| **CSV / JSON** | Extend existing `reports-export-service` patterns as needed |
| **PDF** | Sprint 7.8 |

### 8.3 Responsibility boundary

Adapters resolve translation keys → strings, apply design tokens / number formats, write worksheets, and optionally embed a small number of charts.  
They do not call finance engines, inventory aggregations, or Supabase.

---

## 9. Report Artifact (reserved)

### 9.1 Purpose

A **Report Artifact** is a stored result of a generation: the file (or object storage key), metadata, and linkage to template version / snapshot / scope.

### 9.2 Future capabilities (no implementation now)

- Scheduled Reports  
- Email Delivery  
- Download History  
- Long-term Storage  

### 9.3 Conceptual shape

```typescript
type ReportArtifact = {
  id: string;
  templateId: string;
  templateVersion: number;
  snapshotId: string | null;
  scope: ScopedDateRange;
  locale: string;
  format: ExportFormat;
  storageKey: string;
  generatedAt: string;
  generatedBy?: string;
};
```

Sprint 7.1 returns files directly to the browser.  
Artifact persistence belongs to Sprint **7.8 (Automation)**.

---

## 10. Localization

### 10.1 Requirement

Reports must support:

- **Turkish** (`tr`)
- **English** (`en`)
- **Russian** (`ru`)

### 10.2 Translation keys — never hardcode labels

Templates and adapters use keys, not literal UI strings.

```
report.sales.totalRevenue     ✅
"Total Revenue"               ❌  (as long-term pattern)
```

### 10.3 Resolution

```
titleKey / headerKey / messageKey
    → localization resources (en / ru / tr)
    → resolved string for Export Adapter / preview UI / no-data message
```

### 10.4 Sprint guidance

| Phase | Posture |
|-------|---------|
| 7.1–7.6 | Define keys in templates; English resource map is acceptable as the first file |
| 7.7 | Full resource sets + design system localization |
| Later | Locale picker on export |

---

## 11. Report Design System

Reports need a **consistent visual identity** across Excel (and later PDF).

### 11.1 A report is not a single worksheet

Business documents should be designed as **professional workbooks** — multiple worksheets with a clear narrative.

Typical Business Report worksheet structure (**design guideline only** — exact sheets are chosen per template version):

| Worksheet | Intent |
|-----------|--------|
| **Cover** | Displays Report Identity + Data Freshness metadata; company/period framing |
| **Executive Summary** | Period KPIs and narrative highlights |
| **Financial Summary** | Profit, settlement, fee structure |
| **Marketplace Analysis** | Channel / account performance |
| **Product Analysis** | Top movers, risk SKUs |
| **Inventory Summary** | Stock health and value signals |

Other report families (Product, Financial, Inventory, Executive) may use a different sheet set while sharing the same design tokens.

### 11.2 Charts (optional, high-value only)

- The **dashboard** remains the primary place for interactive analysis.
- Reports may include a **small number** of high-value charts that improve readability of the document.
- Do **not** attempt to reproduce every dashboard chart in Excel.
- Charts are presentation aids inside the Export Adapter / Design System — never a second calculation path.

### 11.3 Tokens & patterns to define (progressively)

| Area | Intent |
|------|--------|
| **Typography** | Title, section header, table header, body, footnote sizes/weights |
| **Colors** | Header fill, borders, zebra rows, KPI positive/negative, brand primary |
| **KPI cards** | Label + value + optional subtitle layout for summary sheets |
| **Tables** | Header row, alignment rules, column width conventions |
| **Number formatting** | Integers, decimals, percentages |
| **Currency formatting** | Ruble (and future currencies) with consistent separators |
| **Date formatting** | ISO vs locale-aware display rules |
| **Charts** | Optional, sparse, high-value only |
| **Branding** | Logo placement, company display name, footer |
| **Theme support** | Reserved `ReportTheme` for white-label / partner branding |

### 11.4 Delivery timing

| Sprint | Design system work |
|--------|--------------------|
| **7.1** | Minimal: Cover / Report Info sheet, consistent columns, basic number formats |
| **7.2–7.6** | Apply the same workbook conventions per template |
| **7.7** | Formalize shared tokens, branding, localization, white-label prep |

### 11.5 Analytical vs operational Excel

| Kind | Examples | Ownership |
|------|----------|-----------|
| Analytical reports | Business, Product, Financial, Inventory, Executive exports | Report Engine + Design System |
| Operational templates | Cost / purchase upload templates | Stay domain-specific — **not** Report Engine |

---

# Part III — Data, Periods & Behaviour

## 12. Data Source Mapping

### 12.1 Module → trusted service

| Module | Route | Services Reports may reuse |
|--------|-------|----------------------------|
| Dashboard | `/` | `getDashboardCoreData`, `getOverviewMetrics`, `loadDashboardWbStrip`, `getCategoryProfitability`, `getDashboardListData` |
| Reports (existing) | `/reports/*` | `getProductProfitReport`, `getFinanceCategoryReport` |
| Product Analytics | `/analytics/products` | `getProductAnalytics`, `getProductSkuAnalytics` / funnel metrics |
| Smart Pricing | `/analytics/pricing` | `getSmartPricingInputs` only |
| Inventory | `/inventory` | `getInventoryReport` |
| Warehouse Sales | `/inventory/warehouse-sales` | `getWarehouseSalesAnalytics` |
| Intelligence | `/inventory/intelligence` | `getInventoryIntelligence` |

### 12.2 Persisted query layer

All SQL reads flow through `persisted-query-service.ts` via business services.  
Templates and adapters never query Supabase directly.

### 12.3 Calculation owners (one owner each)

| Domain | Owner |
|--------|-------|
| Model B | `profit-engine-model-b.ts` |
| Model C | `profit-engine-model-c.ts` |
| Settlement | `wb-settlement.ts` / `wb-settlement-service` |
| Product P&L | `product-profitability-builder.ts` |
| Dimension rollups | `dimension-profitability.ts` |
| Finance categories | `finance-rollup.ts` |
| Revenue resolution | `sales-revenue-resolution.ts` |
| Product analytics / funnel | `product-analytics.ts`, `product-funnel-metrics.ts` |
| Inventory / warehouse / intelligence | respective `src/lib/inventory-*` and `warehouse-sales-analytics.ts` |
| Smart Pricing | `smart-pricing*.ts` via `getSmartPricingInputs` |

### 12.4 Forbidden for Reports

| Do not call | Why |
|-------------|-----|
| Sync / job services | Mutations |
| Cost / purchase write & import paths | Mutations |
| Raw WB API / sync-service | Bypasses persisted contract |
| Decision simulator | Hypothetical, not persisted truth |

---

## 13. Reporting Periods

### 13.1 One report, many periods

The **report template does not change** when the user changes the period.  
Only the selected **date range** (`from` / `to` in scope) changes.

Supported period presets (UI helpers that resolve to a scoped range):

| Preset | Typical use |
|--------|-------------|
| **Weekly** | Short operational packs |
| **Monthly** | **Primary business use case** |
| **Quarterly** | Board / management reviews |
| **Last 6 Months** | Mid-horizon trends |
| **Yearly** | Annual packs |
| **Custom Date Range** | Ad-hoc investigations |

All presets resolve through the same scope pipeline (`FILTER_PARAMS` + `resolveScopedDateRange`).  
Providers always receive a concrete `ScopedDateRange` — they do not contain period-specific business formulas.

### 13.2 Generation flow

```
1. User opens /reports with company / account / brand + period in URL
2. Selects template → preview route (optional)
3. Export → POST /api/reports/generate
4. Engine:
     resolveScopedDateRange
     registry.get(templateId, version?)
     providers → existing dashboard services   (live; optional ReportRunContext later)
     no-data gate
     assemble ReportPayload
     Template structure → ExportAdapter.render
5. Browser downloads workbook
   — or —
   UI shows clear no-data message (no empty file)
```

Use **`ReportsHeader`** (no sync).  
Reconcile Excel totals to trusted on-screen values (0 ₽ tolerance for currency fields).

---

## 14. No-Data Behaviour

### 14.1 Rule

If the selected period contains **no business data** for the requested report:

- **Do NOT** generate an empty report / empty workbook.
- Return a **clear user-facing message** explaining that no data exists for the selected period.
- Prefer a structured engine result (`ReportNoDataResult`) over a blank download.

### 14.2 Detection (conceptual)

The engine (or a thin provider probe) determines emptiness from **existing service outputs** — for example zero row counts across required sections, or an explicit empty signal already returned by a dashboard service.

Detection must **not** invent a second “has data?” calculation path that diverges from dashboard truth.

### 14.3 UX

| Surface | Behaviour |
|---------|-----------|
| Preview | Show the no-data message in place of tables |
| Export | HTTP/API result with `NO_DATA_FOR_PERIOD` — no file bytes |
| Localization | Message via `messageKey` (en / ru / tr) |

Exact emptiness thresholds per template are defined when that template ships (starting with Business Report in 7.2).

---

## 15. Report Identity & Data Freshness

Product-level metadata on every generated report.  
This is **not** a worksheet and **not** a new engine layer — it is standard fields on `ReportPayload` that preview UI and Export Adapters must surface clearly.

### 15.1 Report Identity

Every generated report includes a standard **identity** block so users can tell reports apart when many are generated.

| Field | Purpose |
|-------|---------|
| **Report Name** | Human-readable template / document name |
| **Company** | Scoped company |
| **Marketplace** | Marketplace channel (e.g. Wildberries) |
| **Account** | Scoped marketplace account |
| **Reporting Period** | Selected `from`–`to` (and optional period preset label) |
| **Currency** | Currency of monetary figures in the document |
| **Generated At** | Timestamp when this report was generated |
| **Template Version** | Registry `templateVersion` for the template used |

Identity prevents confusion across companies, accounts, and periods.  
Cover / Report Info sheets and preview headers may **display** these fields; they remain payload metadata, not a separate report family or abstraction.

### 15.2 Data Freshness

Reports must make data currency transparent. Users should immediately understand:

1. **When was this report generated?** → **Report Generated At**  
2. **How fresh is the data behind this report?** → **Last Successful Data Synchronization**

| Field | Meaning |
|-------|---------|
| **Report Generated At** | Same as identity `Generated At` — when the document was produced |
| **Last Successful Data Synchronization** | Timestamp of the last successful sync for the scoped account / marketplace data that backs the report |

Read this value from **existing** sync / account status already available to the dashboard.  
Do **not** introduce snapshots, new synchronization logic, or a report-owned freshness calculator.

### 15.3 Presentation rule

| Surface | Expectation |
|---------|-------------|
| Preview | Identity + freshness visible before export |
| Excel | Shown on Cover / Report Info (or equivalent header block) — not a dedicated “Identity” worksheet requirement |
| Localization | Field labels via translation keys |

---

# Part IV — Report Families & Roadmap

## 16. Phase 7 Roadmap

| Sprint | Focus |
|--------|-------|
| **7.1** | Report Engine Foundation |
| **7.2** | Business Report |
| **7.3** | Product Report |
| **7.4** | Financial Report |
| **7.5** | Inventory Report |
| **7.6** | Executive Report |
| **7.7** | Report Design System |
| **7.8** | Automation |

---

### 7.1 Report Engine Foundation

- Report Engine  
- Template Registry (id, version, created date, status)  
- Report Providers  
- `ReportPayload`  
- Export Adapter + Excel Export  
- Report Versioning  
- Period presets wired through existing scope  
- No-data gate  
- Report Identity metadata on every payload  
- Data Freshness (Generated At + Last Successful Sync from existing sync status)  
- Snapshot / Artifact / full Design System / i18n runtime: **architecture only**  

---

### 7.2 Business Report

**Replaces** the earlier “Weekly Business Report” concept.  
**Template ID:** `business-report` (period-agnostic).

#### Business goal

The Business Report replaces the **manually prepared management Excel** currently used by the business.  
It represents the company’s **financial and operational performance** for the selected reporting period (monthly is the primary use case; weekly / quarterly / custom remain supported via the same template).

#### Expected narrative sections (design guideline)

- Cover  
- Executive Summary  
- Financial Summary  
- Marketplace Analysis  
- Product Analysis  
- Inventory Summary  

Exact metrics are composed exclusively from existing dashboard services (overview, profitability, settlement, fees, product and inventory read models).

---

### 7.3 Product Report

**Focus:** product-level decision making.

Example metrics (from existing dashboard / Product Analytics services — **no new calculations**):

| Metric | Expected owner domain |
|--------|------------------------|
| Revenue | Product profitability / analytics |
| Profit | Product profitability |
| Margin | Product profitability |
| Orders | Product funnel / analytics |
| Purchases | Product funnel / analytics |
| Conversion | `buildProductFunnelMetrics` / Product Analytics |
| Add to Favorites | Product Analytics engagement (when synced) |
| Add to Cart | Product Analytics engagement (when synced) |
| Return Rate | Product / sales analytics |
| Best-selling Size | Product analytics / SKU breakdown |
| Best-selling Color | Product analytics / SKU breakdown |
| Trends | Existing trend / period comparison services |

If a metric is not yet persisted (e.g. Favorites / Cart before Sales Funnel sync), the report must surface that honestly — not invent values.

---

### 7.4 Financial Report

- Accounting views  
- Settlement  
- Model B  
- Finance Categories  

All via existing finance / settlement / Model B services.

---

### 7.5 Inventory Report

- Inventory Summary  
- Warehouse  
- Stock Health  
- Inventory Value  

Via Inventory, Warehouse Sales, and Inventory Intelligence services delivered in Phase 6.

---

### 7.6 Executive Report

- Company KPIs  
- Trends  
- Risks  
- Recommendations  

A composite presentation of trusted service outputs for leadership — still **no new business formulas**.

---

### 7.7 Report Design System

- Shared workbook components  
- Excel design tokens (typography, colors, KPI cards, tables, formats)  
- Optional chart primitives (sparse, high-value)  
- Branding & theme support  
- Localization resources (tr / en / ru)  
- White-label preparation  

---

### 7.8 Automation

- Report Artifacts  
- Email Delivery  
- PDF Export Adapter  
- Scheduled Execution  
- Snapshot capture (when immutability is required for scheduled packs)  

---

## 17. Sprint Guardrails Checklist

Every sprint must pass:

- [ ] No sidebar / navigation redesign  
- [ ] No Model B / Model C / settlement formula changes  
- [ ] No duplicate business logic  
- [ ] Providers call existing dashboard services only  
- [ ] `templateId` + `templateVersion` stamped on every payload  
- [ ] Report Identity fields present on every generated report  
- [ ] Data Freshness shows Generated At + Last Successful Sync (existing sync status only)  
- [ ] No sync triggers from Reports  
- [ ] Export adapters perform no calculations  
- [ ] Currency reconciliations match trusted UI (0 ₽)  
- [ ] Empty periods produce a clear no-data message — never an empty workbook  
- [ ] Period presets only change the date range — never the template structure  

---

# Part V — Evolution

## 18. Architecture Evolution Principle

### Goal of Phase 7

Phase 7 is **not** about building the most sophisticated reporting platform on day one.  
It is about a **clean, maintainable, extensible** architecture that grows as real report types ship — until the business no longer needs its manual management Excel.

### How the architecture must evolve

1. **Architecture evolves incrementally.**  
2. **Avoid premature optimization.**  
3. **Avoid speculative abstractions.**  
4. **Introduce new layers only when real business complexity requires them.**  
5. **Prefer extending existing services over creating new ones.**  
6. **Simple architecture is preferred over sophisticated architecture.**  
7. **Keep the Report Engine small in Sprint 7.1.**  
8. **Follow YAGNI** — *You Aren't Gonna Need It.*  

### Decision test

Before adding a layer, dependency, or abstraction, answer:

1. Which shipped report or user workflow is blocked without it?  
2. Can an existing service or adapter solve it with a thin extension?  
3. If we skip it for one more sprint, what is the measurable cost?  

If the answers are weak: **document the reservation, do not build it yet.**

This evolution principle — together with the WB Dashboard Engineering Principles — guides **every future Reports sprint**.

---

# Appendices

## A. Existing Reports inventory

| Path | Role |
|------|------|
| `src/app/reports/page.tsx` | Catalog |
| `src/app/reports/product-profit/page.tsx` | Live product profit page |
| `src/services/reports-product-profit-service.ts` | Product P&L read model |
| `src/services/reports-query-service.ts` | Finance + Model B/C |
| `src/services/reports-export-service.ts` | CSV/JSON formatters |
| `src/components/reports/reports-header.tsx` | Scope-only header |
| `src/components/reports/product-profit-report-table.tsx` | Preview table |

## B. Scope reference

```
FILTER_PARAMS = { company, account, brand, from, to }
resolveScopedDateRange(params) → ScopedDateRange
```

Period presets (weekly, monthly, quarterly, last 6 months, yearly, custom) are UI helpers that set `from` / `to`.  
They do not create report-specific calculation modes.

## C. Reserved vs implemented (at a glance)

| Concept | Sprint 7.1 | Later |
|---------|------------|-------|
| Report Engine + Registry + Providers + Payload | Implement | — |
| Report Versioning metadata | Implement | Lifecycle tooling |
| Excel Export Adapter | Implement | Design System polish (7.7) |
| No-data gate | Implement | Per-template thresholds as families ship |
| Period presets via scope | Implement | — |
| Report Identity metadata | Implement | — |
| Data Freshness (Generated At + Last Successful Sync) | Implement (read existing sync status) | — |
| ReportRunContext | Optional optimization | When measured |
| Snapshots | Architecture only | When immutability required |
| Artifacts / schedule / email / PDF | Architecture only | 7.8 Automation |
| Localization keys | Define in templates | Full resources in 7.7 |
| Design System tokens / workbook sheets | Minimal Excel conventions | Formalized in 7.7 |
| Optional charts | Architecture only / sparse if needed | Design System (7.7) |

## D. Naming migration

| Former concept | Current concept |
|----------------|-----------------|
| Weekly Business Report | **Business Report** (`business-report`) — period-agnostic |
| Scheduled Reports (sprint title) | **Automation** (Sprint 7.8) |
| Product Performance Report | **Product Report** (Sprint 7.3) |

---

**Phase 6 (Inventory): OFFICIALLY FROZEN**  
**Phase 7 (Reports & BI): Master Blueprint — final (identity + freshness metadata locked); ready to commit after approval**
