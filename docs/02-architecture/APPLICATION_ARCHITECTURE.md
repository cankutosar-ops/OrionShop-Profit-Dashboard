# Application Architecture

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
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Glossary](../01-business/GLOSSARY.md)

---

Related Documents

- [Modules](../03-modules/README.md)
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
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

On consequential change to application capability boundaries or Application Layer ownership

---

Source of Truth

This file

---

Purpose

Define the canonical application architecture for OrionShop: how Application Layer capabilities are organized, how responsibilities are separated, and how they cooperate without inventing parallel business or accounting truth. Module documents refine capability depth; this document owns the application blueprint.

---

Scope

Conceptual application architecture only. Does not specify modules in detail, presentation design, interfaces, frameworks, or source structure.

---

## 1. Purpose

Application architecture exists so product capabilities remain coherent as the platform grows.

The Application Layer is where seller-operator journeys become real: observing Commercial Performance, managing Inventory, producing Reports, maintaining costs, simulating prices, and monitoring trust. Without clear application architecture, each capability invents its own interpretation path, couples tightly to unrelated concerns, and erodes maintainability.

Separating responsibilities is essential because:

- Business Model domains must map to clear capability owners.
- Accounting Rules must be applied once, not reinvented per journey.
- Sync Engine and Historical Data Warehouse must remain intake and fact authorities — not buried inside every capability.
- Long-term change must land in one place without rewriting the whole product.

This document is the contract for that separation.

---

## 2. Architectural Role

Within System Architecture, the Application Layer sits between meaning foundations and durable data:

```text
Business Layer          → what the business is
Accounting Layer        → how money must be read
Application Layer       → how capabilities serve the seller-operator
Data Layer              → what is durably recorded (Historical Data Warehouse)
Infrastructure Layer    → how the system runs
```

### Relationship to Business Layer

Application capabilities realize Business Model domains and use Glossary vocabulary. They do not redefine what Company, Revenue, or Inventory Snapshot mean.

### Relationship to Accounting Layer

Financial Analysis and related readings apply Accounting Rules and financial model boundaries (Commercial Performance, WB Settlement, Smart Pricing). They do not invent local money dialects.

### Relationship to Data Layer

Capabilities consume warehouse facts for authoritative historical and period readings (database-first). They do not become a second ledger.

### Relationship to Sync Engine

Operational Monitoring and administration trigger or observe Sync; they do not replace Sync’s acquisition, verification, or history-preserving duties.

### Relationship to Infrastructure Layer

Application depends on infrastructure for runtime and connectivity. Infrastructure does not own commercial interpretation.

Presentation is an outward face of the Application Layer. It composes and displays; it does not own business or accounting meaning.

---

## 3. Core Application Capabilities

Major capabilities at conceptual level (aligned to Business Model domains; not module specifications):

### Financial Analysis

Provides historical and period commercial reading: Sales Performance signals, Commercial Performance, cost category visibility, Operating Profit, Net Profit, Estimated Tax in historical reporting sense, and WB Settlement framing where settlement visibility is required. Applies Accounting Rules; consumes warehouse facts.

### Inventory Intelligence

Provides Inventory Management support: Current Stock / Live State awareness, Inventory History via Inventory Snapshots, Warehouse Distribution, coverage horizons (Days Left), Stock Health, and replenishment-oriented decision support. Distinguishes Live State from Historical Snapshot.

### Reporting

Produces scoped management communication: Report Scope, Business Report and related report kinds, Marketplace Intelligence composition, Executive Recommendations consumption, Settlement Reconciliation narratives, and exportable deliverables. Presents interpreted truth; does not invent a private accounting store.

### Purchasing

Supports Procurement of goods from Suppliers through Purchases (Module) concepts — distinct from marketplace Buyout and from FBW Supplies.

### Cost Management

Maintains Unit Cost and related cost inputs that feed Product Cost interpretation. Owns seller cost stewardship journeys; does not redefine Product Cost’s accounting meaning.

### Pricing Support

Provides forward-looking Pricing capability (Smart Pricing / simulation) toward Target Margin and related pricing goals. Uses the Smart Pricing financial model boundary; must not rewrite historical Commercial Performance.

### Product Analytics (operational)

Provides operational product/Model decision support readings. May reuse commercial categories; must not silently override Commercial Performance definitions (Accounting Rules).

### Operational Monitoring

Provides trust and readiness visibility: Sync Verification posture, Coverage, Last Sync awareness, Production Health, and Operational Alerts. Protects decision quality; is not itself Commercial Performance.

### Administration

Provides Company and Marketplace Account administration, credential stewardship boundaries, and tenancy scope control under Multi-Tenant Commercial Reality.

### Assortment identity (cross-cutting use)

Capabilities share Brand, Category, Product, Model, Supplier Article, SKU, Size, and Barcode identity — they do not each invent a private identity lattice.

Detailed module docs belong under `/docs/03-modules`; this section only assigns responsibility shapes.

---

## 4. Responsibility Boundaries

Capabilities remain independent by owning a Business Model concern, and cooperate by sharing foundations.

### Independence

1. Each capability has a primary domain question (for example: “What was commercial profit?” vs “What should we replenish?” vs “Is sync trustworthy enough?”).
2. A capability may display adjacent signals for context, but must not absorb another capability’s authoritative duty.
3. Pricing Support may show cost assumptions without becoming Cost Management.
4. Reporting may compose Financial Analysis outputs without re-deriving a second Commercial Performance dialect.
5. Inventory Intelligence may show sales velocity without becoming Financial Analysis.

### Cooperation

1. Shared Glossary terms and Accounting Rules.
2. Shared warehouse facts and Sync Verification qualifications.
3. Shared tenancy scope (Company / Marketplace Account / Reporting Period or live inventory scope).
4. Explicit handoffs: Cost Management → Product Cost inputs; Sync → warehouse Availability; Financial Analysis → Reporting composition; Verification → decision qualification.

### Separation of concerns

- **Interpretation of money** follows Accounting Layer via Financial Analysis / Pricing Support model choice.
- **Persistence and history** remain Data Layer / warehouse concerns.
- **Intake** remains Sync Engine concern.
- **Journey composition** remains Application capability concern.

---

## 5. Information Ownership

| Kind of information | Conceptual owner | Application role |
|---------------------|------------------|------------------|
| Business vocabulary and domain intent | Business Layer | Consume; do not redefine |
| Money meaning and financial model boundaries | Accounting Layer | Apply correctly per question |
| Durable period facts, Inventory Snapshots, verification evidence | Historical Data Warehouse | Read for authoritative claims; write only through approved intake/stewardship paths |
| Sync posture and Coverage | Sync Engine + monitoring capability | Observe and qualify; do not fake completeness |
| Unit Cost stewarded by seller | Cost Management capability | Maintain inputs used by Product Cost interpretation |
| Commercial Performance results for a scope | Financial Analysis capability (applying Accounting Rules to warehouse facts) | Authoritative application interpretation for that model |
| Simulation outputs | Pricing Support | Labeled simulation; never historical Net Profit |
| Composed management documents | Reporting capability | Publish consistently with source model claims |
| Presentation formatting | Application presentation face | Display only |

**Rule:** Layers that only provide data (warehouse facts, sync availability, stewarded costs) must not be treated as optional when a capability claims authoritative historical or period results. Capabilities that interpret must declare which Accounting model they are using.

---

## 6. Interaction Principles

Capabilities interact through coordination contracts, not through tangled ownership.

1. **Scope first** — Interactions assume explicit Company, Marketplace Account, and time scope (Reporting Period, snapshot moment, or Live State).
2. **Declare the model** — Cross-capability views state whether numbers are Commercial Performance, WB Settlement, operational inventory, or Smart Pricing simulation.
3. **Read shared foundations** — Prefer warehouse facts and shared interpretation services over copying another capability’s private totals.
4. **Qualify trust** — Before promoting a reading to decision-grade, respect Operational Monitoring / Sync Verification signals for the affected scope.
5. **Compose, do not clone** — Reporting composes capability outputs; it does not maintain a divergent arithmetic branch.
6. **Adjacent context is not ownership transfer** — Showing inventory beside profit does not merge Inventory Intelligence into Financial Analysis.
7. **Write paths are narrow** — Seller stewardship writes (costs, purchases, admin) and Sync intake writes are explicit; most capabilities are readers of warehouse truth.
8. **Failure isolation** — A monitoring warning or missing inventory valuation must not silently alter Revenue meaning in Financial Analysis.

Coordination is conceptual orchestration of meaning and facts — not a prescription of runtime messaging technology.

---

## 7. Shared Services

Shared services are Application Layer (and adjacent) facilities reused by multiple capabilities so concepts stay centralized.

### Architectural role

1. **Centralize shared concepts** — tenancy scope resolution, Glossary-aligned identity use, period scoping, and common qualification of Availability / Coverage.
2. **Centralize reusable interpretation engines** — Commercial Performance application of Accounting Rules; settlement framing helpers; shared estimation labeling — so capabilities do not fork money meaning.
3. **Centralize cross-cutting concerns** — security/tenancy enforcement points, audit-friendly export parity expectations, and consistent epistemic labeling (observed / estimated / simulated).
4. **Remain capability-neutral** — a shared service must not smuggle one capability’s UI journey into another’s core duty.

Shared services are not a dumping ground for unrelated features. If a concern is domain-specific, it belongs in that capability; if it is meaning or persistence, it belongs in Accounting or Data layers.

This section does not enumerate code modules.

---

## 8. Extension Strategy

New business capabilities should be added by attachment:

1. **Map the Business Model domain** — identify the primary question and whether it is financial, inventory, procurement, pricing, reporting, monitoring, or administration.
2. **Choose the Accounting stance** — historical model, settlement framing, simulation, or non-financial; never silently unify Estimated Tax bases.
3. **Reuse warehouse and Sync contracts** — add durable facts only through Data Layer / Sync philosophy when new evidence is required.
4. **Create a capability boundary** — own one primary responsibility; consume shared services for cross-cutting needs.
5. **Update Knowledge Base** — Application Architecture (if boundaries shift), module docs, Glossary/Accounting Rules if meaning changes, ADRs for consequential trade-offs.
6. **Preserve existing surfaces** — new capability must not rewrite another capability’s authoritative outputs for the same question.
7. **Extend Reporting by composition** — new report sections consume capability outputs rather than inventing parallel ledgers.

Disruption is a smell that ownership was unclear or foundations were bypassed.

---

## 9. Architectural Constraints

1. **No duplicated business interpretation** — one Glossary meaning; one Accounting application per declared model.
2. **No direct dependency between unrelated capabilities** — couple through shared services and foundations, not through private reach-ins that create hidden ownership.
3. **Shared concepts remain centralized** — tenancy, identity lattice, period scope, epistemic labels, and commercial interpretation engines.
4. **Cross-cutting concerns remain reusable** — monitoring qualification, export consistency expectations, security/tenancy checks.
5. **No presentation-owned ledger** — presentation may not redefine Net Profit, Revenue, or inventory history.
6. **No Sync-inside-capability forks** — capabilities must not run private intake paths that bypass Sync Engine philosophy for authoritative facts.
7. **No silent model blending** — Commercial Performance, WB Settlement, and Smart Pricing remain distinct unless a documented bridge narrative is explicit.
8. **No cross-tenant reads or writes** — Multi-Tenant Commercial Reality is mandatory.
9. **No undocumented capability ownership changes** — moving an authoritative duty requires Knowledge Base update.
10. **Module docs refine; they do not contradict** — `/docs/03-modules` details must align with this blueprint.

---

## 10. Non-Goals

The Application Layer intentionally does not own:

- Business vocabulary definition (Business Layer / Glossary).
- Accounting rule definition or financial model legislation (Accounting Rules).
- Historical Data Warehouse preservation semantics and fact authority.
- Sync Engine acquisition, Backfill/Incremental mode philosophy, or Verification meaning.
- Infrastructure runtime and connectivity product choices.
- Statutory accounting, tax filing authority, or Marketplace operations.
- Seller commercial accountability for final decisions.
- Widget-level interaction design or visual systems (documented elsewhere when needed).
- Exhaustive per-module functional specification (belongs in module documents).

---

## 11. Quality Attributes

| Attribute | Meaning for application architecture |
|-----------|--------------------------------------|
| Modularity | Capabilities own clear domain questions and can change with limited blast radius |
| Maintainability | Meaning and intake changes land in foundations; journeys adapt without forking truth |
| Extensibility | New capabilities attach via shared contracts rather than rewriting neighbors |
| Consistency | Same model + scope + facts ⇒ same interpretation across capabilities and Reporting |
| Testability | Boundaries allow verifying interpretation, monitoring qualification, and stewardship paths separately from presentation |
| Predictability | Seller-operators and builders can foresee which capability owns a question |
| Isolatability | Failure or incompleteness in one capability does not corrupt another’s meaning |
| Alignability | Application structure remains mappable to Business Model domains |

An Application Layer rich in journeys but poor in ownership clarity is architecturally unhealthy.

---

## 12. Future Evolution

Application architecture may evolve while preserving principles:

- Deeper Decision Engine or Forecast capabilities as explicit new capability boundaries consuming warehouse truth — not alternate history writers.
- Richer Reporting composition as domains mature, still without private ledgers.
- Stronger Operational Monitoring as trust requirements rise.
- Additional Marketplace types under the same Administration / tenancy and capability pattern.
- Clearer shared-service extraction where duplication of interpretation appears.
- Module Knowledge Base growth that refines responsibilities without collapsing capability walls.

Non-negotiables: Accounting model walls, warehouse-first authoritative history, Sync separation, centralized shared concepts, and no presentation ledger.

---

## How to use this document

1. Use System Architecture to place the Application Layer; use this document to organize capabilities inside it.
2. Use Business Model to justify a capability; use Accounting Rules when the capability touches money; use Sync Engine / Historical Data Warehouse when it touches intake or facts.
3. Use `/docs/03-modules` for capability depth; if a module doc conflicts with this blueprint, this document wins until deliberately revised.
4. Record consequential boundary changes as ADRs.

This file is the canonical application architecture reference for the Knowledge Base.
