# Inventory Intelligence Specification

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

Inventory Intelligence

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
- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)
- [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md)

---

Related Documents

- [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md)
- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
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

On material change to inventory decision support, snapshot philosophy, or replenishment workflows

---

Source of Truth

This file (product behavior for Inventory Intelligence). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Live State vs Historical Snapshot time discipline remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md). Capability ownership remains owned by [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md). Assortment commercial diagnosis remains owned by [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md). Warehouse performance as a primary module remains owned by [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md).

---

Purpose

Define the canonical product specification for the Inventory Intelligence module: inventory health, availability, coverage, aging, risk, replenishment decision support, inventory history, and inventory quality — without absorbing commercial P&L authority or warehouse-network performance ownership.

---

Scope

Product behavior for Inventory Intelligence only. Does not specify UI layout, components, database design, APIs, services, formulas beyond Accounting Rules / Glossary meaning, or technical architecture.

---

## 1. Purpose

### Why Inventory Intelligence exists

Inventory Intelligence exists so the seller-operator can **understand stock as working capital and operational risk** — what is available now, how coverage looks, what is aging or dead, where replenishment is justified, and how inventory looked in the past — then decide to produce/purchase, stop purchasing, redistribute attention across warehouses, or wait.

Commercial profit answers live in Financial Analysis and Product Analytics. Inventory Intelligence answers: **can we fulfill, for how long, at what stock quality, and what should we do about stock position?** ([Business Model](../01-business/BUSINESS_MODEL.md) Inventory Management; [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md); [Glossary](../01-business/GLOSSARY.md): Inventory Intelligence).

It is inventory decision support. It is **not** Commercial Performance, not Product Analytics operational P&L, not Purchasing’s procurement ledger, and not a substitute for Warehouse Analytics’ warehouse-performance questions.

### Business value

1. Prevents stockouts and overstock through coverage and health signals.
2. Separates Live State (“now”) from Inventory Snapshot history (“then”).
3. Turns velocity and recency into replenishment-oriented guidance (Recommended Stock, Produce / Purchase, Stop Purchasing).
4. Makes Warehouse Distribution visible as stock position geography — without claiming warehouse sales performance ownership.
5. Protects historical inventory integrity so past stock can be reviewed without rewriting the present.

### Problems solved

1. **Availability blindness** — Sellers cannot see Low Stock / Out of Stock risk until sales are already lost.
2. **Coverage opacity** — Current Stock without Days Left does not support replenishment timing.
3. **Aging capital** — Slow, At Risk, and Dead Stock trap money without a health taxonomy.
4. **History loss** — Live stock overwrites the ability to explain past inventory positions.
5. **Domain confusion** — Inventory totals are mistaken for Revenue, Inventory Value for Product Cost, From Customer transit for Return, Inventory Snapshot for Verification Snapshot.

---

## 2. Business Questions

Every claim must declare Company, Marketplace Account, and whether the reading is **Live State** (Current Inventory) or **Historical Snapshot** (Inventory History / Inventory Snapshot date). Inventory readings are non-P&L unless Inventory Value is explicitly available and labeled ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §9.1).

### Availability

- What is Current Stock for each Model / SKU / Warehouse scope?
- Which items are Low Stock or Out of Stock (Inventory Status)?
- How much stock is To Customer or From Customer when transit is available?
- Is availability trustworthy enough given Sync Verification / Coverage?

### Coverage

- What is Days Left (coverage horizon) at recent sell-through?
- Which items will stock out soon if velocity continues?
- How does Average Daily Sales support coverage reasoning?

### Aging and stock health

- What is Stock Health (Healthy / Slow / At Risk / Dead Stock) based on recency/velocity signals?
- Which items are aging into Slow, At Risk, or Dead Stock?
- How does Days Since Last Sale inform health classification?

### Inventory risk

- Where is stockout risk concentrated (coverage + availability)?
- Where is overstock / trapped capital risk concentrated?
- Which items combine weak commercial outcomes (from Product Analytics) with bad stock health?

### Replenishment decisions

- What is Recommended Stock versus Current Stock?
- Should we Produce / Purchase, or Stop Purchasing?
- What is Stock Difference relative to recommendation-oriented targets?
- Which replenishment actions are urgent this week?

### Inventory history

- What did inventory look like on a past Inventory Snapshot date?
- How did stock position change across Inventory History?
- Are we reading history without confusing it with today’s Live State?

### Inventory quality

- Is Inventory Value available for capital reading, or must quantity-only discipline apply?
- Are transit quantities distinct from on-hand Current Stock?
- Are snapshot and live readings labeled so sellers do not mix them?

### Explicitly not answered here

- Which products are commercially profitable? → **Product Analytics** / **Financial Analysis**
- What Sale Price should we set? → **Smart Pricing**
- How does each warehouse perform on sales/orders as a performance module? → **Warehouse Analytics**
- What did we buy from Suppliers, and what is the purchase lifecycle? → **Purchasing**
- What Unit Cost should we maintain? → **Cost Management**

---

## 3. Scope

### 3.1 Included

| Area | Product inclusion |
|------|-------------------|
| Live availability | Current Inventory, Current Stock, Inventory Status (Healthy / Low / Out) |
| Transit (when available) | To Customer, From Customer — distinct from Return |
| Coverage | Days Left, Average Daily Sales support for coverage |
| Stock health / aging | Stock Health classes; Days Since Last Sale; Dead Stock / Slow / At Risk |
| Inventory risk | Stockout and overstock risk signals; Overstock language where defined |
| Replenishment support | Recommended Stock, Stock Difference, Produce / Purchase, Stop Purchasing |
| Warehouse distribution (stock) | Warehouse Distribution of inventory position; Warehouse Count |
| Inventory history | Inventory History via Inventory Snapshots; Current Snapshot vs historical snapshot labeling |
| Inventory value | Inventory Value when available; explicit unavailability when not |
| Sales velocity context | May consume sales-velocity signals for coverage/health without becoming Financial Analysis |
| Trust qualification | Consume Operational Monitoring; disclose incomplete stock/sync readiness |

### 3.2 Not included

| Outside | Owner |
|---------|--------|
| Authoritative Commercial Performance / settlement P&L | Financial Analysis |
| Operational product P&L / product ranking as commercial module | Product Analytics |
| Warehouse sales performance and warehouse comparison as primary duty | Warehouse Analytics (Step 3) |
| Unit Cost stewardship | Cost Management |
| Supplier purchase lifecycle / receiving as procurement module | Purchasing |
| Smart Pricing simulation | Pricing Support |
| Sync Verification Snapshot authority | Sync Engine / Operational Monitoring |
| Statutory inventory accounting filings | Out of product framework |

### 3.3 Relationship with neighboring modules

| Neighbor | Relationship |
|----------|--------------|
| **Product Analytics** | Upstream/adjacent commercial diagnosis. Inventory may use velocity context; must not override commercial Revenue/Net Profit meaning. Commercial weakness + bad stock health is a joint investigation, not merged ownership. |
| **Financial Analysis** | May show inventory beside profit as adjacent context only; inventory must not alter Revenue meaning. |
| **Warehouse Analytics** | Owns warehouse **performance** questions (sales, utilization, geographic performance). Inventory Intelligence owns stock **position**, distribution of inventory, and replenishment support. Overlap on “warehouse” is perspective vs performance — must not duplicate responsibilities. |
| **Purchasing** | Downstream for executing procurement after Produce / Purchase cues; Inventory does not own purchase documents. |
| **Cost Management** | Inventory Value may depend on cost inputs when valuation exists; Inventory does not own Unit Cost. |
| **Reporting** | May compose inventory sections from this reading; Live vs Snapshot labels must survive composition. |
| **Operational Monitoring** | Qualifies whether live or historical inventory claims are decision-grade. |

**Logical dependency note:** Warehouse Analytics product specification is Program Step 3. Until it exists, warehouse-performance questions remain out of Inventory Intelligence scope by architecture and this document’s boundaries.

---

## 4. KPIs

Meaning owned by [Glossary](../01-business/GLOSSARY.md). Time discipline owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md) §7. No formula invention here.

### 4.1 Availability

#### Current Stock

| Aspect | Definition |
|--------|------------|
| Business meaning | On-hand quantity in Live State for the scoped grain |
| Management purpose | Know what can sell now |
| Supported decisions | Fulfillment confidence; urgency triage |
| Dependencies | Glossary Current Stock; Live State; not Inventory Snapshot |

#### Inventory Status (Healthy / Low Stock / Out of Stock)

| Aspect | Definition |
|--------|------------|
| Business meaning | Simple on-hand availability display status |
| Management purpose | Fast availability filter |
| Supported decisions | Rescue OOS/Low items; distinct from Stock Health taxonomy |
| Dependencies | Glossary Inventory Status; not Stock Health; not Sync Verification health |

#### To Customer / From Customer

| Aspect | Definition |
|--------|------------|
| Business meaning | In-transit quantities toward customer / returning from customer when available |
| Management purpose | See pipeline beyond on-hand |
| Supported decisions | Avoid treating transit as sellable on-hand; From Customer ≠ Return event |
| Dependencies | Glossary; Domain Model; Inventory Snapshot when historical |

#### Warehouse Count / Warehouse Distribution (stock)

| Aspect | Definition |
|--------|------------|
| Business meaning | How stock is spread across Warehouses |
| Management purpose | Geographic/fulfillment position awareness |
| Supported decisions | Attention to empty vs overloaded locations; hand off performance questions to Warehouse Analytics |
| Dependencies | Glossary Warehouse Distribution; not Warehouse Sales performance module |

### 4.2 Coverage

#### Days Left

| Aspect | Definition |
|--------|------------|
| Business meaning | Estimated days of stock remaining at recent sell-through — primary coverage horizon |
| Management purpose | Timing of replenishment |
| Supported decisions | Produce / Purchase urgency; prevent stockout |
| Dependencies | Current Stock; Average Daily Sales; Glossary Days Left |

#### Average Daily Sales

| Aspect | Definition |
|--------|------------|
| Business meaning | Velocity input for coverage and recommendation reasoning |
| Management purpose | Ground Days Left and Recommended Stock |
| Supported decisions | Distinguish no-velocity items from true coverage risk |
| Dependencies | Glossary; sales activity facts; not period Units Sold synonym without statement |

### 4.3 Aging and health

#### Stock Health (Healthy / Slow / At Risk / Dead Stock)

| Aspect | Definition |
|--------|------------|
| Business meaning | Inventory intelligence classification based primarily on days since last sale / dynamic recency-velocity signal |
| Management purpose | Aging and dead-capital detection |
| Supported decisions | Stop Purchasing; clearance attention; distinct from Inventory Status availability |
| Dependencies | Glossary Stock Health; Days Since Last Sale |

#### Days Since Last Sale

| Aspect | Definition |
|--------|------------|
| Business meaning | Recency signal for health classification |
| Management purpose | Explain why an item is Slow / At Risk / Dead Stock |
| Supported decisions | Aging investigation |
| Dependencies | Glossary; Last Sale Date related concepts |

### 4.4 Replenishment decision support

#### Recommended Stock

| Aspect | Definition |
|--------|------------|
| Business meaning | Suggested stock level for replenishment decision support |
| Management purpose | Target position for planning |
| Supported decisions | Produce / Purchase sizing cues |
| Dependencies | Glossary; Days Left / velocity context |

#### Stock Difference

| Aspect | Definition |
|--------|------------|
| Business meaning | Difference signal between observed stock and recommendation-oriented targets |
| Management purpose | Quantify gap to act on |
| Supported decisions | Prioritize replenishment or reduction |
| Dependencies | Current Stock; Recommended Stock |

#### Produce / Purchase

| Aspect | Definition |
|--------|------------|
| Business meaning | Replenishment action cue to create or buy more stock |
| Management purpose | Convert coverage risk into an action class |
| Supported decisions | Start procurement/production planning (Purchasing handoff) |
| Dependencies | Glossary; not Buyout; not Purchases module ownership |

#### Stop Purchasing

| Aspect | Definition |
|--------|------------|
| Business meaning | Action cue to halt further procurement for an item |
| Management purpose | Protect capital from Overstock / Dead Stock |
| Supported decisions | Freeze inbound supply attention |
| Dependencies | Glossary; Stock Health / Overstock signals |

#### Overstock

| Aspect | Definition |
|--------|------------|
| Business meaning | Excess stock relative to operational need / recommendation context |
| Management purpose | Identify trapped capital |
| Supported decisions | Stop Purchasing; clearance or redistribution attention |
| Dependencies | Glossary Overstock |

### 4.5 History and capital

#### Inventory Snapshot / Inventory History

| Aspect | Definition |
|--------|------------|
| Business meaning | Point-in-time stock capture and the history workspace over dated snapshots |
| Management purpose | Review past inventory without rewriting Live State |
| Supported decisions | Incident investigation; historical comparison; audit of past availability |
| Dependencies | Glossary; Historical Integrity; Inventory Snapshot ≠ Verification Snapshot |

#### Inventory Value

| Aspect | Definition |
|--------|------------|
| Business meaning | Monetary value of inventory when available |
| Management purpose | Capital tied in stock |
| Supported decisions | Working-capital attention; must not pretend availability when valuation is absent |
| Dependencies | Glossary; Accounting Rules non-P&L inventory value boundary; Cost Management inputs when valuation depends on cost |

---

## 5. Business Capabilities

### 5.1 Live inventory awareness

**Why.** Sellers operate on what can ship now.  
**Provides.** Current Inventory readings: Current Stock, Inventory Status, transit when available.

### 5.2 Coverage intelligence

**Why.** Quantity without horizon is not a replenishment plan.  
**Provides.** Days Left and velocity-backed coverage reasoning.

### 5.3 Stock health and aging

**Why.** Capital dies quietly in Slow / At Risk / Dead Stock.  
**Provides.** Stock Health taxonomy and recency explanation.

### 5.4 Replenishment decision support

**Why.** Inventory must drive Produce / Purchase vs Stop Purchasing choices.  
**Provides.** Recommended Stock, Stock Difference, and action cues — without owning Purchasing documents.

### 5.5 Warehouse stock distribution

**Why.** Stock is geographic/fulfillment-distributed.  
**Provides.** Warehouse Distribution of inventory position; clear handoff for warehouse **performance** to Warehouse Analytics.

### 5.6 Inventory history

**Why.** Past stock must remain inspectable.  
**Provides.** Inventory Snapshot–based Inventory History with Live vs Historical labeling.

### 5.7 Inventory quality and honesty

**Why.** False precision destroys trust.  
**Provides.** Explicit Inventory Value availability; transit ≠ on-hand; snapshot ≠ verification; incompleteness visible.

### 5.8 Cross-capability cues

**Why.** Stock decisions interact with commercial and procurement realities.  
**Provides.** Handoffs to Product Analytics (commercial weakness), Purchasing (execute buy), Warehouse Analytics (performance), Cost Management (valuation inputs), Reporting (composition).

---

## 6. Analysis Perspectives

| Perspective | Why it matters here |
|-------------|---------------------|
| Company | Tenant boundary |
| Marketplace | Platform context |
| Marketplace Account | Selling-identity stock scope |
| Time — Live State | Current operational inventory |
| Time — Inventory Snapshot date | Historical inventory reading |
| Warehouse | Stock location / distribution |
| Brand / Category | Assortment structure for inventory attention |
| Product / Model / Supplier Article | Primary replenishment and health grains |
| SKU / Size / Barcode | Size-level availability and dead-stock isolation |
| Supplier (procurement) | Optional cue toward Purchasing — not purchase ownership |

Not primary here: Settlement Date calendars; Smart Pricing scenario axes; Commercial Performance P&L grains as inventory substitutes.

---

## 7. User Workflows

### 7.1 Daily availability check

**Intent.** Prevent today’s stockouts.  
**Flow.** Live scope → filter Low/Out → check Days Left on critical Models → action Produce / Purchase or escalate.  
**Success.** Imminent stockouts visible before lost Sales.

### 7.2 Weekly replenishment review

**Intent.** Plan inbound stock for the week.  
**Flow.** Rank by Days Left and Stock Difference → separate Stop Purchasing candidates (Overstock/Dead) → hand off Produce / Purchase list to Purchasing planning.  
**Success.** Clear buy/stop list with Live State labels.

### 7.3 Monthly inventory quality review

**Intent.** Reduce trapped capital and improve inventory quality.  
**Flow.** Stock Health review → Dead/Slow concentration → Inventory Value if available → compare commercial weakness via Product Analytics handoff → decide stop/clearance/replenish postures.  
**Success.** Aging capital addressed; domains not merged incorrectly.

### 7.4 Exception — stockout spike

**Intent.** Respond to sudden OOS on important Models.  
**Flow.** Confirm Live State → check Warehouse Distribution → check transit → check sync trust → emergency Produce / Purchase cue → commercial impact awareness via Product Analytics if needed.  
**Success.** Cause class (true stockout vs sync/trust vs distribution) identified.

### 7.5 Exception — dead stock accumulation

**Intent.** Stop feeding dead capital.  
**Flow.** Stock Health Dead/At Risk → Stop Purchasing → optional commercial diagnosis → Reporting/management narrative if material.  
**Success.** Inbound freeze decision made.

### 7.6 Investigation — inventory history

**Intent.** Explain a past availability or incident.  
**Flow.** Choose Inventory Snapshot date → read historical position → do not overwrite with Live State → contrast with present only as a labeled comparison.  
**Success.** Past stock explained under Historical Integrity.

### 7.7 Decision making — replenish vs wait

**Intent.** Choose whether to buy more now.  
**Flow.** Days Left + Recommended Stock + Stock Health + trust qualification → Produce / Purchase, Stop Purchasing, or wait for better Coverage.  
**Success.** Decision matches coverage and health, not gut feel alone.

### 7.8 Planning / optimization

**Intent.** Feed procurement and warehouse attention plans.  
**Flow.** Coverage and distribution cues → Purchasing for execution → Warehouse Analytics for performance/utilization questions → keep Inventory Intelligence as position/health owner.  
**Success.** Plans start from correct module ownership.

---

## 8. Filters

| Filter | Business purpose |
|--------|------------------|
| Company | Tenant isolation |
| Marketplace | Platform constraint |
| Marketplace Account | Selling-identity stock boundary |
| Live vs History mode | Force honest time basis (Live State vs Inventory Snapshot) |
| Snapshot date (history) | Select the historical inventory moment |
| Warehouse | Position geography |
| Brand / Category | Structural inventory focus |
| Product / Model / Supplier Article / SKU | Replenishment and health grain |
| Inventory Status | Availability triage (Healthy/Low/Out) |
| Stock Health | Aging triage (Healthy/Slow/At Risk/Dead) |
| Coverage / Days Left bands (when offered) | Replenishment urgency bands |

**Filter discipline:** switching Live ↔ History must be explicit. Filters must not turn inventory into Commercial Performance or silently treat From Customer as Return.

---

## 9. Drill-down Principles

1. **Portfolio → Model → SKU → Warehouse** while preserving Live vs Snapshot labeling.
2. **Meaning stability** — Current Stock, Days Left, Stock Health keep Glossary meaning at every grain.
3. **No accounting-model smuggling** — Drill-down does not convert inventory into Commercial Performance, WB Settlement, or Smart Pricing.
4. **Inventory Status ≠ Stock Health** at every level — availability taxonomy and aging taxonomy stay distinct.
5. **Transit honesty** — To Customer / From Customer remain distinct from on-hand and from Return.
6. **History immutability in spirit** — Historical Snapshot drill-down must not be silently replaced by Live State.
7. **Handoff, not absorption** — Warehouse performance, purchasing execution, commercial P&L, and pricing remain other modules.
8. **Trust travels** — Incomplete sync/stock readiness remains visible at detail.

---

## 10. Dependencies

### Depends on

| Dependency | Why |
|------------|-----|
| [Project DNA](../00-project/PROJECT_DNA.md) | Historical integrity; decision support |
| [Glossary](../01-business/GLOSSARY.md) | Inventory vocabulary |
| [Business Model](../01-business/BUSINESS_MODEL.md) | Inventory Management domain |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Live State vs Snapshot; non-P&L inventory value |
| [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md) | Layer placement |
| [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md) | Durable snapshot and stock facts |
| [Sync Engine](../02-architecture/SYNC_ENGINE.md) | Intake of stock reality |
| [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md) | Inventory Intelligence capability |
| [Domain Model](../02-architecture/DOMAIN_MODEL.md) | Inventory, Snapshot, Warehouse entities |
| [Data Model](../02-architecture/DATA_MODEL.md) | Inventory Intelligence read model |
| [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) | Inventory section composition rules |
| [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md) | External stock labels map inward |
| [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md) | Trust and change control |
| [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md) | Commercial diagnosis neighbor |
| [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md) | Adjacent profit context boundary |

### Logical neighbor (product spec)

| Partner | Relationship |
|---------|--------------|
| [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md) | Warehouse **performance** owner; Inventory keeps stock position/health/replenishment |

### Cooperates with

| Partner | Relationship |
|---------|--------------|
| Purchasing / Cost Management | Execute buys; valuation inputs |
| Reporting / Monitoring / Administration | Composition, trust, tenancy |

---

## 11. Module-specific Business Rules

1. **Live State ≠ Inventory Snapshot.** Mixing them unlabeled is a defect ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §7; Domain Model).
2. **Inventory Snapshot ≠ Verification Snapshot.** Stock history is not sync-trust evaluation.
3. **Inventory Status ≠ Stock Health.** Availability badges are not aging classes.
4. **From Customer ≠ Return.** Transit is not a Return event.
5. **Non-P&L default.** Inventory quantities are not Revenue, Net Profit, or Product Cost. Inventory Value is capital reading when available — never a silent commercial P&L substitute.
6. **Sales velocity is context, not Financial Analysis capture.** Showing velocity for Days Left does not transfer commercial ledger ownership.
7. **Warehouse Distribution (stock) ≠ Warehouse Sales (performance).** Performance questions hand off to Warehouse Analytics.
8. **Produce / Purchase cues ≠ Purchases module ownership.** Procurement documents remain Purchasing’s duty.
9. **Stop Purchasing protects capital** and must be available where Overstock/Dead Stock risk is material.
10. **Inventory Value honesty.** If monetary valuation is unavailable, say so — do not invent it ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §9.2).
11. **Historical Integrity.** Live updates must not silently rewrite published historical inventory readings.
12. **Trust visibility.** Incomplete Coverage must not be hidden behind confident replenishment rankings.

---

## 12. Success Criteria

A successful Inventory Intelligence module enables management to:

1. **See inventory health** — Availability, coverage, and aging are understandable at Model/SKU/Warehouse grains.
2. **Reduce inventory risk** — Stockouts and overstock are detected early enough to act.
3. **Decide replenishment** — Produce / Purchase vs Stop Purchasing decisions are grounded in Days Left, Recommended Stock, and Stock Health.
4. **Trust history** — Past Inventory Snapshots remain inspectable and distinct from Live State.
5. **Keep domain boundaries** — Commercial, warehouse-performance, procurement, and pricing questions hand off correctly.
6. **Improve working-capital quality** — Dead and slow stock shrink over time under deliberate action.

Failure modes: Live/Snapshot confusion; Stock Health collapsed into Inventory Status; From Customer treated as Return; inventory presented as P&L; warehouse performance absorbed; purchase ownership absorbed; hiding incomplete sync.

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
- Formula invention beyond Glossary / Accounting Rules meaning
- Statutory inventory accounting products

This document defines business capabilities only.

---

## How to use this document

1. Judge Inventory Intelligence changes against §2 business questions.
2. Keep Live vs Snapshot and health vs availability distinctions absolute.
3. Hand warehouse **performance** to Warehouse Analytics; hand commercial P&L to Financial Analysis / Product Analytics; hand buy execution to Purchasing.
4. Version this document deliberately when replenishment or history product intent changes.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Inventory Intelligence |
| Canonical role | Product specification |
| Last Updated | 2026-07-28 |
| Program step | STEP 2 of Product Specification Program |
