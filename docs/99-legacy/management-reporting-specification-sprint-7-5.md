# Sprint 7.5 — Management Reporting Specification

**Status:** Master blueprint for Phase 7 Reporting (analysis only — no implementation)  
**Date:** 2026-07-23  
**Inputs analyzed:**
1. `Еженедельный отчет 2024-01-29 - 2026-07-05_1202289.xlsx` (Account 1 / seller `1202289`) — primary weekly settlement workbook  
2. `Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx` — newer export (same schema; one column name corrupted in this file)  
3. `Еженедельный детализированный отчет №771120066_68674 - 1.xlsx` — detailed line-level realization workbook (Orion / seller `68674`)  
4. `Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx` — detailed sample (Account 1)  
5. Current Reporting Engine (`src/lib/reporting/`) — Sprint 7.3–7.4  
6. Legacy Excel path (`src/lib/reports/`) — still present for export migration  

**Hard constraints honored:** no UI, no Excel/PDF generation, no Financial Engine / Dashboard calculation changes.

---

## 0. Executive verdict

Wildberries does **not** ship a management P&L workbook.

What sellers download as “Weekly Report” is a **settlement / cash-transfer instrument**:

| WB product | Sheets | Grain | Business question it answers |
|------------|--------|-------|------------------------------|
| **Еженедельный отчет** (Weekly Report) | 1 (`Sheet1`) | One row per weekly realization report | “How much will WB pay me for this week?” |
| **Еженедельный детализированный отчет** (Weekly Detailed Report) | 1 (`Sheet1`) | One row per finance operation line | “Which SKUs / ops produced that settlement?” |

Our Reporting Engine already targets a **superior management document** (profit after Product Cost + tax, brand/product contribution, inventory, trends).  
The correct strategy is:

| Strategy | Apply to |
|----------|----------|
| **Match** | Settlement identity, weekly cash narrative, trust/reconciliation vs WB |
| **Improve** | Brand/product contribution, margins, returns intelligence, inventory risk |
| **Replace** | Manual management Excel that staff currently assemble from WB + internal costs |

**Do not clone WB sheet-for-sheet.** Clone the *settlement truth*, then publish management intelligence WB never provides.

---

# Task 1 — Workbook analysis (worksheet-by-worksheet)

## 1.A Weekly Report — `Еженедельный отчет …_1202289.xlsx`

### Sheet: `Sheet1` (only sheet)

| Attribute | Detail |
|-----------|--------|
| **Sheet name** | `Sheet1` (portal export; not branded) |
| **Business purpose** | Weekly **seller settlement summary** — money WB assigns to the seller per realization report period |
| **Target audience** | Accountant / finance ops / owner reconciling bank payouts |
| **Primary metrics** | Продажа, К перечислению за товар, logistics, storage, acceptance, other holdings, penalties, **Итого к оплате** |
| **Dimensions** | Legal entity, report id, week start/end, report type (`Основной` / `По выкупам`) |
| **Filters** | Implicit: seller account + date range chosen at download |
| **Groupings** | Flat table — **no pivots**, no brand/SKU |
| **Pivot structure** | None |
| **Source dependencies** | WB realization / sales-reports list aggregates (same economic family as `reportDetailByPeriod`) |

### Why this sheet exists

WB’s portal answer to: **“What is the net payout for each closed week?”**  
It is intentionally **not** a profit report: no Product Cost, no advertising, no tax, no brand ranking, no inventory.

### Report types observed (Account 1, Jul–Jul span)

| Тип отчета | Count (2024-01-29→2026-07-05 file) | Meaning |
|------------|-------------------------------------|---------|
| **Основной** | 128 | Primary weekly settlement |
| **По выкупам** | 112 | Buyout-oriented companion report (same column schema) |

### Verified settlement identity (Основной rows)

```
Итого к оплате
  = К перечислению за товар
  − Стоимость логистики
  − Стоимость хранения
  − Общая сумма штрафов
  − Прочие удержания/выплаты
  − Стоимость операций на приемке
```

(Verified on first 50 rows of the clean Jul-12 export: 50/50 match within ₽0.05.)

Loyalty / VV-correction columns exist but were typically **0** on sampled Основной rows; they still belong in the field inventory for completeness.

### Columns (21)

| # | Column (RU) | English working name |
|---|-------------|----------------------|
| 1 | № отчета | Realization report id |
| 2 | Юридическое лицо | Legal entity |
| 3 | Дата начала | Period from |
| 4 | Дата конца | Period to |
| 5 | Дата формирования | Generated at (WB) |
| 6 | Тип отчета | Report type |
| 7 | Продажа | Net retail sales (sale − return retail) |
| 8 | …Компенсация скидки по программе лояльности | Loyalty discount compensation (subset of Продажа) |
| 9 | К перечислению за товар | Goods for-pay (net) |
| 10 | Согласованная скидка, % | Agreed discount % |
| 11 | Стоимость логистики | Logistics |
| 12 | Стоимость хранения | Storage |
| 13 | Стоимость операций на приемке | Acceptance |
| 14 | Прочие удержания/выплаты | Other holdings / payouts |
| 15 | Общая сумма штрафов | Penalties |
| 16 | Корректировка Вознаграждения Вайлдберриз (ВВ) | VV reward correction |
| 17 | Стоимость участия в программе лояльности | Loyalty program fee |
| 18 | Сумма баллов…лояльности | Loyalty points withheld |
| 19 | Разовое изменение срока перечисления… | One-time payout timing change |
| 20 | Итого к оплате | **Expected payout** |
| 21 | Валюта | Currency |

---

## 1.B Weekly Detailed Report — `Еженедельный детализированный отчет …xlsx`

### Sheet: `Sheet1` (only sheet)

| Attribute | Detail |
|-----------|--------|
| **Sheet name** | `Sheet1` |
| **Business purpose** | Line-level **realization ledger** explaining the weekly totals |
| **Target audience** | Ops analyst / category manager / finance reconciling SKU economics |
| **Primary metrics** | Retail, WB realized amount, VV reward, for-pay, delivery service, storage, penalties, holdings, PVZ compensation, acquiring compensation |
| **Dimensions** | Brand, nmId, supplier article, size, barcode, warehouse, office, country, SRID, supply number, subject (category-like) |
| **Filters** | Single realization report download |
| **Groupings** | Flat; intended for Excel pivot by Brand / SKU / Обоснование |
| **Pivot structure** | None built-in — **pivot-ready fact table** |
| **Source dependencies** | Same API family as finance sync (`reportDetailByPeriod` → `wb_finance`) |

### Why this sheet exists

Explains **how** the weekly settlement was built: sale vs return vs logistics-only vs storage vs penalty lines.

### Operation mix (sample Orion detailed file, 1743 rows)

| Обоснование для оплаты | Rows | Role |
|------------------------|------|------|
| Возмещение издержек по перевозке/по складским операциям… | 990 | Transport / warehouse cost reimbursement lines |
| Логистика | 543 | Customer delivery logistics |
| Продажа | 113 | Sale documents |
| Возмещение за выдачу и возврат на ПВЗ | 73 | PVZ issue/return compensation |
| Возврат | 8 | Returns |
| Хранение | 7 | Storage |
| Штраф | 5 | Penalties |
| Удержание | 4 | Holdings (large ₽ in sample) |

### Schema size

**83 columns** — transactional finance grain. Includes rating/promo KVW %, acquiring bank, customs, marking codes, wholesale flags, etc. Most are **operational metadata**, not management KPIs.

---

## 1.C What WB does *not* provide (critical)

Neither workbook contains:

- Product Cost / COGS  
- Advertising spend  
- Estimated tax / after-tax profit  
- Net margin / contribution %  
- Brand or category profitability tables  
- Inventory risk / days of cover  
- Orders / conversion (commercial funnel)  
- Multi-week trend charts as management narrative  
- Executive “what happened this week” story beyond settlement totals  

This gap is exactly why OrionShop Reporting exists.

---

# Task 2 — Field inventory

## 2.1 Weekly Summary fields → Orion ownership

| WB field | Business meaning | Financial meaning | Have today? | Owner | In FE V4? | Belongs in Reports? |
|----------|------------------|-------------------|-------------|-------|-----------|---------------------|
| № отчета | Realization report identity | Settlement key | Yes | `wb_finance.realizationreport_id` / sync state | Used for sync health | Yes — Appendix / Settlement |
| Юридическое лицо | Seller legal name | Entity | Partial | company / account metadata | No | Cover |
| Дата начала/конца | Week window | Period | Yes | scope / sales-reports list | Period only | Cover / Settlement |
| Дата формирования | WB generation time | Audit | Via API list | sales-reports list | No | Appendix |
| Тип отчета | Основной / По выкупам | Settlement subtype | Via API | sales-reports list | No | Settlement section |
| Продажа | Net retail | Customer-side sales volume | Related | Sales API / Model B gross/net sales family | Net Sales family (different definition) | Financial + Settlement bridge |
| Компенсация скидки лояльности | Loyalty subset of retail | Marketing/loyalty | Partial | finance categories | Adjustments/loyalty lines if mapped | Financial detail |
| К перечислению за товар | Goods settlement | **Revenue base for payout** | Yes | Finance `ppvz_for_pay` / Model B `revenue` | **Yes (`revenue`)** | Financial / Settlement |
| Согласованная скидка % | Discount rate | Pricing | Partial | detailed report / sales | Not a FE KPI | Optional Product |
| Стоимость логистики | Delivery cost | Deduction | Yes | `wb_finance` logistics | **Yes** | Financial / Logistics |
| Стоимость хранения | Storage | Deduction | Yes | storage | **Yes** | Financial / Logistics |
| Стоимость операций на приемке | Acceptance | Deduction | Yes | acceptance | **Yes** | Financial |
| Прочие удержания/выплаты | Other | Deduction/credit | Yes | adjustments / deductions | **Yes (`adjustments`)** | Marketplace Costs |
| Общая сумма штрафов | Penalties | Deduction | Yes | penalties | **Yes** | Marketplace Costs |
| Корректировка ВВ | VV correction | Commission adjust | Partial | finance VV lines | Via marketplace fee construction | Detail |
| Лояльность cost / points | Loyalty program | Deduction | Partial | finance | Often in adjustments | Detail |
| Разовое изменение срока… | Timing adjust | Non-P&L timing | Rare | API | No | Settlement note |
| **Итого к оплате** | Expected payout | Cash settlement | Yes | `expectedWbPayout` / Model B `sellerPayout` family | Seller Payout related | **Cash / Settlement** |
| Валюта | RUB | Currency | Yes | company.currency | N/A | Cover |

### Settlement vs Commercial Performance (important)

| Concept | WB Weekly | Orion Financial Engine V4 |
|---------|-----------|---------------------------|
| “Sales” | Продажа (retail net) | Gross/Net Sales from Sales API (`priceWithDisc`) |
| “To transfer for goods” | К перечислению за товар | Model B **Revenue** (`ppvz_for_pay`) |
| “Marketplace fee” | Implicit (Продажа − forPay family) | Explicit Marketplace Fee |
| “Payout” | Итого к оплате | Seller Payout / Expected WB Payout |
| “Profit” | **Not present** | Operating + Final Net Profit after PC + ads + tax |

Reports must **label both languages** so accountants and managers do not confuse them.

## 2.2 Detailed Report — high-value fields only

| Field group | Examples | Have today? | Owner | Reports use |
|-------------|----------|-------------|-------|-------------|
| Product identity | Brand, nmId, article, size, barcode | Yes | `products` / sales / finance | Brand / Product reports |
| Document class | Тип документа, Обоснование | Yes (mapped) | finance mappers → categories | Cost / Returns / Logistics |
| Money — sale | retail, WB realized, for-pay | Yes | sales + finance | Financial / Product |
| Money — VV / VAT | Вознаграждение ВВ, НДС | Partial | finance commission/VV | Cost detail (optional) |
| Money — acquiring | Компенсация платёжных услуг | Yes | acquiring | Marketplace Costs |
| Money — logistics | Услуги по доставке | Yes | logistics | Logistics |
| Money — storage / acceptance / penalty / hold | Хранение, Приемка, Штраф, Удержания | Yes | FE buckets | Financial |
| Ops metadata | warehouse, office, country, SRID | Partial | finance / warehouse analytics | Warehouse / Logistics advanced |
| Promo / rating KVW % | rating, promo, platform discounts | Mostly no | not first-class KPIs | Future pricing intelligence |
| Customs / marking / wholesale | declaration, marking, INN | No / N/A | — | Not management V1 |

**Rule:** Report V1–V2 consume **already-normalized FE / dashboard fields**, not the 83-column raw portal layout.

---

# Task 3 — KPI inventory

Legend: **A** = Available today · **D** = Derivable from context · **N** = Needs new implementation · **X** = Not applicable / out of scope

| KPI | Class | Source |
|-----|-------|--------|
| Gross Sales | A | FE V4 |
| Returned Sales | A | FE V4 |
| Net Sales | A | FE V4 |
| Revenue (ppvz_for_pay) | A | FE V4 |
| Marketplace Fee | A | FE V4 |
| Acquiring | A | FE V4 |
| Product Cost | A | FE V4 / cost history |
| Logistics | A | FE V4 |
| Storage | A | FE V4 |
| Acceptance | A | FE V4 |
| Penalties | A | FE V4 |
| Adjustments | A | FE V4 |
| Advertising | A | FE V4 / ads |
| Estimated Tax | A | FE V4 |
| Operating Profit | A | FE V4 |
| Final Net Profit | A | FE V4 |
| Seller Payout | A | FE V4 |
| After-tax Payout | A | FE V4 |
| Net Margin % | D | presentation helper on FE outputs |
| Orders / Purchases / Conversion | A | Dashboard overview |
| Units Sold / Returned / Return Rate | A | Dashboard quantity + OP |
| Expected WB Payout (Итого к оплате analogue) | A | settlement / expected payout services |
| Cash Received | A | cash-received service |
| WB Balance | A | balance service |
| Brand Revenue / Profit / Share | A/D | product rows + brand section (7.4) |
| Category Revenue / Profit | A | dashboard grouped views |
| ASP / Profit per unit | D | revenue÷units, profit÷units |
| Marketplace Fee % of Revenue | D | share helper |
| Logistics % of Revenue | D | share helper |
| Inventory Value (₽) | N | needs cost×stock service exposure |
| Inventory Turnover | N | needs sales÷avg stock definition |
| Weekly settlement table (Основной/По выкупам) | D/N | data exists via sales-reports list; **report section not composed yet** |
| Loyalty program fee / points | Partial | finance; not first-class KPI |
| VV correction explicit KPI | Partial | inside fee construction |
| Rating / promo KVW diagnostics | N | future |
| Slow / Fast movers | D/N | units + inventory daysLeft partial |
| Warehouse sales share | A | warehouse-sales analytics (not in Business V1 sections) |
| Sync freshness / lifecycle | A | sync metadata |

---

# Task 4 — Report comparison (WB vs Orion)

| Orion report | Overlaps WB sheets | Already covered | Missing vs WB | Orion stronger | WB stronger |
|--------------|--------------------|-----------------|---------------|----------------|-------------|
| **Business Report V1** | Settlement economics conceptually | FE P&L, brand, product, costs, logistics, returns, trends, inventory snapshot | Explicit weekly settlement table; Основной vs По выкупам; loyalty/VV detail lines | True profit (PC+tax), brand contribution, trends, inventory | Native payout identity & portal-trust language |
| **Product Report** (skeleton) | Detailed Brand/SKU grain | Product rankings (partial) | Full detailed justification mix; warehouse/office grain | Will add margin/returns intelligence | Raw 83-col operational completeness |
| **Financial Report** (skeleton) | Weekly summary economics | FE lines | Week-by-week settlement timeline | Tax/PC/ads included | Accountant-native payout table |
| **Inventory Report** (skeleton) | None | Stock status | — | Days left / risk statuses | — (WB weekly has no inventory) |
| **Executive Report** (skeleton) | Weekly totals spirit | Exec summary metrics | One-page weekly settlement headline | Narrative-ready KPIs | Simple payout number trust |

### Coverage score (management usefulness)

| Capability | WB Weekly | WB Detailed | Orion Business V1 |
|------------|-----------|-------------|-------------------|
| Settlement payout truth | ★★★★★ | ★★★☆☆ | ★★★☆☆ (needs dedicated section) |
| Commercial P&L | ★☆☆☆☆ | ★★☆☆☆ | ★★★★★ |
| Brand profitability | ☆☆☆☆☆ | ★★☆☆☆ (pivot DIY) | ★★★★☆ |
| Product performance | ☆☆☆☆☆ | ★★★☆☆ | ★★★★☆ |
| Inventory | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★☆☆ |
| Trends | ★★☆☆☆ (row timeline DIY) | ☆☆☆☆☆ | ★★★★☆ |

---

# Task 5 — Missing reporting opportunities (identify only)

| Opportunity | Why it matters | Data readiness |
|-------------|----------------|----------------|
| **Weekly Settlement Reconciliation** | Bridge Orion ↔ WB portal trust | High (sales-reports list + FE) |
| **Brand Profitability Report** (standalone) | Highest management ask | High (7.4 section exists) |
| **Category Profitability Report** | Assortment decisions | High |
| **Marketplace Cost Deep Dive** | Fee inflation control | High |
| **Logistics Performance Report** | Delivery cost per unit / warehouse | Medium–High |
| **Returns Intelligence Report** | Quality / size / brand return hotspots | Medium |
| **Executive Weekly Summary** | Monday meeting one-pager | High |
| **Inventory Risk Report** | Out/low stock + aging | Medium (value/turnover gaps) |
| **Product Lifecycle / Velocity** | Fast vs slow movers | Medium |
| **Contribution Analysis** | Pareto 80/20 | High (derivable) |
| **Cash Flow Summary** | Expected payout vs cash received vs balance | High |
| **Advertising ROI Report** | Ads vs profit | Medium |
| **Warehouse Sales Report** | Fulfillment mix | High (module exists) |
| **Tax / Payout Bridge** | Seller payout vs after-tax | High |
| **Multi-account Consolidated** | Holding view | Low–Medium |

---

# Task 6 — Reporting section matrix (roadmap)

| Report | Sections | Core KPIs | Required datasets | FE deps | Optional |
|--------|----------|-----------|-------------------|---------|----------|
| **Business** | Cover, Exec, Financial, Brand, Product, Costs, Logistics, Returns, Trends, Inventory, Appendix | Revenue, Net Profit, Margin, Orders, Units, Return Rate | ReportContext | Full Model B | Warehouse sales, prior-period |
| **Executive Weekly** | Cover, Week Headline, Settlement, Profit Bridge, Top Brand/Product, Risks, Appendix | Итого к оплате, Revenue, Net Profit, Δ wow | Overview + settlement list | Model B + payout | Insights text |
| **Financial** | Cover, FE P&L, Settlement Timeline, Cost %, Tax Bridge, Appendix | All Model B lines, Seller Payout | Overview + sales-reports | Model B | Loyalty/VV detail |
| **Brand Profitability** | Cover, Brand Table, Contribution, Cost Structure, Returns, Appendix | Rev, Profit, Margin, Shares, Fee%, Log% | Products (+ brands) | Product Model B rows | Category cross |
| **Product Performance** | Cover, Rank boards, Contribution, Cost outliers, Velocity, Appendix | Top/worst boards | Products + inventory | Product rows | Warehouse |
| **Inventory Risk** | Cover, Health, Out/Low, DaysLeft, Value, Appendix | OOS, Low, DaysLeft, Value | Inventory + costs | PC for value | Turnover |
| **Returns Intelligence** | Cover, Rate, Brand/SKU hotspots, Logistics on returns, Appendix | Return rate, units, value | Overview + products | returnedSales + qty | Size/warehouse |
| **Cash Flow** | Cover, Expected Payout, Cash Received, Balance, Gap, Appendix | Payout, Cash, Balance | Settlement services | Seller Payout | Bank export |

---

# Task 7 — Brand Profitability deep dive (specification)

## Purpose

Answer: **Which brands create (or destroy) economic value after marketplace reality and product cost?**

## Recommended KPIs (management-grade)

### Absolute
- Revenue  
- Units  
- Product Cost  
- Marketplace Fee  
- Logistics  
- Storage  
- Acceptance (if allocated)  
- Penalties / Adjustments (if allocated)  
- Advertising (if allocatable; else account-level footnote)  
- Returns (units + returned value if available)  
- Operating Profit  
- Final Net Profit  

### Ratios
- Net Margin %  
- Revenue Share %  
- Profit Share % (Contribution %)  
- Marketplace Fee % of Revenue  
- Logistics % of Revenue  
- Product Cost % of Revenue  
- Return Rate %  
- Average Selling Price (Revenue or Net Sales ÷ Units — **label which**)  
- Average Profit per Unit (Final Net Profit ÷ Units)  

### Ranking / structure
- Sort by Final Net Profit desc  
- Pareto flags (cumulative profit share ≥ 80%)  
- Loss-making brand count  
- Best / worst brand callouts (factual, no recommendations engine yet)

## Data rules

- Consume **product-level FE outputs only** (as Business V1 already does).  
- Do **not** invent brand-level fee allocation beyond what product rows already contain.  
- Account-level-only costs (some ads/adjustments) → appendix note, not fake brand splits.

## Section layout (future Excel/PDF)

1. Brand league table  
2. Cost structure stacked (% of revenue)  
3. Contribution waterfall (optional visual later)  
4. Returns overlay  
5. Definitions  

---

# Task 8 — Product Performance deep dive (specification)

## Purpose

Answer: **Which SKUs drive growth, which destroy margin, and which burn logistics/returns?**

## Rank boards (required)

| Board | Metric | Sort |
|-------|--------|------|
| Top Revenue | Revenue | Desc |
| Top Profit | Final Net Profit | Desc |
| Highest Margin | Net Margin % (revenue>0) | Desc |
| Lowest Margin | Net Margin % | Asc |
| Highest Return Rate | Return Rate | Desc |
| Highest Logistics Cost | Logistics ₽ | Desc |
| Highest Storage Cost | Storage ₽ | Desc |
| Slow Movers | Units asc **and/or** high daysLeft | Dual view |
| Fast Movers | Units desc | Desc |
| Contribution Ranking | Profit share cumulative | Desc |

## Row grain

- productId, modelCode, name, brand, category  
- Revenue, Final Net Profit, Margin %  
- Units, Return Rate  
- Marketplace Fee, Logistics, Storage, Product Cost  
- Inventory status / daysLeft when available  

## Rules

- Ranking/selection only — no new profit formulas.  
- Slow/fast movers should prefer **trusted velocity signals** (units + inventory daysLeft), not ad-hoc new engines.  
- Keep TOP_N configurable (15/25/50) at export options level later.

---

# Task 9 — Reporting architecture review

## Current strengths (`ReportDocument`)

| Need | Fit today |
|------|-----------|
| Excel export | Good — sections map cleanly to sheets |
| PDF export | Good — summary + sections |
| Preview rendering | Good — JSON document is UI-ready |
| API delivery | Good — serializable DTO |
| Multi-report reuse | Good — shared `ReportContext` |

## Recommended improvements (do **not** implement in 7.5)

| Improvement | Why |
|-------------|-----|
| **`section.schema` / `tables[]`** | Explicit columnar contracts for Excel adapters (avoid ad-hoc Object.keys) |
| **`presentationHints`** (optional) | sheetName, column order, number formats — presentation only |
| **`snapshotId` + `dataMode`** | Scheduled reports need immutable capture |
| **`schedule` metadata** | cron, recipients, locale — delivery layer |
| **Dual identity block** | `commercialPerformance` vs `settlement` explicitly named in metadata |
| **`noData` result type** | Align with blueprint §14 — refuse empty periods |
| **Unify `src/lib/reports` → `src/lib/reporting`** | One engine; Excel adapters become consumers of `ReportDocument` |
| **Prior-period context slot** | WoW/MoM factual deltas without report-owned math services |

**Verdict:** Architecture is **sufficient to start Excel/PDF**. Add schema hints + snapshot/schedule before Sprint “Scheduled Reports”; do not redesign the engine.

---

# Task 10 — Final Management Reporting Specification

## 10.1 Current status (post 7.3–7.4)

| Layer | Status |
|-------|--------|
| ReportContext | Done |
| ReportBuilder / ReportDocument | Done |
| Business Report V1 sections | Done (composition) |
| Product / Financial / Inventory / Executive | Skeletons only |
| Excel / PDF adapters on new engine | **Not started** |
| Weekly Settlement section | **Missing** |
| Legacy `src/lib/reports` Excel | Exists; migrate later |

## 10.2 Design principles (locked)

1. Reports never recalculate Model B.  
2. WB settlement language and Orion commercial language must both appear, clearly labeled.  
3. Match settlement trust; improve management insight; replace manual Excel.  
4. Brand Profitability and Product Performance are first-class management surfaces.  
5. Export formats are adapters — one `ReportDocument`.

## 10.3 Recommended report hierarchy

```
Management Reporting
├── Executive Weekly Summary          (meeting one-pager)
├── Business Performance Report      (flagship — exists V1)
├── Financial & Settlement Report    (accountant bridge)
├── Brand Profitability Report
├── Product Performance Report
├── Returns Intelligence Report
├── Logistics Performance Report
├── Inventory Risk Report
└── Cash Flow Summary
```

## 10.4 Recommended section hierarchy (flagship Business)

1. Cover  
2. Executive Summary  
3. Financial Summary (FE V4)  
4. Settlement Reconciliation *(add)*  
5. Brand Profitability  
6. Product Performance  
7. Marketplace Cost Analysis  
8. Logistics Analysis  
9. Returns Analysis  
10. Trend Analysis  
11. Inventory Summary  
12. Appendix  

## 10.5 Gap priorities

| Priority | Gap | Action type |
|----------|-----|-------------|
| P0 | Settlement Reconciliation section | Composition from existing settlement services |
| P0 | Excel adapter consuming `ReportDocument` | Export only |
| P1 | Standalone Brand Profitability report | Composition |
| P1 | Full Product Performance report | Composition |
| P1 | Financial Report = FE + weekly timeline | Composition |
| P2 | Executive Weekly one-pager | Composition |
| P2 | Cash Flow Summary | Composition |
| P2 | Returns / Logistics dedicated reports | Composition |
| P3 | Inventory Value & Turnover KPIs | **Requires service exposure** (not report math) |
| P3 | PDF + schedule + snapshots | Delivery |

## 10.6 Suggested sprint order

| Sprint | Focus | Output |
|--------|-------|--------|
| **7.5** | This specification | Blueprint (done) |
| **7.6** | Excel adapter for Business Report V1 | `.xlsx` from `ReportDocument` |
| **7.7** | Settlement Reconciliation + Financial Report V1 | Accountant trust bridge |
| **7.8** | Brand Profitability + Product Performance full reports | Management depth |
| **7.9** | Executive Weekly + Cash Flow | Meeting + liquidity |
| **7.10** | PDF adapter + preview polish | Multi-format |
| **7.11** | Scheduling / snapshots / API delivery | Automation |
| **Later** | Inventory value/turnover service → Inventory Risk report | Only after data owners exist |

## 10.7 Explicit non-goals (near term)

- Pixel-perfect clone of WB 83-column detailed Excel  
- Report-owned SQL or profit formulas  
- Changing FE V4 definitions to “look like” Продажа  
- Building pivots inside the engine (exports may create Excel pivots later from flat tables)

---

## Appendix A — Source files analyzed

| File | Role |
|------|------|
| `Downloads/Еженедельный отчет 2024-01-29 - 2026-07-05_1202289.xlsx` | Clean weekly settlement reference (240 rows, 21 cols) |
| `Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx` | Same schema; column 14 name corrupted in export |
| `Downloads/Еженедельный детализированный отчет №771120066_68674 - 1.xlsx` | Detailed ledger reference (1743×83) |
| `Downloads/Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx` | Small detailed sample |
| `src/lib/reporting/**` | Current Reporting Engine |
| `docs/reports-architecture.md` | Prior Phase 7 blueprint (still valid principles; engine paths evolved) |

## Appendix B — Confirmation checklist

| Deliverable | Status |
|-------------|--------|
| 1. Complete workbook analysis | Done |
| 2. Worksheet-by-worksheet documentation | Done (both WB products are single-sheet) |
| 3. KPI inventory | Done |
| 4. Field inventory | Done |
| 5. Gap analysis | Done |
| 6. Report comparison matrix | Done |
| 7. Brand Profitability specification | Done |
| 8. Product Performance specification | Done |
| 9. Reporting architecture review | Done |
| 10. Final Management Reporting Specification | This document |

**No code, UI, Excel, or PDF changes were made in Sprint 7.5.**
