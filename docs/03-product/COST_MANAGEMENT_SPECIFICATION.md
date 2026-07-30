# Cost Management Specification

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

Cost Management

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
- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
- [Smart Pricing Specification](./SMART_PRICING_SPECIFICATION.md)

---

Related Documents

- [Purchasing Specification](./PURCHASING_SPECIFICATION.md)
- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)
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

On material change to Unit Cost stewardship, cost lifecycle, or Product Cost input boundaries

---

Source of Truth

This file (product behavior for Cost Management). [Accounting Rules](../01-business/ACCOUNTING_RULES.md) own Product Cost meaning. [Glossary](../01-business/GLOSSARY.md) owns Unit Cost / Product Cost vocabulary. This module owns seller **stewardship** of Unit Cost inputs ([Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)).

---

Purpose

Define the canonical product specification for Cost Management: maintain product costs, historical cost awareness, cost stewardship, ownership, lifecycle, and cost quality so Product Cost interpretation elsewhere remains trustworthy.

---

Scope

Product behavior for Cost Management only. Does not specify UI, database, APIs, services, or implementation.

---

## 1. Purpose

### Why Cost Management exists

Cost Management exists so the seller-operator can **steward Unit Cost** — the per-unit merchandise cost keyed typically by Supplier Article — that feeds Product Cost in Commercial Performance, Product Analytics, Smart Pricing, and inventory valuation contexts when used.

Without cost stewardship, Net Profit and margins become fiction even when Marketplace fees are perfect. Accounting Rules define what Product Cost **means**; Cost Management ensures the **inputs** exist, are owned, current enough, and historically traceable as stewardship records.

### Business value

1. Makes Product Cost possible and trustworthy across modules.
2. Creates clear cost ownership and accountability for assortment.
3. Supports historical cost awareness when costs change over time.
4. Improves cost quality so pricing and profitability decisions are grounded.
5. Separates seller COGS stewardship from marketplace Buyout and from Purchases execution details where those differ.

### Problems solved

1. Missing Unit Cost → empty or misleading Product Cost.
2. Stale costs → false margins and false Smart Pricing solves.
3. Unowned costs → nobody accountable for corrections.
4. Confusion between Unit Cost, Product Cost, Logistics, and Purchases module.
5. Silent cost changes that rewrite understanding of past periods without governance.

---

## 2. Business Questions

- Which Supplier Articles / Models lack Unit Cost?
- What Unit Cost is in force for an item now?
- How has Unit Cost changed historically (stewardship history)?
- Who owns cost quality for this assortment slice?
- Is cost quality good enough for Financial Analysis / Product Analytics / Smart Pricing decisions?
- Which items should be cost-reviewed after margin anomalies?
- How do purchase events inform cost updates without Cost Management becoming the Purchasing ledger?

### Not answered here

- Period Product Cost totals as P&L authority → Financial Analysis (meaning) using these inputs
- Operational product ranking → Product Analytics
- Recommended Sale Price → Smart Pricing
- Purchase order lifecycle → Purchasing
- Stock replenishment → Inventory Intelligence

---

## 3. Scope

### Included

Unit Cost maintenance; cost stewardship workflows; cost ownership accountability; cost lifecycle (create → update → supersede with history awareness); cost quality signals (missing/stale/suspect); linkage cues from Purchasing; supply of inputs to Product Cost consumers.

### Not included

Redefining Product Cost accounting meaning; Commercial Performance ledger; Purchases document lifecycle ownership; marketplace Buyout; Logistics as COGS; Smart Pricing simulation engine; Inventory Snapshot ownership.

### Neighbors

| Neighbor | Relationship |
|----------|--------------|
| Accounting Rules | Own Product Cost meaning |
| Purchasing | Procurement events may inform cost updates; Purchasing owns purchase lifecycle |
| Financial Analysis / Product Analytics / Smart Pricing | Consume Unit Cost / Product Cost inputs |
| Inventory Intelligence | May use costs for Inventory Value when available |

---

## 4. KPIs

### Unit Cost

| Aspect | Definition |
|--------|------------|
| Business meaning | Per-unit product cost maintained for a Supplier Article (or equivalent cost key) |
| Management purpose | Steward merchandise cost truth |
| Supported decisions | Update, correct, or escalate cost gaps |
| Dependencies | Glossary Unit Cost; ≠ Product Cost period total; ≠ Logistics |

### Product Cost (consumed meaning)

| Aspect | Definition |
|--------|------------|
| Business meaning | Period COGS attributed from Unit Cost × sold activity — meaning per Accounting Rules |
| Management purpose | Understand why stewardship matters downstream |
| Supported decisions | Prioritize cost fixes that move P&L |
| Dependencies | Accounting Rules §5.1; Cost Management does not redefine |

### Cost coverage / missing-cost signal

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether assortment items have usable Unit Cost |
| Management purpose | Find stewardship gaps |
| Supported decisions | Cost completion campaigns |
| Dependencies | Assortment identity lattice |

### Cost freshness / quality signal

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether Unit Cost is current enough and trustworthy for decisions |
| Management purpose | Prevent stale-cost margins |
| Supported decisions | Review/replace costs before pricing or period close judgment |
| Dependencies | Stewardship history; Operational honesty (no false precision) |

### Cost change history (stewardship)

| Aspect | Definition |
|--------|------------|
| Business meaning | Recorded evolution of maintained Unit Cost over time as stewardship evidence |
| Management purpose | Explain when cost basis changed |
| Supported decisions | Audit cost corrections; align with historical integrity expectations |
| Dependencies | Historical Integrity spirit for consequential restatements downstream |

---

## 5. Business Capabilities

1. **Unit Cost stewardship** — maintain the cost inputs sellers own.  
2. **Cost gap detection** — find missing/unusable costs.  
3. **Cost quality management** — freshness and trust signals.  
4. **Cost lifecycle** — create, update, supersede with history awareness.  
5. **Cost ownership** — accountability by Company/Account/assortment scope.  
6. **Downstream enablement** — feed Product Cost consumers without owning their ledgers.  
7. **Purchasing-informed updates** — accept cues from procurement without absorbing Purchasing.

---

## 6. Analysis Perspectives

Company; Marketplace; Marketplace Account; Brand; Category; Product; Model; Supplier Article (primary cost key); SKU when cost differs; Supplier (procurement counterpart); Time (current cost vs stewardship history).

---

## 7. User Workflows

Daily: fix missing costs on active sellers.  
Weekly: cost quality review for top contributors.  
Monthly: stewardship history review; align with margin anomalies from Product Analytics.  
Exception: margin collapse suspected cost error → verify Unit Cost → correct → notify downstream consumers conceptually.  
Planning: before Smart Pricing campaigns, ensure cost coverage.  
Investigation: Financial Analysis Product Cost spike → verify Unit Cost changes vs mix.

---

## 8. Filters

Company; Marketplace; Marketplace Account; Brand; Category; Model; Supplier Article; Supplier; missing-cost only; stale/suspect quality; recently changed costs.

---

## 9. Drill-down Principles

Assortment summary of gaps → Supplier Article cost record → stewardship history. Meaning of Unit Cost vs Product Cost remains stable. No conversion into Commercial Performance. No conversion into Purchases ledger.

---

## 10. Dependencies

Foundation + Architecture stack; Accounting Rules §5.1; Financial Analysis; Product Analytics; Smart Pricing; Purchasing (logical neighbor for procurement-informed cost). Purchasing specification may follow in program order; dependency is logical.

---

## 11. Module-specific Business Rules

1. **Stewardship ≠ meaning ownership** — Accounting Rules own Product Cost meaning.  
2. **Unit Cost ≠ Product Cost ≠ Logistics ≠ Purchases module.**  
3. **Buyout ≠ purchase cost event.**  
4. **No silent cost rewrite** of downstream historical understanding without governed correction awareness.  
5. **Smart Pricing consumes costs; does not become cost editor of record.**  
6. **Missing cost ⇒ disclose** to consumers; do not invent Unit Cost.  
7. **Supplier Article** remains usual commercial cost key.  
8. **Purchasing informs; Cost Management decides maintained Unit Cost.**

---

## 12. Success Criteria

Sellers maintain trustworthy Unit Costs; gaps are visible; cost changes are stewarded; Financial Analysis, Product Analytics, and Smart Pricing can rely on cost inputs without Cost Management becoming a second P&L.

---

## 13. Out of Scope

Implementation, UI, database, SQL, APIs, services, infrastructure, frontend/backend.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Cost Management |
| Last Updated | 2026-07-28 |
| Program step | STEP 5 of Product Specification Program |
