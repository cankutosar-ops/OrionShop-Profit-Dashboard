# Reporting Specification

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

Reporting

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
- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)
- [Warehouse Analytics Specification](./WAREHOUSE_ANALYTICS_SPECIFICATION.md)
- [Smart Pricing Specification](./SMART_PRICING_SPECIFICATION.md)

---

Related Documents

- [Cost Management Specification](./COST_MANAGEMENT_SPECIFICATION.md)
- [Purchasing Specification](./PURCHASING_SPECIFICATION.md)
- [Monitoring Specification](./MONITORING_SPECIFICATION.md)
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

On material change to report kinds, export parity expectations, or Reporting Architecture alignment

---

Source of Truth

This file (product behavior for Reporting). [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md) owns the reporting blueprint. Reporting **composes** capability readings; it never owns Orders, Sales, Inventory, or a private ledger ([Domain Model](../02-architecture/DOMAIN_MODEL.md); [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)).

---

Purpose

Define the canonical product specification for Reporting: scoped management communication through reports, exports, scheduled reporting, management/analytical/audit reporting — aligned with Reporting Architecture.

---

Scope

Product behavior for Reporting only. No UI implementation, database, or API design.

---

## 1. Purpose

### Why Reporting exists

Reporting exists so the seller-operator can **publish and share trustworthy scoped truth** — Business Report and related management documents, analytical compositions, settlement reconciliation narratives, and exports — for a declared Report Scope, without inventing a second Accounting dialect.

Application capabilities produce readings. Reporting **composes and publishes** them ([Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)).

### Business value

1. One management narrative for a period/account.
2. Export parity with on-platform claims for the same model and scope.
3. Explicit model declaration (Commercial Performance, settlement, operational, simulation).
4. Auditability and historical reproducibility.
5. Separation of publication from fact ownership.

### Problems solved

1. Private arithmetic per export.  
2. Dashboard vs report disagreement for the same claim.  
3. Silent model blending in long documents.  
4. Reports that modify business state.  
5. Confusion between Orion Business Report and marketplace Realization Report.

---

## 2. Business Questions

- What management document do we need for this Report Scope?
- What does Commercial Performance say in report form for this period?
- How do we present WB Settlement / Settlement Reconciliation without replacing P&L?
- What Product / Brand / Warehouse / Inventory sections belong in this composition?
- Can we export the same claims we see on-platform?
- What should be scheduled for recurring management review?
- What audit trail notes (trust, Coverage, model labels) must accompany the report?
- Is Smart Pricing content allowed only as labeled simulation?

### Not answered here

- Authoritative recalculation of a private Net Profit dialect  
- Sync Verification authority → Monitoring  
- Unit Cost editing → Cost Management  
- Marketplace Realization Report as Orion’s document  

---

## 3. Scope

### Included

Report Scope; Business Report and related report kinds; Marketplace Intelligence composition (Brand/Product/Warehouse/Inventory sections as composed); Settlement Reconciliation narratives; Excel Export and other exportable deliverables; scheduled reporting intent; management, analytical, and audit-oriented reporting; export parity expectations; trust/qualification notes consumption.

### Not included

Owning warehouse facts; redefining Accounting Rules; UI chrome; becoming Financial Analysis; inventing Smart Pricing history; Monitoring’s verification authority.

### Relationship to Reporting Architecture

This product specification states **what Reporting offers sellers**. Reporting Architecture states **how reporting is layered, constrained, and composed**. Product behavior must not contradict the architecture blueprint.

---

## 4. KPIs

Reporting primarily **publishes** KPIs owned elsewhere. Product KPIs for Reporting itself:

### Report completeness (sections present for scope)

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether required sections for the chosen report kind and scope are present |
| Management purpose | Avoid hollow management packs |
| Supported decisions | Regenerate / enrich before sharing |
| Dependencies | Report kind definition; capability readings |

### Export parity status

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether export claims match on-platform claims for the same model and scope within rounding policy |
| Management purpose | Trust offline deliverables |
| Supported decisions | Block/share export |
| Dependencies | Reporting Architecture export parity |

### Model declaration coverage

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether every money section declares Commercial Performance, WB Settlement, operational, or simulation |
| Management purpose | Prevent unlabeled blends |
| Supported decisions | Reject ambiguous packs |
| Dependencies | Accounting Rules model walls |

### Trust annotation presence

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether incompleteness / verification posture is visible on decision-grade reports |
| Management purpose | Honest management communication |
| Supported decisions | Qualify decisions |
| Dependencies | Monitoring / Operational Architecture |

Composed KPI meanings (Revenue, Net Profit, Days Left, etc.) remain owned by Glossary + originating capabilities.

---

## 5. Business Capabilities

1. **Scoped report composition** — bind Report Scope and compose sections.  
2. **Management reporting** — Business Report–class narratives.  
3. **Analytical reporting** — Marketplace Intelligence / product-brand-warehouse-inventory sections.  
4. **Settlement reconciliation reporting** — settlement framing narratives.  
5. **Audit reporting notes** — trust, model, epistemic labels.  
6. **Exports** — offline deliverables with parity expectations.  
7. **Scheduled reporting** — recurring publication intent for management cadence.  
8. **Preview before share** — seller confirms scope/model before treating as published management truth.

---

## 6. Analysis Perspectives

Report Scope perspectives: Company; Marketplace; Marketplace Account; Reporting Period; optional Brand/Category/Product/Warehouse filters as composition lenses. Time honesty: Business Event Date vs Settlement Date vs Snapshot vs Live State labeled per section.

---

## 7. User Workflows

Daily: quick scoped export for incident.  
Weekly: management pack for commercial + inventory highlights.  
Monthly: full Business Report + Settlement Reconciliation.  
Scheduled: recurring monthly pack.  
Exception: incomplete Coverage → publish with trust annotations or delay.  
Audit: reproduce prior period report under settled rules/facts.  
Investigation: drill from report section back to originating capability (handoff).

---

## 8. Filters

Report Scope filters: Company; Marketplace; Marketplace Account; date range/period preset; report kind; section inclusion; model declaration; export format intent (business purpose, not technical protocol).

---

## 9. Drill-down Principles

Report summary → section → originating capability journey. Model and scope preserved. Reports never own facts at detail. Simulation sections remain labeled. Settlement sections remain settlement.

---

## 10. Dependencies

Reporting Architecture (blueprint); all capability product specs whose readings are composed; Operational/Monitoring for trust; Accounting Rules; Domain Model Report/Report Scope entities.

---

## 11. Module-specific Business Rules

1. **Reports never own data** ([Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)).  
2. **No private ledger.**  
3. **Export parity** for same model/scope.  
4. **Model-declared sections only.**  
5. **Business Report ≠ Realization Report.**  
6. **Reports do not modify business state.**  
7. **Historical reproducibility** for closed periods under settled rules.  
8. **Compose, don’t clone** Financial Analysis arithmetic.  
9. **Smart Pricing only as simulation sections.**  
10. **Trust must be visible** on decision-grade packs.

---

## 12. Success Criteria

Management receives consistent, auditable, model-declared reports and exports that match on-platform meaning, with clear handoffs to underlying capabilities and visible trust posture.

---

## 13. Out of Scope

Implementation, UI, database, SQL, APIs, services, infrastructure, frontend/backend.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Reporting |
| Last Updated | 2026-07-28 |
| Program step | STEP 7 of Product Specification Program |
