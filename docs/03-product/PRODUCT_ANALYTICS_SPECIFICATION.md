# Product Analytics Specification

---

Status

Production

---

Owner

Product Owner

---

Audience

- Product Owner
- Developers
- AI Assistants

---

Module

Product Analytics

---

Category

Product

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Glossary](../01-business/GLOSSARY.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](../02-architecture/SYNC_ENGINE.md)
- [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)
- [Domain Model](../02-architecture/DOMAIN_MODEL.md)
- [Data Model](../02-architecture/DATA_MODEL.md)
- [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)
- [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md)
- [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)

---

Related Documents

- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)
- [Product Specifications Index](./README.md)
- [KPI Catalog](../01-business/KPI_CATALOG.md)
- [Modules](../03-modules/README.md)
- [Decisions Index](../06-decisions/INDEX.md)

---

Related ADRs

—

---

Related Widgets

—

---

Version

1.0.0

---

Last Updated

2026-07-28

---

Review Frequency

On material change to Product Analytics scope, operational reading boundaries, or assortment decision workflows

---

Source of Truth

This file (product behavior for Product Analytics). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Money meaning and model walls remain owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md). Capability ownership remains owned by [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md). Period commercial authority for Commercial Performance remains owned by [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md).

---

Purpose

Define the canonical product specification for the Product Analytics module: why individual products and Models generate commercial outcomes, which operational decision-support questions it answers, and which module-specific rules keep it from becoming a second Commercial Performance ledger.

---

Scope

Product behavior for Product Analytics only. Does not specify UI layout, components, database design, APIs, services, formulas beyond Accounting Rules, or technical architecture.

---

## 1. Purpose

### Why Product Analytics exists

Product Analytics exists so the seller-operator can **explain commercial outcomes at product and Model grain** — which assortment items create value, which destroy margin, which return too often, and where commercial trends are forming — and then decide what to promote, reprice, curtail, or investigate further.

Financial Analysis answers period commercial money questions under Commercial Performance and settlement framing. Product Analytics answers the operational follow-on: **why those results look the way they do across Products and Models**, using an operational decision-support reading ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §3.4; [Glossary](../01-business/GLOSSARY.md): Product Analytics).

It is decision support. It is **not** a substitute for Commercial Performance financial reporting, not Smart Pricing simulation, and not Inventory Intelligence.

### Business value

1. Turns period totals into assortment-level commercial judgment.
2. Makes returns, margin pressure, and revenue contribution visible where sellers act (Model / Product / SKU).
3. Supports ranking and trend reading so attention goes to the few items that matter.
4. Preserves shared Glossary meaning while allowing operational cuts (for example Advertising as its own analytical line) that remain explainable against Accounting Rules.
5. Hands off cleanly to Pricing Support, Inventory Intelligence, Cost Management, and Reporting without absorbing their duties.

### Problems solved

1. **Assortment opacity** — Period Net Profit is known, but not which Models created or diluted it.
2. **Return blindness at grain** — Return Rate and Returned Sales are hard to act on without product focus.
3. **Contribution confusion** — High Gross Sales items may be weak commercial contributors once costs and returns are seen.
4. **Margin misread** — Operational Margin and Financial Margin contexts are mixed with Net Margin without labels.
5. **False second ledger** — Product tables invent local Revenue or Net Profit dialects that disagree with Financial Analysis for the same question.

---

## 2. Business Questions

Every claim must declare Company, Marketplace Account, Reporting Period (or comparison set), assortment scope, and that the reading is **operational Product Analytics** (decision support) — not unlabeled Commercial Performance, WB Settlement, or Smart Pricing.

### Profitability at product grain

- Which Products / Models are commercially profitable in this period under operational reading?
- Which items dilute Operating Profit or Net Profit when commercial categories are applied at grain?
- Where is margin pressure concentrated (cost, logistics, advertising, returns)?

### Revenue contribution

- Which Products / Models contribute most to Revenue (or to sales presentation measures when that is the stated basis)?
- Which high-volume items under-contribute commercially after costs and returns?
- How does contribution concentrate across Brand and Category?

### Returns

- Which Products / Models drive Returned Units, Returned Sales, and Return Rate?
- Where do returns destroy contribution despite strong Orders or Sales?
- Which return patterns deserve quality, listing, or size/assortment investigation?

### Ranking and prioritization

- What is the ranked list of assortment items by contribution, profit, margin, units, or return intensity (as the chosen ranking basis states)?
- Which items deserve weekly attention vs monitoring only?
- Which weak items should be candidates for stop-promote, reprice investigation, or exit consideration?

### Margin

- What is Operational Margin for the scoped item or slice?
- What is Financial Margin where that Product Analytics totals reading applies?
- How does product margin relate to period Net Margin without silently replacing it?

### Commercial trends

- How did a Product / Model’s contribution, returns, or margin change versus the prior period?
- Which items are improving or deteriorating commercially?
- Where did a trend reverse after a price, spend, or assortment change (investigation cue — not causal proof by itself)?

### Commercial decisions

- Which items should we promote, defend, or de-emphasize commercially?
- Which items warrant a pricing simulation handoff (Smart Pricing) rather than historical re-labeling?
- Which items warrant inventory or replenishment handoff because commercial performance interacts with stock risk?
- Which items need Unit Cost stewardship review because Product Cost at grain is not trustworthy?

### Explicitly not answered here

- What was period Commercial Performance Net Profit as the authoritative period P&L? → **Financial Analysis**
- What did settlement pay us? → **Financial Analysis (WB Settlement framing)** / Reporting Settlement Reconciliation
- What Sale Price should we set next under Target Margin? → **Smart Pricing**
- What should we replenish, and what is Stock Health? → **Inventory Intelligence**
- What is warehouse network performance as a primary question? → **Warehouse Analytics**
- What Unit Cost should we maintain? → **Cost Management**

---

## 3. Scope

### 3.1 Included

| Area | Product inclusion |
|------|-------------------|
| Operational product / Model reading | Decision-support P&L-style reading at assortment grain ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §3.4) |
| Profitability at grain | Contribution, cost visibility, profit/margin signals for Products / Models / related grains |
| Returns analysis | Returned Units, Returned Sales, Return Rate, return-heavy ranking |
| Revenue / sales contribution | Contribution and share-of-period contribution under a stated basis |
| Product ranking | Ranked commercial attention lists under a declared ranking basis |
| Margin contexts | Operational Margin; Financial Margin where defined for Product Analytics totals; Net Margin only when clearly tied to commercial meaning and not overriding Financial Analysis |
| Cost visibility at grain | Product Cost, Logistics, Return Logistics, Storage, Acceptance, Penalties, Adjustments, Advertising (own line when explainable), Acquiring / Fee as transparency where relevant |
| Commercial trends | Period-to-period assortment trend reading under one declared model/reading |
| Assortment identity use | Brand, Category, Product, Model, Supplier Article, SKU, Size, Barcode as analysis grains |
| Trust qualification | Consume Operational Monitoring signals; disclose incompleteness |

### 3.2 Not included

| Outside | Owner |
|---------|--------|
| Authoritative period Commercial Performance ledger | Financial Analysis |
| WB Settlement as primary cash reconciliation workspace | Financial Analysis / Reporting |
| Smart Pricing simulation and recommended Sale Price | Pricing Support |
| Live stock, Inventory Snapshots, Days Left, Stock Health, replenishment ownership | Inventory Intelligence |
| Warehouse performance as primary module duty | Warehouse Analytics |
| Unit Cost stewardship and Purchases (COGS) lifecycle | Cost Management / Purchasing |
| Composed management report publication | Reporting |
| Sync intake and Verification Snapshot authority | Sync Engine / Operational Monitoring |

### 3.3 Relationship with neighboring modules

| Neighbor | Relationship |
|----------|--------------|
| **Financial Analysis** | Upstream commercial meaning and period authority. Product Analytics investigates assortment drivers; it must not silently override Revenue, Operating Profit, Net Profit, or historical Estimated Tax definitions. |
| **Inventory Intelligence** | Downstream/adjacent for stock risk and replenishment after commercial weakness or strength is seen. |
| **Warehouse Analytics** | Owns warehouse performance questions; Product Analytics may use Warehouse as a perspective, not as a substitute warehouse module. |
| **Smart Pricing** | Downstream for forward price decisions; historical operational reading must not be presented as simulation. |
| **Cost Management** | Supplies Unit Cost quality; Product Analytics consumes Product Cost meaning, does not own cost stewardship. |
| **Reporting** | May compose Product Intelligence / product report sections from this reading; must keep operational framing explicit. |
| **Operational Monitoring** | Qualifies whether assortment readings are decision-grade for the period. |

**Avoided duplication:** Product Analytics does not become a second Financial Analysis period P&L, does not become Inventory Intelligence, and does not become Smart Pricing.

---

## 4. KPIs

KPI **meaning** is owned by the [Glossary](../01-business/GLOSSARY.md) and [Accounting Rules](../01-business/ACCOUNTING_RULES.md). This section states product intent for Product Analytics. No formula invention.

Every KPI is scope-scoped (Company, Marketplace Account, Reporting Period, filters) and framed as **operational Product Analytics** unless explicitly bridging to Commercial Performance meaning with labels intact.

### 4.1 Contribution and sales activity

#### Revenue (at grain)

| Aspect | Definition |
|--------|------------|
| Business meaning | Seller payable commercial top line attributed to the assortment slice for the period — same Glossary/Accounting meaning as Financial Analysis |
| Management purpose | See who contributes to payable commercial scale |
| Supported decisions | Prioritize protect/grow vs investigate weak contributors |
| Dependencies | Accounting Rules §4; Financial Analysis meaning; warehouse facts; assortment attribution |

#### Gross Sales / Returned Sales / Net Sales (at grain)

| Aspect | Definition |
|--------|------------|
| Business meaning | Merchandise sales story at assortment grain |
| Management purpose | Separate volume story from payable Revenue |
| Supported decisions | Spot return-swollen Gross Sales and weak Net Sales |
| Dependencies | Glossary; Accounting Rules sales presentation vs Revenue |

#### Units Sold / Returned Units / Net Units

| Aspect | Definition |
|--------|------------|
| Business meaning | Unit activity and return counts at grain |
| Management purpose | Explain money KPIs with volume behavior |
| Supported decisions | Distinguish price/mix issues from unit and return issues |
| Dependencies | Sale / Return events; Order ≠ Sale |

#### Orders (when shown)

| Aspect | Definition |
|--------|------------|
| Business meaning | Demand events at grain (non-cancelled emphasis where stated) |
| Management purpose | Compare demand vs completed Sale / Buyout |
| Supported decisions | Funnel investigation without renaming Orders as Sales |
| Dependencies | Glossary Order; Domain Model |

#### Sales / contribution share (stated basis)

| Aspect | Definition |
|--------|------------|
| Business meaning | Share of period contribution attributed to an assortment slice under an explicitly stated basis (for example Revenue share or sales-presentation share) |
| Management purpose | Concentration and ranking |
| Supported decisions | Focus management attention on material contributors |
| Dependencies | Declared basis; must not confuse with Warehouse Distribution Sales Share unless that basis is intended and labeled |

### 4.2 Returns

#### Return Rate

| Aspect | Definition |
|--------|------------|
| Business meaning | Intensity of returns relative to the Glossary-defined return rate basis |
| Management purpose | Find return-toxic assortment |
| Supported decisions | Quality, listing, size, or exit investigation |
| Dependencies | Returned Units / Units Sold (or stated basis); Glossary |

#### Returned Sales

| Aspect | Definition |
|--------|------------|
| Business meaning | Return merchandise value at grain |
| Management purpose | Money impact of returns beyond unit counts |
| Supported decisions | Prioritize high-value return leaks |
| Dependencies | Glossary; distinct from Return Logistics |

### 4.3 Cost and spend visibility at grain

#### Product Cost

| Aspect | Definition |
|--------|------------|
| Business meaning | COGS attributed to sold units for the slice from Unit Cost |
| Management purpose | See merchandise cost drag by item |
| Supported decisions | Cost stewardship escalation; assortment margin defense |
| Dependencies | Cost Management inputs; Accounting Rules §5.1 |

#### Logistics / Return Logistics / Storage / Acceptance / Penalties / Adjustments

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace cost categories at grain per Accounting Rules |
| Management purpose | Locate non-merchandise cost pressure by item |
| Supported decisions | Operational correction; category investigation |
| Dependencies | Accounting Rules §5; explainable cuts only |

#### Advertising (analytical line)

| Aspect | Definition |
|--------|------------|
| Business meaning | Advertising / marketing spend visible as its own analytical line when Product Analytics separates it |
| Management purpose | Evaluate spend vs contribution at grain |
| Supported decisions | Cut, keep, or reallocate spend attention |
| Dependencies | Accounting Rules §5.7–5.8 — must remain explainable vs Adjustments; no silent double deduction of the same spend in one reading |

#### Marketplace Fee / Acquiring (transparency)

| Aspect | Definition |
|--------|------------|
| Business meaning | Fee and acquiring transparency at grain; informational rules from Commercial Performance still apply when those lines are already reflected before Revenue |
| Management purpose | Explain payable path without inventing a local fee dialect |
| Supported decisions | Fee-pressure awareness; avoid casual re-subtraction when already reflected |
| Dependencies | Accounting Rules §5.2, §5.9; Financial Analysis discipline |

### 4.4 Profit and margin (operational reading)

#### Operating Profit / Net Profit (at grain, labeled operational)

| Aspect | Definition |
|--------|------------|
| Business meaning | Profit measures using commercial category meanings; when shown in Product Analytics they support operational decisions and **must not silently redefine** period Commercial Performance totals owned by Financial Analysis |
| Management purpose | Rank and investigate item profitability |
| Supported decisions | Grow, fix, or exit candidates |
| Dependencies | Accounting Rules §3.4; Glossary; Financial Analysis for period authority |

#### Estimated Tax (historical sense when used)

| Aspect | Definition |
|--------|------------|
| Business meaning | If tax appears in operational product reading for after-tax judgment, historical reporting sense applies — never Smart Pricing tax base unlabeled |
| Management purpose | Approximate after-tax item impact when that question is asked |
| Supported decisions | Avoid overstating net item contribution |
| Dependencies | Accounting Rules Estimated Tax dual bases; Glossary |

#### Operational Margin

| Aspect | Definition |
|--------|------------|
| Business meaning | Margin used in operational / pricing-health contexts in Product Analytics |
| Management purpose | Operational margin health by item |
| Supported decisions | Pricing-health triage; handoff to Smart Pricing when forward price is the question |
| Dependencies | Glossary Operational Margin; not a silent synonym for Net Margin |

#### Financial Margin

| Aspect | Definition |
|--------|------------|
| Business meaning | Financial-style margin percentage in Product Analytics totals where that reading applies |
| Management purpose | Financial margin lens at operational totals |
| Supported decisions | Compare financial-style margin across slices |
| Dependencies | Glossary Financial Margin; distinct from Operational Margin and Net Margin |

#### Net Margin (when shown)

| Aspect | Definition |
|--------|------------|
| Business meaning | Net Profit relative to declared commercial base — Glossary meaning preserved |
| Management purpose | Intensity of profitability at grain |
| Supported decisions | Compare items on margin, not only absolute profit |
| Dependencies | Glossary Net Margin; must not redefine Financial Analysis period Net Margin |

### 4.5 Ranking and trend support

#### Product / Model ranking metrics

| Aspect | Definition |
|--------|------------|
| Business meaning | Ordered attention list by a declared basis (contribution, profit, margin, units, return intensity, trend delta) |
| Management purpose | Focus scarce management attention |
| Supported decisions | Weekly assortment priorities |
| Dependencies | Declared ranking basis; stable Glossary measures underneath |

#### Period comparison / trend deltas

| Aspect | Definition |
|--------|------------|
| Business meaning | Change in the same KPI across declared Reporting Periods for the same slice |
| Management purpose | Spot commercial improvement or deterioration |
| Supported decisions | Investigate what changed; escalate to pricing/inventory/cost as needed |
| Dependencies | Historical integrity; same reading/model; disclosed incompleteness |

---

## 5. Business Capabilities

Capabilities describe **what** Product Analytics provides and **why** — not implementation.

### 5.1 Assortment commercial reading

**Why.** Sellers need item-level commercial truth, not only period totals.  
**Provides.** Operational product/Model readings of sales, costs, profit, and margin signals under Accounting §3.4 discipline.

### 5.2 Contribution analysis

**Why.** Volume is not value.  
**Provides.** Revenue and sales-contribution views that show who carries the period commercially.

### 5.3 Returns intelligence (product grain)

**Why.** Returns destroy contribution silently if only totals are watched.  
**Provides.** Return Rate, Returned Units/Sales focus, and return-ranked attention lists.

### 5.4 Cost and spend decomposition at grain

**Why.** Profit leaks are category-specific and item-specific.  
**Provides.** Visible Product Cost, logistics family, penalties, adjustments, and Advertising analytical visibility with anti-double-count discipline.

### 5.5 Ranking and prioritization

**Why.** Assortments are large; management attention is not.  
**Provides.** Declared-basis rankings for commercial action.

### 5.6 Trend and comparison reading

**Why.** Decisions need direction, not only a static snapshot.  
**Provides.** Period-to-period assortment trend reading under stable meaning.

### 5.7 Decision handoff cues

**Why.** Product Analytics should trigger the right next capability, not absorb it.  
**Provides.** Clear cues toward Smart Pricing, Inventory Intelligence, Cost Management, Warehouse Analytics, Financial Analysis, or Reporting — without changing ownership.

### 5.8 Trust-aware analysis

**Why.** Incomplete periods produce false assortment rankings.  
**Provides.** Consumption of Operational Monitoring qualification; incompleteness remains visible.

---

## 6. Analysis Perspectives

Only perspectives meaningful for Product Analytics:

| Perspective | Why it matters here |
|-------------|---------------------|
| Company | Tenant boundary for all commercial claims |
| Marketplace | Platform context when multiple platforms exist |
| Marketplace Account | Primary selling-identity scope for facts and sync |
| Time / Reporting Period | Bounds historical operational reading and trends |
| Brand | Brand-level contribution and margin concentration |
| Category | Structural assortment profitability |
| Product | Catalog/display grain for seller investigation |
| Model | Primary commercial article grouping for many analytics |
| Supplier Article | Commercial key commonly binding Model and Unit Cost |
| SKU / Size / Barcode | Finer grain for return and size-level issues |
| Warehouse | Optional attribution perspective for where demand/completion occurred — not ownership of Warehouse Analytics |
| Supplier (seller procurement) | Optional context when cost quality or procurement linkage is under investigation — Cost Management / Purchasing remain owners |

Perspectives that are **not** primary Product Analytics lenses: Live Inventory Snapshot history as a stock module; settlement-only cash calendars; Smart Pricing scenario axes (those belong to Pricing Support).

---

## 7. User Workflows

### 7.1 Daily commercial scan

**Intent.** See whether any Models are suddenly hurting returns, contribution, or margin.  
**Flow.** Scope account and short period → scan rankings and return outliers → open one or two items → decide monitor vs escalate.  
**Success.** Fast triage without rebuilding period Financial Analysis.

### 7.2 Weekly assortment review

**Intent.** Set weekly commercial priorities across the catalog.  
**Flow.** Rank by contribution and profit → review return-heavy items → compare to prior week → assign actions (promote, investigate, hand off to pricing/inventory/cost).  
**Success.** A short action list grounded in shared meaning.

### 7.3 Monthly product profitability review

**Intent.** Judge which assortment deserves structural change.  
**Flow.** Month scope → contribution concentration → margin and cost decomposition → trends vs prior month → reconcile notable items against Financial Analysis period story → prepare Reporting/Product Intelligence needs if required.  
**Success.** Structural keep/fix/exit candidates identified.

### 7.4 Exception handling — return spike

**Intent.** Respond to sudden Return Rate or Returned Sales spikes.  
**Flow.** Identify spiked Models/SKUs → separate merchandise return value from Return Logistics → check whether issue is size/SKU concentrated → hand off quality/listing or inventory actions as needed.  
**Success.** Spike localized; next owner clear.

### 7.5 Exception handling — margin collapse

**Intent.** Respond when Operational Margin / profit at grain collapses.  
**Flow.** Decompose cost categories and Advertising → check Unit Cost stewardship suspicion → check fee/logistics shifts → hand off to Cost Management or Smart Pricing when forward price is the real question.  
**Success.** Cause class identified without inventing a local ledger.

### 7.6 Decision making — promote / defend / de-emphasize

**Intent.** Choose commercial posture for key Models.  
**Flow.** Combine contribution, margin, returns, and trend → decide posture → if price change is contemplated, hand off to Smart Pricing rather than rewriting history.  
**Success.** Decision uses operational reading + correct next capability.

### 7.7 Investigation — Financial Analysis handoff inbound

**Intent.** After Financial Analysis finds a weak category or brand total, find the offending Models.  
**Flow.** Inherit Company, account, period, and commercial meaning → drill assortment → isolate drivers → return summary insight without redefining period Net Profit.  
**Success.** Period question and product question stay distinct but consistent.

### 7.8 Planning and optimization cues

**Intent.** Feed planning without owning planning systems.  
**Flow.** Use rankings and trends to cue replenishment planning (Inventory Intelligence), procurement cost quality (Cost Management / Purchasing), and pricing scenarios (Smart Pricing).  
**Success.** Optimization work starts from trusted product commercial signals.

---

## 8. Filters

Filters bound business reality. They do not change Glossary meaning or silently switch Accounting models.

| Filter | Business purpose |
|--------|------------------|
| Company | Enforce tenant isolation for all product commercial claims |
| Marketplace | Constrain platform context |
| Marketplace Account | Bind reading to the selling identity whose facts apply |
| Reporting Period / Date Range | Declare the historical window for operational reading and trends |
| Brand | Focus brand contribution and margin |
| Category | Focus structural assortment slices |
| Product / Model / Supplier Article | Focus the primary commercial investigation grain |
| SKU / Size / Barcode | Isolate size-level return or performance issues |
| Warehouse | Attribute performance geographically/fulfillment-wise when that question is active |
| Ranking / view basis (when offered) | Declare whether attention is by contribution, profit, margin, units, or returns — basis must be explicit |

**Filter discipline:** changing filters must not convert Product Analytics into Financial Analysis period authority, WB Settlement, or Smart Pricing simulation.

---

## 9. Drill-down Principles

1. **Summary assortment → item → finer grain** — Move Brand/Category → Model/Product → SKU/Size while preserving operational reading labels.

2. **Meaning stability** — Revenue, Return Rate, and cost category names keep Glossary meaning at every grain.

3. **Model / reading stability** — Drill-down never silently switches to Commercial Performance period authority, WB Settlement, or Smart Pricing. If the user changes question type, that change must be explicit.

4. **Scope inheritance** — Company, Marketplace Account, and Reporting Period persist unless deliberately changed.

5. **No private product ledger** — Detail rows apply the same category discipline as summary; they do not invent local Net Profit dialects for convenience.

6. **Advertising explainability** — If Advertising appears as its own line at detail, its relationship to Adjustments remains explainable (Accounting Rules §5.7–5.8).

7. **Handoff, not absorption** — Entering Inventory Intelligence, Smart Pricing, Cost Management, Warehouse Analytics, or Financial Analysis is a journey handoff.

8. **Trust travels** — Incomplete Coverage that disqualifies period rankings remains relevant at item drill-down unless a narrower verified basis is explicitly established.

---

## 10. Dependencies

Logical dependencies only.

### Depends on

| Dependency | Why |
|------------|-----|
| [Project DNA](../00-project/PROJECT_DNA.md) | Decision-support philosophy; explainability |
| [Glossary](../01-business/GLOSSARY.md) | Vocabulary, including Product Analytics, Operational Margin, Financial Margin |
| [Business Model](../01-business/BUSINESS_MODEL.md) | Sales Performance + assortment identity; decision framework |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | §3.4 operational reading; cost categories; dual Estimated Tax bases |
| [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md) | Application interprets; does not own Accounting Layer |
| [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md) | Durable facts for period/item claims |
| [Sync Engine](../02-architecture/SYNC_ENGINE.md) | Intake feeding warehouse facts |
| [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md) | Product Analytics capability ownership |
| [Domain Model](../02-architecture/DOMAIN_MODEL.md) | Product/Model/SKU, Sale, Return, cost entities |
| [Data Model](../02-architecture/DATA_MODEL.md) | Product Analytics operational read model contract |
| [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) | Composition rules for product intelligence sections |
| [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md) | External labels must not rename Glossary terms |
| [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md) | Trust, incompleteness, semantic change control |
| [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md) | Period commercial authority and handoff contract |

### Cooperates with (future / neighboring product specs)

| Partner | Relationship |
|---------|--------------|
| Inventory Intelligence | Stock and replenishment after commercial diagnosis |
| Warehouse Analytics | Warehouse performance ownership |
| Smart Pricing | Forward price decisions |
| Cost Management / Purchasing | Cost input quality and procurement |
| Reporting / Monitoring / Administration | Publication, trust visibility, tenancy governance |

---

## 11. Module-specific Business Rules

Canonical money rules remain in [Accounting Rules](../01-business/ACCOUNTING_RULES.md). Terminology remains in the [Glossary](../01-business/GLOSSARY.md). Module-specific rules only:

1. **Decision support, not substitute ledger.** Product Analytics must remain explicitly operational decision support and must not present itself as a replacement Commercial Performance statement for the period ([Glossary](../01-business/GLOSSARY.md); Accounting Rules §3.4).

2. **No silent override.** Product Analytics must not silently override Commercial Performance definitions of Revenue, Operating Profit, Net Profit, or historical Estimated Tax.

3. **Financial Analysis is upstream for period authority.** When period totals and product operational readings are compared, disagreements are investigated as attribution, Coverage, or cut differences — not resolved by redefining Financial Analysis meaning.

4. **Advertising line discipline.** An Advertising analytical line is allowed when explainable; it must not double-deduct the same spend already represented in Adjustments inside one reading without stating the relationship.

5. **Margin label discipline.** Operational Margin, Financial Margin, and Net Margin remain distinct Glossary terms; they must not be used as casual synonyms.

6. **Order ≠ Sale ≠ Buyout ≠ Purchases module.** Demand, completion, and seller procurement stay distinct at every grain.

7. **Warehouse is a perspective, not module capture.** Warehouse-attributed product readings do not replace Warehouse Analytics responsibilities.

8. **Smart Pricing boundary.** Forward price questions hand off to Smart Pricing; historical operational margins are not simulated Net Profit.

9. **Cost stewardship boundary.** Suspicious Product Cost triggers Cost Management review; Product Analytics does not become the Unit Cost editor of record.

10. **Trust visibility.** Incomplete or unverified periods must not produce false-confidence assortment rankings without disclosure.

11. **Ranking basis must be declared.** A ranked list without a stated basis is a product defect.

12. **Reporting composition.** Product Intelligence / product report sections may reuse this reading but must keep operational framing visible when it is not Commercial Performance period authority.

---

## 12. Success Criteria

A successful Product Analytics module enables management to:

1. **Explain why products generate commercial outcomes** — Connect period results to Models/Products that create or destroy value.
2. **Act on returns and margin** — Identify return-toxic and margin-weak assortment quickly.
3. **Prioritize** — Maintain ranked attention lists that match declared commercial bases.
4. **See trends** — Detect improving or deteriorating items under stable meaning.
5. **Decide commercially** — Choose promote / defend / de-emphasize / investigate postures with correct handoffs to pricing, inventory, cost, warehouse, and reporting capabilities.
6. **Preserve trust** — Keep Glossary and Accounting consistency with Financial Analysis; never ship a second unlabeled money dialect.

Failure modes that invalidate success: silent override of Commercial Performance; Estimated Tax base confusion; Advertising double counting; margin term collapse; warehouse or inventory module absorption; ranking without declared basis; hiding incomplete Coverage.

---

## 13. Out of Scope

This specification explicitly excludes:

- Implementation design and source code structure
- UI layout, visual design, component trees, and interaction widgets
- Database schemas, table names, migrations, and SQL
- APIs, endpoints, payloads, and service topology
- Frontend and backend frameworks
- Repositories and infrastructure
- Runtime scheduling and technical jobs
- Formula invention beyond Accounting Rules
- Statutory accounting and official tax products

Those concerns belong elsewhere. This document defines business capabilities only.

---

## How to use this document

1. Judge Product Analytics changes against the business questions in §2.
2. Resolve money meaning in Accounting Rules and names in the Glossary before changing behavior.
3. Keep Financial Analysis as period commercial authority; keep this module as assortment operational decision support.
4. Update this document deliberately when product scope or KPI intent changes.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Product Analytics |
| Canonical role | Product specification |
| Last Updated | 2026-07-28 |
| Program step | STEP 1 of Product Specification Program |
