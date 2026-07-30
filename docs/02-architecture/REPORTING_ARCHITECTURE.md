# Reporting Architecture

---

Status

Production

---

Owner

Product Owner

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

—

---

Category

Architecture

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [Glossary](../01-business/GLOSSARY.md)
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Domain Model](./DOMAIN_MODEL.md)
- [Data Model](./DATA_MODEL.md)

---

Related Documents

- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Data Model](./DATA_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [Modules — Reports](../03-modules/REPORTS.md)
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

On consequential change to reporting layers, read-model contracts, KPI consistency rules, or historical reproducibility requirements

---

Source of Truth

This file (Reporting as architectural capability). KPI *meaning* remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md) and the [Glossary](../01-business/GLOSSARY.md). Fact authority remains owned by the [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md). Journey ownership of Reporting remains with [Application Architecture](./APPLICATION_ARCHITECTURE.md).

---

Purpose

Define the canonical Reporting Architecture for OrionShop: how business information becomes analytical and management views without Reports owning data, inventing money meaning, or breaking reproducibility.

---

Scope

Architectural reporting capability only. Does not specify dashboards pixel-by-pixel, SQL, BI tools, or presentation chrome.

---

## 1. Purpose

Reporting Architecture exists so seller-operators can **trust composed truth**.

Business events become durable facts (Warehouse). Facts are interpreted under Accounting Rules. Application capabilities produce read models. Reporting **composes and publishes** those readings for a declared Report Scope — as on-platform analytical views and as exportable management documents.

Without Reporting Architecture:

- Each deliverable invents a private arithmetic dialect.
- Historical periods become non-reproducible.
- Dashboard, Reports, and Excel Export disagree for the same claim.
- Presentation begins to own a second ledger.

### Relationship to foundations

| Foundation | Reporting relationship |
|------------|------------------------|
| [Business Model](../01-business/BUSINESS_MODEL.md) | Reporting is a core business domain: scoped management communication |
| [Domain Model](./DOMAIN_MODEL.md) | Report and Report Scope are domain entities; Reports never own Orders, Sales, Inventory, or costs |
| [Data Model](./DATA_MODEL.md) | Reporting consumes logical read models and warehouse facts; Reporting Data is composition, not fact authority |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Supply money meaning, model walls, and reporting principles (consistency, repeatability, auditability) |
| [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md) | Supply authoritative facts for historical and period claims |
| [Sync Engine](./SYNC_ENGINE.md) | Qualify Availability; incomplete Coverage must remain visible on decision-grade reports |
| [Application Architecture](./APPLICATION_ARCHITECTURE.md) | Reporting capability composes other capabilities; does not re-derive a second Commercial Performance dialect |
| [System Architecture](./SYSTEM_ARCHITECTURE.md) | Reporting is a first-class architectural outcome, not a side export |

---

## 2. Reporting Principles

1. **Reports never own data** — Facts remain in the Data Layer; stewardship inputs remain with their owners; Reports only compose.

2. **Reports consume read models** — Reporting builds on logical read models (Data Model / Application capabilities), not on private reconstructions of marketplace screens.

3. **Reports are reproducible** — Same Report Scope + unchanged warehouse facts + unchanged settled rules ⇒ same published figures.

4. **Reports are auditable** — A reader can reconstruct the path from facts and Accounting Rules to the published number, including epistemic status (observed / estimated / simulated) and model declaration.

5. **Reports never modify business state** — Composition and export are read-side. Sync, cost stewardship, and administration are separate write paths.

6. **Business calculations remain consistent across every report** — Within one declared model, Glossary terms and Accounting categories mean the same on Dashboard, Reports, Excel Export, and product tables (Accounting Rules: Consistency).

7. **Historical reports must remain reproducible** — Past Reporting Periods and Inventory Snapshot–based inventory sections must not silently drift when Live State changes (Historical Integrity).

8. **Model-declared reporting** — Every report claims Commercial Performance, WB Settlement, operational inventory reading, Smart Pricing simulation, operational Product Analytics, or an explicitly mixed narrative with a bridge — never an unlabeled blend.

9. **Export parity** — Offline deliverables that claim a model must match the on-platform reading for that model and scope within stated rounding policy.

10. **Trust is visible** — Decision-grade historical claims respect Sync Verification / Coverage; incompleteness is disclosed, not hidden by optimistic arithmetic.

11. **Explainability** — Primary KPIs answer: What is it? Why does it exist? What does it include/exclude? Which model? Observed, estimated, or simulated?

12. **Tenant isolation** — Every report is bound to Company / Marketplace Account scope (and filters that do not pierce tenancy).

---

## 3. Reporting Layers

Reporting is layered so meaning, facts, interpretation, and publication stay separable:

```text
Business meaning (Glossary / Domain Model / Business Model)
        ↓
Accounting interpretation rules (Accounting Rules / financial models)
        ↓
Durable facts (Historical Data Warehouse)
        ↓
Qualified availability (Sync Verification / Coverage)
        ↓
Capability read models (Application Architecture + Data Model)
        ↓
Reporting composition (this architecture)
        ↓
Published analytical views & management deliverables
```

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| Meaning | Define entities and terms | Be redefined inside a report section |
| Accounting | Define how money is read per model | Be reimplemented as local report math |
| Facts | Persist scoped evidence | Be bypassed for authoritative historical claims |
| Qualification | State trust/completeness | Be treated as optional for decision-grade history |
| Read models | Provide capability-consistent interpreted slices | Invent a second Commercial Performance dialect |
| Composition | Assemble Report Scope into documents/views | Own a private ledger or mutate facts |
| Publication | Present and export | Change category meaning via formatting |

Presentation (layout, section order, emphasis) may vary. **Category meaning may not.**

---

## 4. Read Models

Reporting consumes the logical read models defined in the [Data Model](./DATA_MODEL.md). This section states the **reporting contract** for each.

### Commercial / Dashboard reading

**Purpose.** Period Commercial Performance and core KPIs for the active scope.  
**Reporting use.** Home analytical view and source slices for management reports that claim commercial P&L.  
**Constraint.** Historical Estimated Tax base only when claiming historical commercial tax; never Smart Pricing tax base unlabeled.

### Financial Analysis reading

**Purpose.** Deeper commercial cost structure, Operating Profit, Net Profit, and WB Settlement framing where required.  
**Reporting use.** Financial sections, Settlement Reconciliation inputs, profitability narratives.  
**Constraint.** Commercial Performance and WB Settlement remain distinct claims.

### Product Analytics reading (operational)

**Purpose.** Product/Model operational decision support.  
**Reporting use.** Product Intelligence / product report sections explicitly framed as operational.  
**Constraint.** Must not silently override Commercial Performance definitions.

### Warehouse Analytics reading

**Purpose.** Sales Performance attributed by Warehouse.  
**Reporting use.** Warehouse Intelligence / warehouse sales sections.  
**Constraint.** Warehouse attribution ≠ Warehouse ownership of Order/Sale entities; distinct from Warehouse Distribution (stock).

### Inventory Intelligence reading

**Purpose.** Live stock, Inventory Snapshot history, distribution, health, coverage horizons.  
**Reporting use.** Inventory summary sections; inventory history narratives.  
**Constraint.** Live State and Historical Snapshot labeled distinctly.

### Smart Pricing reading (simulation)

**Purpose.** Forward-looking simulation outputs.  
**Reporting use.** Only when a report section explicitly claims simulation / pricing support.  
**Constraint.** Labeled simulation; never historical Net Profit.

### Operational Monitoring reading

**Purpose.** Trust posture for the scope.  
**Reporting use.** Qualification banners, appendix trust notes, “data completeness” narratives.  
**Constraint.** Does not rewrite Revenue or Net Profit to mask incompleteness.

### Cost / Purchasing stewardship readings

**Purpose.** Unit Cost and Purchase context when reports explain Product Cost inputs.  
**Reporting use.** Cost transparency sections; never as a second Product Cost accounting definition.

**Composition rule:** Reporting may join read models for adjacent context (for example inventory beside profit) without transferring ownership between capabilities (Application Architecture).

---

## 5. KPI Architecture

### What a KPI is (architectural)

A KPI is a **named, model-scoped, scope-scoped measure** with Glossary meaning and Accounting discipline. It is not a decorative chart label.

### KPI architectural requirements

1. **Canonical name** — Glossary term (or documented alias pointing to it).
2. **Declared model** — Commercial Performance, WB Settlement, operational Product Analytics, Smart Pricing simulation, or non-P&L inventory measure.
3. **Declared scope** — Company, Marketplace Account, Reporting Period or snapshot moment, and filters.
4. **Epistemic status** — Observed, estimated, projected, or simulated (Accounting Rules: Estimation Principles).
5. **Inclusion / exclusion** — What the measure includes and excludes must be explainable.
6. **Consistency class** — KPIs in the same consistency class must match across Dashboard, Reports, and Excel Export for the same model and scope.

### Consistency classes (examples)

| Class | Examples of shared meaning | Notes |
|-------|----------------------------|-------|
| Commercial period P&L | Revenue, cost categories, Operating Profit, Net Profit, historical Estimated Tax | One dialect across surfaces |
| Sales activity | Orders, Sales, Units Sold, Returned Units, Return Rate | Order ≠ Sale |
| Settlement framing | Settlement Amount, Seller Payout, settlement-oriented views | Not a substitute commercial P&L |
| Inventory position | Current Stock, Inventory Snapshot quantities, Days Left, Stock Health | Non-P&L unless explicitly valued and labeled |
| Simulation | Recommended Sale Price, simulated unit economics | Forward-looking only |

### KPI ownership

- **Meaning owner:** Accounting Rules + Glossary.
- **Fact inputs:** Warehouse / stewardship data per Data Model.
- **Publication owner:** Reporting composes; originating capability’s read model remains the interpretation source for that measure’s class.

Detailed KPI catalogs may refine formulas elsewhere; they must not contradict this architecture or Accounting Rules.

---

## 6. Aggregation Principles

1. **Aggregate after meaning** — Sum, rate, and share calculations apply to already-defined business measures; aggregation does not invent a new Glossary term.

2. **Grain honesty** — Aggregations declare grain (Company, Marketplace Account, Brand, Category, Model, SKU, Warehouse, day/period). Rolling grains up must not silently change the measure’s definition.

3. **Identity lattice** — Assortment aggregations use Domain Model identity (Brand, Category, Product, Model, SKU). Capabilities do not invent private identity lattices for reports.

4. **Shares and rates** — Shares (for example Warehouse Sales revenue share) are relative to an explicit cohort. Rates (for example Return Rate, margins) state numerator and denominator in business language.

5. **No double counting** — Composition across sections must not present the same economic effect twice under different labels without an explicit bridge narrative.

6. **Totals are claims** — A total row is a published claim under the same model and scope as its constituents; it is not a separate accounting system.

7. **Filtering before claiming** — Filters (Brand, Category, Warehouse, search) redefine the cohort; published KPIs must state that the claim is for the filtered cohort when not full-account.

8. **Rounding policy** — Display rounding may differ by surface; meaning-changing or non-repeatable “helpful” rounding is forbidden (Accounting Rules: Repeatability). Export parity allows stated rounding policy only.

---

## 7. Time Dimensions

Reporting must keep Accounting time principles distinct:

| Time concept | Reporting use |
|--------------|---------------|
| Business Event Date | When the commercial/operational event occurred — default basis for many period activity claims |
| Settlement Date | When settlement-oriented recognition applies — settlement sections and lag honesty |
| Reporting Period | Explicit from/to (or equivalent) bounding a report claim |
| Historical Snapshot date | “As of” for Inventory Snapshot–based inventory history |
| Live State moment | “Now” for current inventory / operational monitoring — not a substitute for a past snapshot |

### Time rules for reports

1. Every report declares its time basis for each major section when bases differ.
2. Unlabeled mixing of Live State and Historical Snapshot is an architectural defect.
3. Settlement lag relative to Business Event Date is expected; reports must not pretend settlement completeness equals commercial-event completeness.
4. Re-running a historical Reporting Period uses preserved facts for that period — not today’s Live State rewritten as yesterday.

---

## 8. Historical vs Current Reporting

### Historical reporting

**Purpose.** Answer “what was true / what did we earn then?”  
**Data.** Historical transaction evidence, period classifications, Inventory Snapshots, settlement evidence as available for that scope.  
**Requirement.** Reproducible under Historical Integrity; database-first facts; model declared.

### Current / live reporting

**Purpose.** Answer “what is the position now?” (especially inventory and trust).  
**Data.** Live State stock; current Sync Verification / Coverage posture.  
**Requirement.** Clearly labeled as Live State; not used as silent substitute for historical period P&L.

### Bridge narratives

A single deliverable may contain both historical commercial sections and live inventory/trust sections **only** when labels make the time basis obvious. Adjacent context is not ownership transfer and not time fusion.

### Simulation sections

Forward-looking Smart Pricing (or future Forecast) sections are neither historical Commercial Performance nor Live State inventory. They must be labeled simulation / forecast.

---

## 9. Drill-down Principles

1. **Drill-down preserves model and scope** — Moving from Company total → Brand → Model → SKU (or Warehouse → products) does not change the Accounting model or tenant boundary.

2. **Drill-down preserves measure meaning** — A child grain of Revenue is still Revenue under the same definition; it is not a new informal metric.

3. **Parent/child reconciliation** — Where a parent total is the sum of children, differences must be explainable (filters, unassigned identity, rounding policy, explicit “other” buckets) — not silent loss.

4. **Cross-capability drill-down** — Navigating from a Report into Inventory Intelligence or Product Analytics is a journey handoff; destination capability rules apply; Reporting does not carry a private fact store into the destination.

5. **No drill-down into a second ledger** — Detail views must resolve to the same warehouse facts and rules as the summary claim.

6. **Unknown / unattributed grain** — When warehouse or assortment attribution is missing, reports use an explicit unknown/unassigned cohort rather than dropping facts without disclosure (business honesty).

---

## 10. Auditability

Reporting Architecture requires that published claims be reconstructible:

1. **Fact path** — From published number back to warehouse (or stewarded) inputs for the scope.
2. **Rule path** — From published number back to Accounting Rules / Glossary for the declared model.
3. **Scope path** — Company, Marketplace Account, time basis, filters, and report kind.
4. **Trust path** — Whether Sync Verification / Coverage qualified the claim; what incompleteness was disclosed.
5. **Export path** — Excel Export (or equivalent) that claims the same model/scope matches on-platform reading within stated rounding policy.
6. **Change path** — Material changes to reporting behavior are documented (Accounting change management / ADRs); informal chat is not authority.

Audit surfaces (for example profitability validation readings) are still Reporting or Financial Analysis compositions — they do not become a separate fact authority.

---

## 11. Reporting Constraints

Violations are architectural defects:

1. **No private reporting ledger** — Reports must not persist authoritative history that contradicts the warehouse for the same claim.
2. **No silent model blending** — Especially historical Estimated Tax vs Smart Pricing Estimated Tax; Commercial Performance vs WB Settlement.
3. **No report-owned mutation of Orders, Sales, Inventory, costs, or settlement facts.**
4. **No presentation-owned money meaning** — Formatting cannot redefine Net Profit, Revenue, or cost categories.
5. **No authoritative historical claim that bypasses warehouse facts.**
6. **No cross-tenant composition.**
7. **No unlabeled Live State / Snapshot / Settlement Date mixing.**
8. **No hiding incomplete Coverage** on decision-grade historical claims.
9. **No divergent Excel arithmetic** for the same claimed model and scope.
10. **No inventing Domain Model entities** inside report sections (for example treating Buyout as Purchase Module).
11. **Module docs and widgets refine presentation; they must not contradict this blueprint or Accounting Rules.**

---

## 12. Scope Boundaries

### Intentionally included

- Reporting as an architectural capability and composition layer
- Principles of reproducibility, consistency, auditability, and non-ownership of data
- Reporting layers and contracts with read models
- KPI architecture (consistency and declaration — not a full formula catalog)
- Aggregation, time, historical vs current, and drill-down principles
- Constraints that keep Reports from becoming a second ledger

### Intentionally excluded

- SQL, query plans, warehouses-as-tables
- Dashboard wireframes, widget styling, navigation chrome
- BI vendor playbooks and implementation runbooks
- Full KPI formula dictionaries (link Accounting Rules / KPI catalogs)
- Sync scheduling and intake algorithms (link Sync Engine)
- Physical storage design (link Data Model / Database docs)
- Seller statutory accounting or tax filing outputs

### Report kinds (conceptual, not UI specs)

Reporting Architecture covers composition of Glossary report kinds such as:

- Business Report
- Marketplace Intelligence (including Brand / Product / Warehouse / Executive-oriented sections)
- Settlement Reconciliation
- Product Report / product profitability report compositions
- Appendix / attribution context
- Excel Export and equivalent offline deliverables

Exact section inventories belong in module/report specifications; they must obey this architecture.

---

## How to use this document

1. When adding a report section, declare Report Scope, model, time basis, and which read models feed it.
2. When a number disagrees across Dashboard / Reports / Export, treat it as a consistency defect — do not “fix” it with presentation-only math.
3. When history must be defended, use warehouse facts and settled rules; do not rebuild from Live State alone.
4. When money meaning is unclear, update Accounting Rules / Glossary first — not a one-off report branch.
5. Record consequential reporting-architecture changes as ADRs.

This file is the Production Reporting Architecture for OrionShop.
