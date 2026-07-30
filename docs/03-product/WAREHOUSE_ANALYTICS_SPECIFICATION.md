# Warehouse Analytics Specification

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

Warehouse Analytics

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
- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)
- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)

---

Related Documents

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

On material change to warehouse performance scope, attribution rules, or neighboring inventory boundaries

---

Source of Truth

This file (product behavior for Warehouse Analytics). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Order ≠ Sale discipline remains owned by Glossary / Domain Model. Stock position and Warehouse Distribution (stock) remain owned by [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md). Commercial period authority remains owned by [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md).

---

Purpose

Define the canonical product specification for the Warehouse Analytics module: evaluate warehouse performance through warehouse-attributed sales and demand, warehouse inventory context for performance judgment, utilization and comparison, operational efficiency, geographic performance, and warehouse trends — without absorbing Inventory Intelligence or Financial Analysis ownership.

---

Scope

Product behavior for Warehouse Analytics only. Does not specify UI layout, components, database design, APIs, services, formulas beyond Glossary / Accounting meaning, or technical architecture.

---

## 1. Purpose

### Why Warehouse Analytics exists

Warehouse Analytics exists so the seller-operator can **judge fulfillment locations as commercial and operational performers** — which Warehouses generate Orders and completed Sales, how contribution concentrates geographically, how warehouses compare, and how performance trends — then decide where to focus replenishment attention, assortment placement pressure, and operational follow-up.

Inventory Intelligence answers stock **position** and replenishment health. Warehouse Analytics answers warehouse **performance** using Sales Performance attributed by Warehouse ([Data Model](../02-architecture/DATA_MODEL.md); [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md); [Glossary](../01-business/GLOSSARY.md): Warehouse Sales).

A Warehouse may **attribute** Orders and Sales analytically; it does **not** own those entities ([Domain Model](../02-architecture/DOMAIN_MODEL.md)).

### Business value

1. Makes geographic/fulfillment performance visible beyond account totals.
2. Separates demand (Orders) from completion (Sales / Buyout framing) at warehouse grain.
3. Enables warehouse comparison and trend reading for operational efficiency.
4. Connects performance attention to inventory distribution without merging modules.
5. Feeds Reporting warehouse intelligence sections under stable Glossary meaning.

### Problems solved

1. **Network opacity** — Account totals hide which Warehouses carry or fail the business.
2. **Stock vs sales confusion** — Warehouse Distribution (stock) is mistaken for Warehouse Sales (performance).
3. **Order/Sale collapse** — Demand and completed sales are blended at warehouse grain.
4. **False entity ownership** — Sellers think a Warehouse “owns” Orders as master data.
5. **Misdirected replenishment** — Stock is pushed without knowing which locations actually convert.

---

## 2. Business Questions

Every claim must declare Company, Marketplace Account, Reporting Period, and the **measure basis** (Orders vs Sales / units vs amounts / share cohort). Warehouse Analytics is a Sales Performance attribution reading — not Commercial Performance period authority and not Inventory Snapshot history ownership.

### Warehouse sales (performance)

- Which Warehouses generate completed Sales (units and/or commercial amounts under a stated basis)?
- How does warehouse-attributed Revenue or sales-presentation contribution concentrate?
- Which Warehouses underperform relative to peers in the same period?

### Warehouse demand

- Which Warehouses generate Orders (demand)?
- How does Order volume compare to completed Sale / Buyout completion by Warehouse?
- Where is demand strong but completion weak (investigation cue)?

### Warehouse inventory (performance context)

- How does warehouse stock position (from Inventory Intelligence) relate to warehouse sales performance?
- Which Warehouses sell well but are understocked — or stocked but idle?
- This remains **context and handoff**, not a second Inventory Intelligence module.

### Warehouse utilization

- Which Warehouses appear over-concentrated or under-used relative to sales share and stock share (stated bases)?
- Where is operational attention wasted on low-contribution locations?

### Warehouse comparison

- How do Warehouses rank on Orders, Sales units, contribution, and shares?
- Which locations are outliers for returns intensity when return attribution by warehouse is available and labeled?

### Operational efficiency

- Which Warehouses convert demand to completion more effectively (Orders vs Sales — labeled, not a hidden formula brand)?
- Where should operations investigate fulfillment friction?

### Geographic performance

- How does performance vary across the warehouse network geographically / by location identity?
- Which regions/locations deserve assortment or replenishment priority because they perform?

### Warehouse trends

- How did a Warehouse’s Orders, Sales, or contribution change versus prior periods?
- Which locations are rising or declining?

### Explicitly not answered here

- What is Stock Health, Days Left, or Produce / Purchase for a Model? → **Inventory Intelligence**
- What is period Net Profit under Commercial Performance? → **Financial Analysis**
- Why is a Model commercially weak regardless of warehouse? → **Product Analytics**
- What Sale Price should we set? → **Smart Pricing**

---

## 3. Scope

### 3.1 Included

| Area | Product inclusion |
|------|-------------------|
| Warehouse Sales | Sales Performance attributed by Warehouse (Glossary Warehouse Sales) |
| Demand attribution | Orders attributed by Warehouse where available |
| Completion attribution | Sales / Buyout framing attributed by Warehouse where available |
| Contribution / shares | Warehouse contribution and Sales Share–style shares under **declared basis and cohort** |
| Warehouse comparison | Ranking and peer comparison across Warehouses |
| Warehouse trends | Period-to-period warehouse performance change |
| Inventory context | Read Warehouse Distribution / stock position as adjacent context from Inventory Intelligence |
| Assortment within warehouse | Optional drill of Brand/Category/Model performance inside a Warehouse |
| Trust qualification | Consume Operational Monitoring; disclose incomplete attribution Coverage |

### 3.2 Not included

| Outside | Owner |
|---------|--------|
| Live stock, Days Left, Stock Health, replenishment action ownership | Inventory Intelligence |
| Inventory Snapshot history module | Inventory Intelligence |
| Period Commercial Performance / settlement authority | Financial Analysis |
| Assortment operational P&L as primary module | Product Analytics |
| Unit Cost / Purchases lifecycle | Cost Management / Purchasing |
| Smart Pricing | Pricing Support |
| Claiming Warehouse owns Order/Sale entities | Forbidden by Domain Model |

### 3.3 Relationship with neighboring modules

| Neighbor | Relationship |
|----------|--------------|
| **Inventory Intelligence** | Owns stock position, Warehouse Distribution (stock), coverage, health, replenishment. Warehouse Analytics consumes stock context; must not redefine inventory KPIs or absorb Produce / Purchase ownership. |
| **Product Analytics** | Owns product/Model commercial operational reading. Warehouse Analytics owns location performance; product-within-warehouse is a perspective, not Product Analytics capture. |
| **Financial Analysis** | Owns period commercial money authority. Warehouse-attributed Revenue/amounts must keep Glossary meaning and not invent a second period ledger. |
| **Reporting** | Composes Warehouse Intelligence / warehouse sales sections from this reading. |
| **Operational Monitoring** | Qualifies whether warehouse-attributed facts are complete enough. |

**Hard boundary:** Warehouse Sales ≠ Warehouse Distribution ([Glossary](../01-business/GLOSSARY.md)).

---

## 4. KPIs

Meaning from Glossary / Domain Model / Accounting category names where money appears. Bases must be declared.

### 4.1 Demand and completion

#### Orders (warehouse-attributed)

| Aspect | Definition |
|--------|------------|
| Business meaning | Marketplace customer Orders attributed to a Warehouse for the period |
| Management purpose | See demand geography |
| Supported decisions | Capacity and assortment placement attention |
| Dependencies | Glossary Order; Domain Model attribution rule; Order ≠ Sale |

#### Sales / Buyout units (warehouse-attributed)

| Aspect | Definition |
|--------|------------|
| Business meaning | Completed sale / buyout units attributed to a Warehouse |
| Management purpose | See completion geography |
| Supported decisions | Judge which locations actually convert |
| Dependencies | Glossary Sale / Buyout; distinct from Orders |

#### Orders vs Sales (labeled comparison)

| Aspect | Definition |
|--------|------------|
| Business meaning | Demand versus completion at warehouse grain — always labeled as two measures |
| Management purpose | Spot fulfillment/completion gaps |
| Supported decisions | Operational investigation without renaming Orders as Sales |
| Dependencies | Both measure streams retained separately |

### 4.2 Commercial contribution (stated basis)

#### Revenue or sales-presentation amounts (warehouse-attributed)

| Aspect | Definition |
|--------|------------|
| Business meaning | Money contribution attributed to Warehouse under an explicit basis (Revenue and/or Gross/Net Sales presentation — basis declared) |
| Management purpose | Economic weight of each location |
| Supported decisions | Prioritize high-contribution warehouses; investigate weak ones |
| Dependencies | Glossary money terms; Financial Analysis meaning when Revenue is claimed; Accounting Rules labels |

#### Sales Share (warehouse)

| Aspect | Definition |
|--------|------------|
| Business meaning | Share of sales or orders attributed to a warehouse within a stated distribution/cohort view; may be orders-based or amount-based depending on stated basis |
| Management purpose | Concentration and comparison |
| Supported decisions | Network balancing attention |
| Dependencies | Glossary Sales Share; declared basis; not stock Warehouse Distribution |

### 4.3 Inventory context KPIs (consumed, not owned)

#### Current Stock / Warehouse Distribution (context)

| Aspect | Definition |
|--------|------------|
| Business meaning | Stock position by Warehouse from Inventory Intelligence |
| Management purpose | Relate performance to on-hand geography |
| Supported decisions | Joint replenishment attention with Inventory Intelligence |
| Dependencies | Inventory Intelligence ownership; must remain labeled as stock context |

### 4.4 Comparison and trends

#### Warehouse ranking metrics

| Aspect | Definition |
|--------|------------|
| Business meaning | Ordered warehouse list by declared basis (Orders, Sales units, contribution, share, trend delta) |
| Management purpose | Focus operational attention |
| Supported decisions | Weekly warehouse priorities |
| Dependencies | Declared ranking basis |

#### Period comparison / warehouse trends

| Aspect | Definition |
|--------|------------|
| Business meaning | Change in the same warehouse KPI across declared Reporting Periods |
| Management purpose | Rising/declining location detection |
| Supported decisions | Investigate network shifts |
| Dependencies | Historical integrity; same basis; disclosed incompleteness |

### 4.5 Returns (when warehouse-attributed)

#### Return Rate / Returned Units (warehouse-attributed, when available)

| Aspect | Definition |
|--------|------------|
| Business meaning | Return intensity attributed to Warehouse only when attribution exists and is labeled |
| Management purpose | Location-level return pressure |
| Supported decisions | Operational quality follow-up |
| Dependencies | Glossary Return measures; must not invent attribution when unavailable |

---

## 5. Business Capabilities

### 5.1 Warehouse sales performance reading

**Why.** Locations must be judged by commercial/sales outcomes, not only stock maps.  
**Provides.** Warehouse Sales analytics for completed activity under stated bases.

### 5.2 Warehouse demand reading

**Why.** Demand and completion are different management questions.  
**Provides.** Orders attribution distinct from Sales.

### 5.3 Warehouse comparison

**Why.** Networks need peer judgment.  
**Provides.** Ranking, shares, and outlier detection across Warehouses.

### 5.4 Geographic / network performance

**Why.** Fulfillment geography drives operational focus.  
**Provides.** Location-oriented performance perspectives and contribution concentration.

### 5.5 Trend monitoring

**Why.** Network shifts matter week to week.  
**Provides.** Period comparison for warehouse KPIs under stable bases.

### 5.6 Performance–inventory bridging

**Why.** Selling well while empty (or stocked while idle) is a joint risk.  
**Provides.** Explicit bridge to Inventory Intelligence stock context without module merger.

### 5.7 Reporting feed

**Why.** Management documents need warehouse intelligence sections.  
**Provides.** Stable readings for Reporting composition.

### 5.8 Trust-aware attribution

**Why.** Partial warehouse attribution creates false rankings.  
**Provides.** Incompleteness disclosure via Operational Monitoring signals.

---

## 6. Analysis Perspectives

| Perspective | Why it matters here |
|-------------|---------------------|
| Company | Tenant boundary |
| Marketplace | Platform context |
| Marketplace Account | Selling-identity scope |
| Time / Reporting Period | Performance window and trends |
| Warehouse | Primary performance grain |
| Brand / Category / Product / Model / SKU | Assortment within a warehouse |
| Measure basis | Orders vs Sales; units vs amounts; share cohort |

Not primary: Live Inventory Snapshot history ownership; settlement cash calendars; Smart Pricing axes.

---

## 7. User Workflows

### 7.1 Daily network pulse

**Intent.** See whether key Warehouses are still converting.  
**Flow.** Period short window → top Warehouses by Orders and Sales → note anomalies → check trust.  
**Success.** Fast network pulse without inventory module takeover.

### 7.2 Weekly warehouse performance review

**Intent.** Rank locations and set operational attention.  
**Flow.** Compare Warehouses on declared bases → review shares → bridge understocked high performers to Inventory Intelligence → assign follow-ups.  
**Success.** Clear location priority list.

### 7.3 Monthly geographic review

**Intent.** Judge network contribution structure.  
**Flow.** Month scope → contribution concentration → trends vs prior month → Reporting handoff if needed.  
**Success.** Structural location keep/focus/fix attention identified.

### 7.4 Exception — demand without completion

**Intent.** Investigate Warehouses with strong Orders and weak Sales.  
**Flow.** Keep Orders and Sales separate → localize assortment within warehouse → hand off operations/inventory as needed.  
**Success.** Gap classified without renaming measures.

### 7.5 Exception — stocked but idle

**Intent.** Find Warehouses with stock but weak sales.  
**Flow.** Performance reading + Inventory Intelligence distribution context → Stop Purchasing / redistribution attention cues → Product Analytics if assortment is the cause.  
**Success.** Idle capital locations identified jointly without ownership confusion.

### 7.6 Decision making — where to prioritize replenishment attention

**Intent.** Prefer locations that perform.  
**Flow.** Rank warehouse contribution → confirm stock gaps via Inventory Intelligence → Produce / Purchase cues remain Inventory/Purchasing path.  
**Success.** Replenishment attention follows performance + coverage, not guesswork.

### 7.7 Investigation — product inside warehouse

**Intent.** Explain a warehouse’s weakness via assortment.  
**Flow.** Warehouse total → Brand/Model drill → hand off deep commercial diagnosis to Product Analytics when needed.  
**Success.** Location and product questions stay consistent.

### 7.8 Planning / optimization

**Intent.** Inform network planning.  
**Flow.** Trends + shares → planning cues for inventory and assortment placement → Reporting for management narrative.  
**Success.** Plans cite declared bases and correct module owners.

---

## 8. Filters

| Filter | Business purpose |
|--------|------------------|
| Company | Tenant isolation |
| Marketplace | Platform constraint |
| Marketplace Account | Selling-identity boundary |
| Reporting Period | Performance time bounds |
| Warehouse | Focus one or many locations |
| Brand / Category / Product / Model / SKU | Assortment within network/location |
| Measure basis (Orders / Sales / amounts / shares) | Force honest comparison basis |
| Ranking basis | Declare attention ordering |

**Filter discipline:** filters must not convert Warehouse Sales into Warehouse Distribution, or Orders into Sales.

---

## 9. Drill-down Principles

1. **Network → Warehouse → assortment grain** while preserving attribution meaning.
2. **Order ≠ Sale** at every level.
3. **Basis stability** — share and contribution bases do not silently change mid-drill.
4. **No entity ownership fiction** — Warehouse attributes; it does not own Order/Sale master identity.
5. **Stock context is labeled handoff** — opening distribution/health views enters Inventory Intelligence rules.
6. **No period ledger fork** — warehouse Revenue claims keep Glossary/Accounting meaning aligned with Financial Analysis.
7. **Model/reading honesty** — drill-down does not become Smart Pricing or settlement framing.
8. **Trust travels** with incomplete attribution.

---

## 10. Dependencies

### Depends on

| Dependency | Why |
|------------|-----|
| [Project DNA](../00-project/PROJECT_DNA.md) | Decision support; explainability |
| [Glossary](../01-business/GLOSSARY.md) | Warehouse Sales vs Distribution; Order/Sale |
| [Business Model](../01-business/BUSINESS_MODEL.md) | Sales Performance domain |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Money label discipline when amounts are shown |
| [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md) | Layer placement |
| [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md) | Durable attributed facts |
| [Sync Engine](../02-architecture/SYNC_ENGINE.md) | Intake of orders/sales/stock evidence |
| [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md) | Capability cooperation rules |
| [Domain Model](../02-architecture/DOMAIN_MODEL.md) | Warehouse attribution without entity ownership |
| [Data Model](../02-architecture/DATA_MODEL.md) | Warehouse Analytics read model |
| [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) | Warehouse Intelligence composition |
| [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md) | External location labels map inward |
| [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md) | Trust and change control |
| [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md) | Stock context neighbor and hard boundary |
| [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md) | Assortment commercial neighbor |
| [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md) | Period money meaning boundary |

---

## 11. Module-specific Business Rules

1. **Warehouse Sales ≠ Warehouse Distribution.** Performance and stock maps are different products ([Glossary](../01-business/GLOSSARY.md)).
2. **Attribution ≠ ownership.** Warehouses attribute Orders/Sales; they do not own those entities ([Domain Model](../02-architecture/DOMAIN_MODEL.md)).
3. **Order ≠ Sale at warehouse grain.** Demand and completion remain distinct measures.
4. **Declare basis.** Shares, rankings, and contribution lists without a stated basis are defects.
5. **Inventory KPIs are not redefined here.** Days Left, Stock Health, Produce / Purchase remain Inventory Intelligence.
6. **No second Commercial Performance ledger.** Warehouse money claims use Glossary terms consistently with Financial Analysis meaning.
7. **Buyout ≠ Purchases module** when completion framing appears.
8. **Sales Share basis honesty.** Orders-based share must not be labeled as revenue share.
9. **Bridge, don’t merge** with Inventory Intelligence when relating stock to performance.
10. **Trust visibility** for incomplete warehouse attribution Coverage.
11. **Reporting composition** must preserve Warehouse Sales vs Distribution distinction in warehouse sections.

---

## 12. Success Criteria

A successful Warehouse Analytics module enables management to:

1. **Evaluate warehouse performance** — Orders, Sales, contribution, and shares are understandable by location.
2. **Compare and trend locations** — Rising/falling warehouses are visible under stable bases.
3. **Improve operational efficiency** — Demand/completion gaps and idle vs hot locations drive action.
4. **Align replenishment attention** — Performance informs where Inventory Intelligence / Purchasing focus should go.
5. **Preserve boundaries** — Stock health and period P&L remain correctly owned elsewhere.
6. **Trust network readings** — Incomplete attribution is disclosed.

Failure modes: Distribution confused with Sales; Orders renamed as Sales; Warehouse treated as Order owner; inventory module absorption; undeclared share bases; silent second ledger.

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
- Formula invention beyond Glossary / Accounting meaning
- Statutory logistics/accounting products

This document defines business capabilities only.

---

## How to use this document

1. Judge Warehouse Analytics changes against §2.
2. Keep Warehouse Sales vs Warehouse Distribution absolute.
3. Keep Order ≠ Sale absolute at every warehouse grain.
4. Version deliberately when attribution or comparison product intent changes.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Warehouse Analytics |
| Canonical role | Product specification |
| Last Updated | 2026-07-28 |
| Program step | STEP 3 of Product Specification Program |
