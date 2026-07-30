# Purchasing Specification

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

Purchasing

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
- [Cost Management Specification](./COST_MANAGEMENT_SPECIFICATION.md)
- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)

---

Related Documents

- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)
- [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md)
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

On material change to procurement lifecycle, Supplier concepts, or boundaries with Cost Management / Inventory

---

Source of Truth

This file (product behavior for Purchasing). [Glossary](../01-business/GLOSSARY.md) owns Purchases (Module), Supplier, Buyout distinctions. [Cost Management Specification](./COST_MANAGEMENT_SPECIFICATION.md) owns Unit Cost stewardship. [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md) owns replenishment decision cues (Produce / Purchase, Stop Purchasing).

---

Purpose

Define the canonical product specification for Purchasing: manage procurement of goods from Suppliers through purchase records, receiving awareness, purchase lifecycle, procurement planning, and supplier performance — distinct from marketplace Buyout and from FBW Supplies.

---

Scope

Product behavior for Purchasing only. No implementation, UI layout, database, or API design.

---

## 1. Purpose

### Why Purchasing exists

Purchasing exists so the seller-operator can **run procurement** — who we buy from, what we purchased, where purchases are in their lifecycle, how receiving progresses, and how Suppliers perform — so replenishment cues from Inventory Intelligence become executable procurement work.

It is the Procurement domain capability ([Business Model](../01-business/BUSINESS_MODEL.md); [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)). It is **not** marketplace Buyout, not Orders/Purchases chart language, not Cost Management’s Unit Cost editor of record (though it informs cost), and not FBW inbound supply receipts as marketplace fulfillment events.

### Business value

1. Connects replenishment intent to Supplier purchases.
2. Tracks purchase lifecycle from intent through receiving.
3. Makes Supplier performance visible for sourcing decisions.
4. Informs Unit Cost stewardship without absorbing it.
5. Prevents Buyout/Purchases terminology collisions.

### Problems solved

1. Replenishment cues with no procurement follow-through.
2. Buyout confused with seller purchases.
3. Missing Supplier accountability.
4. Cost updates disconnected from purchase reality.
5. Receiving ambiguity versus Live Stock alone.

---

## 2. Business Questions

- Which Suppliers do we buy from for which assortment?
- What purchases are open, received, or closed in the lifecycle?
- What did we procure in a period (quantity/value as purchase records state)?
- How is receiving progressing versus expected stock uplift?
- Which Suppliers perform well on timeliness, completeness, or cost stability cues?
- What should we procure next given Inventory Intelligence Produce / Purchase lists?
- Which purchases should inform Cost Management Unit Cost updates?

### Not answered here

- Days Left / Stock Health ownership → Inventory Intelligence  
- Unit Cost system of record → Cost Management  
- Marketplace Buyout analytics → Sales Performance / Product Analytics  
- Warehouse sales performance → Warehouse Analytics  
- Period Net Profit → Financial Analysis  

---

## 3. Scope

### Included

Suppliers; Purchases (Module) records; purchase lifecycle; receiving awareness; procurement planning from inventory cues; supplier performance reading; cues to Cost Management for cost updates; distinction from Buyout and from FBW Supplies.

### Not included

Unit Cost meaning/stewardship ownership; Inventory Snapshot history; Commercial Performance; Smart Pricing; marketplace order/buyout ledgers; FBW Supplies as Purchasing documents.

### Neighbors

| Neighbor | Relationship |
|----------|--------------|
| Inventory Intelligence | Provides Produce / Purchase and Stop Purchasing cues |
| Cost Management | Receives cost-update cues; owns maintained Unit Cost |
| Warehouse Analytics | May inform where stock should land; does not own purchases |
| Product Analytics | May explain which items deserve procurement economically |
| Financial Analysis | Adjacent only for capital/P&L context |

---

## 4. KPIs

### Purchase volume / value (purchase-record basis)

| Aspect | Definition |
|--------|------------|
| Business meaning | Quantity/value of seller purchase records in scope — not marketplace Buyout |
| Management purpose | See procurement activity |
| Supported decisions | Pace buying; reconcile to plan |
| Dependencies | Glossary Purchases (Module); ≠ Buyout |

### Open vs received vs closed purchases

| Aspect | Definition |
|--------|------------|
| Business meaning | Lifecycle state of purchase records |
| Management purpose | Operational follow-up |
| Supported decisions | Chase receiving; close completed buys |
| Dependencies | Purchase lifecycle capability |

### Supplier count / active Suppliers

| Aspect | Definition |
|--------|------------|
| Business meaning | Vendors in use for procurement |
| Management purpose | Sourcing footprint |
| Supported decisions | Consolidate or diversify Suppliers |
| Dependencies | Glossary Supplier ≠ Supplier Article |

### Supplier performance signals

| Aspect | Definition |
|--------|------------|
| Business meaning | Timeliness, completeness, reliability, and cost-stability cues as available |
| Management purpose | Prefer better Suppliers |
| Supported decisions | Source shift; escalate poor performers |
| Dependencies | Purchase/receiving evidence; labeled basis |

### Procurement plan coverage

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether Inventory Produce / Purchase cues have corresponding purchase intent/records |
| Management purpose | Close the loop from stock need to buy |
| Supported decisions | Create purchases for uncovered critical cues |
| Dependencies | Inventory Intelligence cues |

### Cost-informing purchase cues

| Aspect | Definition |
|--------|------------|
| Business meaning | Purchase evidence relevant to Unit Cost review |
| Management purpose | Keep costs aligned with procurement reality |
| Supported decisions | Hand off to Cost Management |
| Dependencies | Cost Management ownership of Unit Cost |

---

## 5. Business Capabilities

1. **Supplier management** — maintain vendor identity for procurement.  
2. **Purchase recording** — capture seller purchases distinct from Buyout.  
3. **Purchase lifecycle** — track progress through receiving/completion states.  
4. **Receiving awareness** — relate purchases to inbound progress without owning Live Stock.  
5. **Procurement planning** — convert replenishment cues into buy intent.  
6. **Supplier performance** — compare vendors on labeled operational bases.  
7. **Cost stewardship cues** — inform Cost Management without taking Unit Cost ownership.

---

## 6. Analysis Perspectives

Company; Marketplace Account (tenant scope); Supplier; Brand/Category/Product/Model/Supplier Article; Time (purchase period); Lifecycle state; Warehouse destination (when purchasing for a location — context only).

---

## 7. User Workflows

Daily: chase open purchases / receiving.  
Weekly: convert Inventory Produce / Purchase list into purchases; apply Stop Purchasing.  
Monthly: Supplier performance review; cost-informing purchase review with Cost Management.  
Exception: receiving delay while Days Left critical → escalate Supplier / alternate source.  
Planning: build procurement plan from coverage risk + commercial priority.  
Investigation: stock not rising after purchase → receiving vs sync trust vs warehouse destination.

---

## 8. Filters

Company; Marketplace Account; Supplier; assortment identity; lifecycle state; date range; linked to Produce / Purchase cues; missing cost handoff candidates.

---

## 9. Drill-down Principles

Supplier portfolio → Supplier → purchase records → line assortment. Buyout language never replaces Purchases (Module). Receiving drill-down does not rewrite Inventory Live State ownership. Cost cues hand off to Cost Management explicitly.

---

## 10. Dependencies

Foundation + Architecture; Cost Management; Inventory Intelligence; Domain Model procurement vs Buyout vs FBW Supplies distinctions.

---

## 11. Module-specific Business Rules

1. **Purchases (Module) ≠ Buyout ≠ Orders chart “purchases.”**  
2. **Purchases ≠ Produce / Purchase recommendation** — recommendation is Inventory Intelligence; execution support is Purchasing.  
3. **Supplier ≠ Supplier Article.**  
4. **FBW Supplies ≠ Purchases documents.**  
5. **Unit Cost stewardship remains Cost Management.**  
6. **Stop Purchasing cues must be respected in planning.**  
7. **No Commercial Performance dialect** invented inside purchase lists.  
8. **Receiving awareness ≠ Inventory Snapshot history module.**

---

## 12. Success Criteria

Sellers can procure from Suppliers, track purchase lifecycle/receiving, plan from inventory cues, judge Supplier performance, and inform costs — without Buyout confusion or stealing Cost/Inventory ownership.

---

## 13. Out of Scope

Implementation, UI, database, SQL, APIs, services, infrastructure, frontend/backend.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Purchasing |
| Last Updated | 2026-07-28 |
| Program step | STEP 6 of Product Specification Program |
