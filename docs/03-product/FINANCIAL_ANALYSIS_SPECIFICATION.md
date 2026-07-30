# Financial Analysis Specification

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

Financial Analysis

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
- [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)
- [Domain Model](../02-architecture/DOMAIN_MODEL.md)
- [Data Model](../02-architecture/DATA_MODEL.md)
- [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)
- [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)

---

Related Documents

- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
- [Product Specifications Index](./README.md)
- [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](../02-architecture/SYNC_ENGINE.md)
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

On material change to Financial Analysis scope, KPI meaning, or financial model boundaries

---

Source of Truth

This file (product behavior for Financial Analysis). Money meaning remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Application capability ownership remains owned by [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md).

---

Purpose

Define the canonical product specification for the Financial Analysis module: what it is, which business questions it answers, how seller-operators use it, which KPIs it presents, and which module-specific rules govern behavior — without prescribing interface layout, persistence, or implementation.

---

Scope

Product behavior for Financial Analysis only. Does not specify UI layout, components, database design, APIs, services, formulas beyond Accounting Rules, or technical architecture.

---

## 1. Purpose

### Why Financial Analysis exists

Financial Analysis exists so the seller-operator can **understand commercial money** for a scoped Company, Marketplace Account, and Reporting Period — and act on that understanding with confidence.

Wildberries sellers face fees, logistics, storage, advertising, returns, settlement timing, and tax exposure that interact. Without a stable commercial reading, it is easy to confuse merchandise sales stories with payable Revenue, mistake settlement cash for Net Profit, or treat an estimate as an observed invoice.

This module is the Application capability that applies [Accounting Rules](../01-business/ACCOUNTING_RULES.md) to durable warehouse facts and presents **historical and period commercial reading**: Commercial Performance, cost structure, Operating Profit, Net Profit, Estimated Tax in the historical reporting sense, and WB Settlement framing where settlement visibility is required ([Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)).

### Management problems it solves

1. **Profit opacity** — Sellers cannot see whether the period was commercially profitable after Marketplace and operating realities.
2. **Category blindness** — Cost leaks (Product Cost, Logistics, Storage, Advertising / Adjustments, Penalties, Acceptance, and related lines) are hard to locate without a coherent cost structure.
3. **Model confusion** — Commercial Performance, WB Settlement, and Smart Pricing answer different questions; mixing them silently destroys trust.
4. **Settlement reconciliation gap** — Sellers need to relate “what settlement says we were paid” to commercial performance without treating settlement as a substitute P&L.
5. **Period comparison** — Sellers need to see how profitability and cost structure changed versus prior periods under the same meaning.
6. **Decision support under uncertainty** — Incomplete Coverage or Sync Verification warnings must remain visible so decisions are not made on false completeness.

### What this module is not

- Not a bookkeeping ledger or statutory accounting system.
- Not a raw transaction browser for marketplace feeds.
- Not Smart Pricing (simulation) and not Inventory Intelligence.
- Not a second Accounting Rules document and not a private money dialect.

It answers **business questions**. Business terminology is authoritative ([Glossary](../01-business/GLOSSARY.md)).

---

## 2. Business Questions

Financial Analysis answers the following classes of questions. Every claim must declare Company, Marketplace Account, Reporting Period (or period comparison set), and the financial model in use (Commercial Performance vs WB Settlement).

### Profitability

- How much **Net Profit** did we generate in this period?
- What was **Operating Profit** before Estimated Tax?
- What is **Net Margin** for this period?
- Are we commercially profitable after Marketplace and operating realities?

### Revenue and sales story

- What was **Revenue** (seller payable commercial top line) for this period?
- What do **Gross Sales**, **Returned Sales**, and **Net Sales** say about merchandise activity (distinct from Revenue)?
- How do sales presentation and Revenue relate without being treated as synonyms?

### Cost structure

- What reduced profitability in this period?
- How much was **Product Cost**?
- What were **Logistics**, **Storage**, **Acceptance**, **Penalties**, and **Adjustments**?
- How is **Advertising** visible (inside Adjustments and/or as an analytical line, without double-counting the same spend)?
- What do **Marketplace Fee** and **Acquiring** show for understanding — without silently re-deducting them when already reflected before Revenue?

### Tax estimate (historical)

- What is **Estimated Tax** for this period under the **historical reporting** base?
- What **Tax Rate** input is in force for this reading?
- Is Estimated Tax labeled as an estimate (not observed settlement cash)?

### Settlement framing

- What did Wildberries settlement say we were paid or owed (**Seller Payout**, **Settlement Amount**, **WB Settlement** view)?
- How does settlement cash expectation relate to commercial Net Profit without replacing it?
- Is settlement-oriented **Settlement Profit** (where shown) labeled as settlement framing, not Commercial Performance?

### Change and comparison

- Where did profitability change versus a prior period?
- Which cost categories grew or shrank?
- How does this Reporting Period compare to previous ones under the **same** model and Glossary meaning?
- Is the comparison honest about open periods, incomplete Coverage, or settlement lag?

### Product and assortment value (commercial grain)

- Which Brands, Categories, Models, or Products create commercial value in this period?
- Which assortment slices dilute Net Profit or margins?
- Where should investigation continue (handoff to Product Analytics when the question becomes operational product decision support)?

### Trust and readiness (qualification, not a second P&L)

- Is this period trustworthy enough to treat as decision-grade Commercial Performance?
- Is Coverage or Sync Verification incomplete for the scope?
- Must incompleteness remain visible rather than hidden by optimistic arithmetic?

### Explicitly not answered here

- What Sale Price should we set next? → **Pricing Support / Smart Pricing**
- What should we replenish? → **Inventory Intelligence**
- What Unit Cost should we maintain? → **Cost Management**
- What management document should we export? → **Reporting** (composes Financial Analysis; does not redefine it)

---

## 3. Scope

### 3.1 Inside Financial Analysis

| Area | Product inclusion |
|------|-------------------|
| Commercial Performance | Period commercial P&L reading under Accounting Rules §3.1 |
| Sales presentation | Gross Sales, Returned Sales, Net Sales as merchandise story beside Revenue |
| Revenue | Seller payable commercial top line for the period |
| Cost categories | Product Cost, Marketplace Fee, Logistics (and Return Logistics where separated), Storage, Acceptance, Penalties, Adjustments, Advertising visibility, Acquiring, Compensation where classified |
| Profit measures | Operating Profit, Net Profit, Net Margin (and related margin language when Glossary-aligned) |
| Estimated Tax | Historical reporting sense only when claiming historical commercial tax |
| Units and returns (commercial context) | Units Sold, Returned Units, Net Units, Return Rate as supporting commercial activity signals |
| WB Settlement framing | Seller Payout, Settlement Amount, settlement-oriented views and reconciliation support |
| Period comparison | Same-model comparison across Reporting Periods |
| Assortment drill-down | Brand / Category / Product / Model / SKU commercial grains without changing model |
| Trust qualification | Consume Operational Monitoring signals; disclose incompleteness |

### 3.2 Intentionally outside the module

| Outside | Owner / capability |
|---------|-------------------|
| Smart Pricing simulation and recommended Sale Price | Pricing Support |
| Live Inventory position, Inventory Snapshots, Stock Health, Days Left | Inventory Intelligence |
| Unit Cost stewardship and Purchases (COGS module) | Cost Management / Purchasing |
| Composed Business Report / Excel Export publication ownership | Reporting |
| Sync intake philosophy and Verification Snapshot authority | Sync Engine / Operational Monitoring |
| Statutory GAAP/IFRS filings, official tax returns, tax advice | Out of product framework ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §9.2) |
| Warehouse Distribution (stock) as an inventory map | Inventory Intelligence (Warehouse Sales attribution may be adjacent analytics, not Financial Analysis’s primary duty) |
| Executive Recommendations rule engine | Reporting / recommendation surfaces (may consume financial readings; does not redefine them) |

### 3.3 Adjacent context rule

Financial Analysis may **show** adjacent signals (for example inventory value context or sync warnings) for judgment. Adjacent display does **not** transfer ownership of those domains ([Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)).

---

## 4. KPIs

KPI **meaning** is owned by the [Glossary](../01-business/GLOSSARY.md) and [Accounting Rules](../01-business/ACCOUNTING_RULES.md). This section states product intent: why each KPI appears in Financial Analysis and which decision it supports. Detailed formulas belong in Accounting Rules and/or the KPI Catalog — not here.

Every KPI below is model-scoped and scope-scoped (Company, Marketplace Account, Reporting Period, filters).

### 4.1 Commercial Performance — sales story

#### Gross Sales

| Aspect | Definition |
|--------|------------|
| Business meaning | Merchandise sales amount for completed sales before subtracting Returned Sales in the Commercial Performance display story |
| Why it exists | Shows top-of-funnel sales value before returns |
| Decision supported | Judge sales volume vs returns pressure |
| Dependencies | Glossary; Accounting Rules sales presentation vs Revenue; warehouse sales facts |

#### Returned Sales

| Aspect | Definition |
|--------|------------|
| Business meaning | Sales value associated with returns in the period |
| Why it exists | Makes return merchandise impact visible in money terms |
| Decision supported | Prioritize return reduction and quality investigation |
| Dependencies | Glossary; Return events; distinct from Return Logistics |

#### Net Sales

| Aspect | Definition |
|--------|------------|
| Business meaning | Gross Sales minus Returned Sales — seller-facing sales presentation after returns |
| Why it exists | Communicates net merchandise story without claiming Revenue |
| Decision supported | Compare sales presentation across periods without confusing payable Revenue |
| Dependencies | Gross Sales; Returned Sales; Accounting Rules §4 |

### 4.2 Commercial Performance — payable top line

#### Revenue

| Aspect | Definition |
|--------|------------|
| Business meaning | Seller’s marketplace payable amount for the Reporting Period — commercial top line toward profit ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §4) |
| Why it exists | Anchors commercial profitability; prevents Gross Sales / Net Sales / Customer Paid / Seller Payout confusion |
| Decision supported | Judge commercial scale and period health |
| Dependencies | Accounting Rules Revenue recognition; warehouse period facts; explicit tenancy and period |

### 4.3 Cost structure

#### Product Cost

| Aspect | Definition |
|--------|------------|
| Business meaning | Cost of goods attributed to sold units for the period from maintained Unit Cost |
| Why it exists | Separates merchandise cost from Marketplace fees and logistics |
| Decision supported | Protect margin; detect missing or wrong Unit Cost stewardship |
| Dependencies | Cost Management Unit Cost inputs; Accounting Rules §5.1; sold activity |

#### Marketplace Fee

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace fee take in the commercial fee story; informational relative to Net Profit when already reflected before Revenue |
| Why it exists | Explains the path from sales to payable without double-deducting |
| Decision supported | Understand fee pressure; do not re-subtract casually in Net Profit |
| Dependencies | Accounting Rules §5.2; Glossary |

#### Logistics

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace logistics costs for the period (forward movement as classified) |
| Why it exists | Locates fulfillment cost pressure |
| Decision supported | Investigate logistics-heavy assortment or periods |
| Dependencies | Accounting Rules §5.3; distinct from Product Cost |

#### Return Logistics

| Aspect | Definition |
|--------|------------|
| Business meaning | Logistics costs specifically associated with returns (when separated) |
| Why it exists | Separates return movement cost from forward Logistics and from Returned Sales value |
| Decision supported | Quantify return cost beyond lost sales value |
| Dependencies | Accounting Rules §5.3; Glossary |

#### Storage

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace storage costs for the period |
| Why it exists | Surfaces holding cost as a profitability reducer |
| Decision supported | Link overstock / slow movers to financial impact (handoff to Inventory Intelligence for stock action) |
| Dependencies | Accounting Rules §5.4 |

#### Acceptance

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace acceptance (intake) operation costs for the period |
| Why it exists | Makes intake operation cost visible |
| Decision supported | Understand supply intake cost pressure |
| Dependencies | Accounting Rules §5.5 |

#### Penalties

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace penalty amounts for the period |
| Why it exists | Highlights avoidable or operational penalty leakage |
| Decision supported | Drive process correction where penalties concentrate |
| Dependencies | Accounting Rules §5.6 |

#### Adjustments

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace financial adjustments bucket for the period (often includes advertising and other holds as presented) |
| Why it exists | Captures commercial deductions not classified as Fee, Logistics, Storage, Acceptance, or Penalties |
| Decision supported | Investigate “other” cost pressure without inventing parallel buckets |
| Dependencies | Accounting Rules §5.8; Glossary aliases for Other Costs |

#### Advertising

| Aspect | Definition |
|--------|------------|
| Business meaning | Advertising / marketing spend; may appear inside Adjustments and/or as its own analytical line when explainable |
| Why it exists | Supports spend judgment without silent double deduction of the same spend in one model |
| Decision supported | Evaluate advertising efficiency relative to commercial results |
| Dependencies | Accounting Rules §5.7–5.8; may hand off to Product Analytics for operational cuts |

#### Acquiring

| Aspect | Definition |
|--------|------------|
| Business meaning | Payment acquiring fee shown for transparency; already reflected before Revenue under Commercial Performance |
| Why it exists | Prevents sellers from subtracting acquiring twice when reading Net Profit |
| Decision supported | Understand payment fee path; keep informational when already reflected |
| Dependencies | Accounting Rules §5.9 |

#### Compensation

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace compensation / reimbursement classified separately from Marketplace Fee |
| Why it exists | Prevents silent netting into Fee or Advertising |
| Decision supported | Reconcile reimbursements honestly |
| Dependencies | Accounting Rules §5.11; Glossary |

### 4.4 Profit and tax (historical Commercial Performance)

#### Operating Profit

| Aspect | Definition |
|--------|------------|
| Business meaning | Commercial profit before Estimated Tax under Commercial Performance |
| Why it exists | Separates operating commercial result from tax estimation |
| Decision supported | Judge operating health independent of tax estimate |
| Dependencies | Revenue and cost category discipline per Accounting Rules |

#### Estimated Tax (historical reporting)

| Aspect | Definition |
|--------|------------|
| Business meaning | Operational estimate of tax exposure using the **historical reporting** base (Customer Paid); reduces Operating Profit to Net Profit in Commercial Performance |
| Why it exists | Supports after-tax commercial judgment without claiming a tax filing |
| Decision supported | Approximate tax burden for the period; never confuse with Smart Pricing tax base |
| Dependencies | Accounting Rules §3.1, §5.10, §10; Glossary Estimated Tax dual contexts; Tax Rate input |

#### Net Profit

| Aspect | Definition |
|--------|------------|
| Business meaning | Commercial profit after historical Estimated Tax under Commercial Performance |
| Why it exists | Primary commercial profitability answer for the period |
| Decision supported | Decide whether the period created lasting commercial value |
| Dependencies | Operating Profit; historical Estimated Tax; Accounting Rules |

#### Net Margin

| Aspect | Definition |
|--------|------------|
| Business meaning | Net Profit relative to the commercial base defined for margin in Glossary / Accounting discipline |
| Why it exists | Normalizes profit across periods and scales |
| Decision supported | Compare profitability intensity, not only absolute Net Profit |
| Dependencies | Net Profit; Revenue (or declared margin base); Glossary |

### 4.5 Activity support KPIs (commercial context)

#### Units Sold / Returned Units / Net Units / Return Rate

| Aspect | Definition |
|--------|------------|
| Business meaning | Unit counts and return intensity supporting the commercial story (Glossary) |
| Why they exist | Explain money KPIs with volume and return behavior |
| Decision supported | Separate price/mix effects from unit and return effects at a product level |
| Dependencies | Sale and Return events; Order ≠ Sale discipline |

#### Orders (when shown)

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace customer demand events (non-cancelled emphasis where stated) |
| Why it exists | Demand context beside completed Sales — not a synonym for Revenue |
| Decision supported | Compare demand vs completion (Buyout / Sale) without renaming Orders as Sales |
| Dependencies | Glossary Order; Domain Model |

### 4.6 Settlement framing KPIs

#### WB Settlement (view)

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace settlement / payout-oriented understanding for the period |
| Why it exists | Answers cash-transfer and settlement reconciliation questions |
| Decision supported | Reconcile “what settlement says” with commercial reading |
| Dependencies | Accounting Rules §3.2; Realization Report availability where relevant |

#### Seller Payout

| Aspect | Definition |
|--------|------------|
| Business meaning | Primary payout concept within or beside settlement framing |
| Why it exists | Names what the seller expects as payout-oriented amount |
| Decision supported | Cash expectation vs commercial Net Profit (labeled distinct) |
| Dependencies | Glossary; Accounting Rules settlement framing |

#### Settlement Amount

| Aspect | Definition |
|--------|------------|
| Business meaning | Settlement total concept inside WB Settlement framing |
| Why it exists | Anchors settlement totals for reconciliation |
| Decision supported | Settlement reconciliation workflows |
| Dependencies | Glossary; not identical to Revenue or Net Profit |

#### Settlement Profit (where presented)

| Aspect | Definition |
|--------|------------|
| Business meaning | Settlement-oriented profit framing — distinct from Commercial Performance Net Profit |
| Why it exists | Allows settlement-side profit language without hijacking Net Profit |
| Decision supported | Compare framings only when labels keep models separate |
| Dependencies | Accounting Rules §3.2; must remain labeled |

#### Estimated Tax near settlement (informational)

| Aspect | Definition |
|--------|------------|
| Business meaning | Historical reporting Estimated Tax shown near settlement for information — **not** derived from settlement as a commercial P&L |
| Why it exists | Avoid inventing a third tax base from settlement cash |
| Decision supported | Keep tax estimate honest beside settlement figures |
| Dependencies | Accounting Rules §3.2 |

### 4.7 Period comparison measures

Period comparison is not a separate Glossary money term; it is the **same KPIs** evaluated across declared Reporting Periods under one model.

| Aspect | Definition |
|--------|------------|
| Business meaning | Change in Commercial Performance (or settlement framing) KPIs between periods |
| Why it exists | Locates where profitability and cost structure moved |
| Decision supported | Weekly/monthly financial review; root-cause investigation |
| Dependencies | Historical integrity; same model; disclosed incompleteness |

---

## 5. User Workflows

Workflows describe seller-operator intent. They do not prescribe screens or control layouts.

### 5.1 Daily business review

**Intent.** Know whether yesterday / the last few days look commercially healthy enough to continue current pricing and spend posture.

**Typical steps.** Confirm Company and Marketplace Account → select a short Reporting Period → read Revenue, Operating Profit, Net Profit → scan cost outliers → note Sync Verification / Coverage warnings → decide whether deeper investigation is needed.

**Success.** The operator leaves with a trustworthy short-horizon commercial posture, not a transaction dump.

### 5.2 Weekly profitability review

**Intent.** Understand the week’s Commercial Performance and where money leaked.

**Typical steps.** Select the week → review sales story vs Revenue → walk cost categories → review Estimated Tax (historical) → compare to prior week under the same model → identify one or two investigation targets (assortment slice or cost category).

**Success.** Clear view of weekly Net Profit drivers and next actions.

### 5.3 Monthly financial review

**Intent.** Close the month’s commercial judgment and prepare for management communication.

**Typical steps.** Select the month → full Commercial Performance reading → period comparison to prior month → settlement framing check for cash expectation → qualify trust → hand off composition needs to Reporting (Business Report / Settlement Reconciliation) without inventing a second ledger.

**Success.** Month is understood commercially; exports/reports can reuse the same meaning.

### 5.4 Product profitability investigation

**Intent.** Find which Models or Products create or destroy commercial value.

**Typical steps.** Start from period totals → drill by Brand / Category / Model / Product / SKU without changing Accounting model → isolate weak slices → if the question becomes operational product decision support, hand off to Product Analytics without redefining Revenue or Net Profit.

**Success.** Assortment decisions grounded in Commercial Performance meaning.

### 5.5 Marketplace settlement reconciliation

**Intent.** Relate WB Settlement / Seller Payout / Settlement Amount to commercial reading.

**Typical steps.** Open settlement framing for the period → read payout-oriented amounts → compare conceptually to Revenue and Net Profit **as distinct claims** → note Realization Report / settlement availability limits → document discrepancies as reconciliation narrative (Reporting may compose Settlement Reconciliation).

**Success.** Cash expectation understood without treating settlement as Commercial Performance.

### 5.6 Incomplete or disputed period review

**Intent.** Decide whether to act or wait when Coverage or verification is incomplete.

**Typical steps.** Read Operational Monitoring qualification → treat incompleteness as visible → avoid forcing false precision → postpone decision-grade claims or narrow scope until facts are trustworthy enough.

**Success.** No silent “fix” of Accounting meaning to mask missing evidence ([Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)).

---

## 6. Filters

Filters bound **which business reality** is under review. They do not change Glossary meaning or Accounting model by themselves.

| Filter | Business meaning | Why it exists |
|--------|------------------|---------------|
| Company | Owning organization / top-level tenant | Enforce Multi-Tenant Commercial Reality; prevent blended P&L without explicit scope |
| Marketplace | Platform type (for example Wildberries) | Distinguish platform context when multiple marketplaces exist; not a synonym for Marketplace Account |
| Marketplace Account | Selling identity under a Company | Primary commercial scope for sync, facts, and financial claims |
| Reporting Period / Date Range | Explicit start–end bounds (or Period Preset) for the reading | Every financial claim needs declared time; supports period comparison |
| Brand | Commercial brand label | Assortment drill-down without changing money meaning |
| Category | Product classification | Structural profitability investigation |
| Product / Model / Supplier Article / SKU | Assortment identity lattice | Locate value creation/destruction at commercial grains |
| Warehouse (when used) | Fulfillment location attribution for sales/cost context | Analytical attribution only — does not mean the Warehouse owns Order/Sale entities |

### Filter discipline

1. Tenancy filters (Company, Marketplace Account) are accounting boundaries, not cosmetic UI preferences.
2. Changing filters must not silently switch from Commercial Performance to WB Settlement or Smart Pricing.
3. Empty or unavailable slices must not invent values to keep charts looking complete.
4. Period comparison requires declared periods on both sides under the same model.

---

## 7. Drill-down Principles

1. **Summary → structure → grain** — Users move from period totals to cost categories and assortment grains (Brand → Category → Model → Product → SKU) while preserving meaning.

2. **Model stability** — Navigation never changes the Accounting model. Commercial Performance remains Commercial Performance; settlement framing remains settlement framing unless the user explicitly switches question/model ([Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) drill-down principles).

3. **Scope preservation** — Drill-down inherits Company, Marketplace Account, and Reporting Period unless the user deliberately changes scope.

4. **Meaning preservation** — Revenue remains Revenue at every grain; Net Sales does not become Revenue at Model level.

5. **No private ledger at detail** — Detail views apply the same Accounting Rules to the same warehouse facts; they do not invent a second commercial arithmetic for “pretty” product tables.

6. **Handoff, not absorption** — Moving into Inventory Intelligence, Product Analytics, Cost Management, or Reporting is a journey handoff. Destination capability rules apply; Financial Analysis does not absorb those duties.

7. **Trust travels with the claim** — If the period is incomplete at summary, incompleteness remains relevant at drill-down unless a narrower verified slice is explicitly established.

---

## 8. Dependencies

Logical dependencies only (no services, APIs, or runtime components).

### Depends on

| Dependency | Why |
|------------|-----|
| [Project DNA](../00-project/PROJECT_DNA.md) | Product philosophy: decision support, explainability, historical integrity |
| [Glossary](../01-business/GLOSSARY.md) | Authoritative vocabulary |
| [Business Model](../01-business/BUSINESS_MODEL.md) | Financial Performance domain and seller-operator responsibilities |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Money meaning, model walls, estimation, historical integrity |
| [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md) | Layer placement: Application interprets; does not own Accounting Layer meaning |
| [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md) | Capability ownership and handoffs |
| [Domain Model](../02-architecture/DOMAIN_MODEL.md) | Orders, Sales, Returns, costs, settlement entities and relationships |
| [Data Model](../02-architecture/DATA_MODEL.md) | Logical read model contract for Financial Analysis / Dashboard commercial reading |
| [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md) | Authoritative durable facts for historical and period claims |
| [Sync Engine](../02-architecture/SYNC_ENGINE.md) | Intake philosophy feeding warehouse facts; Availability qualification |
| [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) | Composition/publication consistency; Financial Analysis as interpretation source for commercial sections |
| [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md) | Trust model, incompleteness visibility, change management for semantic breaks |

### Consumed by / cooperates with

| Partner | Relationship |
|---------|--------------|
| Reporting | Composes Financial Analysis outputs; must not re-derive a second Commercial Performance dialect |
| Product Analytics | May reuse categories for operational cuts; must not silently override Commercial Performance definitions |
| Cost Management | Supplies Unit Cost stewardship inputs for Product Cost |
| Pricing Support | Distinct model (Smart Pricing); must not rewrite historical Net Profit |
| Operational Monitoring | Qualifies decision-grade readiness |

---

## 9. Business Rules

Canonical money rules live in [Accounting Rules](../01-business/ACCOUNTING_RULES.md). This section states **module-specific** product rules only.

1. **Financial Analysis is the authoritative Application interpretation** of Commercial Performance results for a declared scope ([Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md) information ownership). It applies Accounting Rules; it does not invent them.

2. **Declare the model.** Every Financial Analysis reading states whether the user is in Commercial Performance or WB Settlement framing. Unlabeled blends are defects.

3. **Historical Estimated Tax only for historical commercial tax claims.** Smart Pricing Estimated Tax base must never appear unlabeled inside Financial Analysis historical Net Profit.

4. **Settlement is adjacent, not substitute.** WB Settlement answers payout/reconciliation questions; it must not replace Commercial Performance Net Profit.

5. **Informational lines stay informational.** Marketplace Fee and Acquiring, when already reflected before Revenue, must not be casually re-subtracted in Net Profit under Commercial Performance.

6. **No bookkeeping mode.** The module must not present itself as a statutory ledger, tax filing system, or raw feed browser.

7. **No silent completeness.** Incomplete Coverage or failed verification must remain visible on decision-grade claims.

8. **Period comparison uses one model.** Comparing Commercial Performance of period A to settlement framing of period B as if identical is forbidden.

9. **Assortment drill-down does not fork meaning.** Product-level commercial KPIs remain Glossary terms under the same model.

10. **Handoffs are explicit.** Pricing, inventory replenishment, cost stewardship, and report publication remain other capabilities’ duties.

11. **Consequential meaning changes follow change management.** If Revenue, Net Profit, or Estimated Tax historical meaning changes, treat as breaking accounting change with documentation and effective dating ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) change management; [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)).

12. **Presentation does not create a second ledger.** Ordering of cards or narratives for readability must not invent parallel financial truth ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §2.9).

---

## 10. Success Criteria

A successful Financial Analysis module enables seller-operators to:

1. **Understand profitability** — Answer Net Profit and Operating Profit for a scoped period under Commercial Performance with stable meaning.
2. **Identify financial changes** — Locate which categories and assortment slices moved results across periods.
3. **Reconcile business performance** — Relate commercial reading to WB Settlement framing without model confusion.
4. **Trust reported numbers** — Reproduce the same claims for the same scope and facts; see incompleteness when trust is limited; explain observed vs estimated.
5. **Make commercial decisions** — Act on pricing posture, assortment focus, spend pressure, and escalation to other capabilities with shared language across Dashboard, Financial Analysis, and Reporting compositions.

Failure modes that invalidate success: silent model blending; Estimated Tax base confusion; settlement presented as commercial P&L; hiding incomplete sync; product-level forks of Revenue meaning; implementation terminology leaking into seller-facing business language.

---

## 11. Out of Scope

This specification explicitly excludes:

- Implementation design and source code structure
- UI layout, visual design, component trees, and interaction widgets
- Database schemas, table names, migrations, and SQL
- APIs, endpoints, payloads, and service topology
- Frontend and backend frameworks
- Runtime scheduling, jobs, and infrastructure
- Formula invention beyond what Accounting Rules already define
- Statutory accounting systems and official tax products

Those concerns, when documented, belong in architecture, module implementation docs, widgets, API docs, or development guides — never as substitutes for this product specification.

---

## How to use this document

1. Use this file to judge whether a Financial Analysis change serves a real business question.
2. Resolve money meaning in [Accounting Rules](../01-business/ACCOUNTING_RULES.md) and naming in the [Glossary](../01-business/GLOSSARY.md) before changing product behavior.
3. Keep capability boundaries with [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md).
4. Let [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) compose publications from this module’s readings — not the reverse.
5. If product scope or KPI intent changes, update this document and version it deliberately.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Financial Analysis |
| Canonical role | Product specification |
| Last Updated | 2026-07-28 |
