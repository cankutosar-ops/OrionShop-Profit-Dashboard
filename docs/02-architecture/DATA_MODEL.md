# Data Model

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
- [Glossary](../01-business/GLOSSARY.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Domain Model](./DOMAIN_MODEL.md)

---

Related Documents

- [Domain Model](./DOMAIN_MODEL.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Database](./DATABASE.md)
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

On consequential change to logical data categories, persistence vs derivation boundaries, historical strategy, or read-model contracts

---

Source of Truth

This file (logical data architecture). Business entity meaning remains owned by the [Domain Model](./DOMAIN_MODEL.md) and [Glossary](../01-business/GLOSSARY.md). Durable fact-platform principles remain owned by the [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md). Physical storage mechanisms belong in Database / migration documents — not here.

---

Purpose

Define the canonical logical Data Model for OrionShop: how Domain Model entities exist as data — ownership, persistence, history, derivation, and read contracts — bridging business meaning and the physical database without becoming a schema.

---

Scope

Logical data architecture only. Does not specify schemas, SQL, indexes, migrations, interfaces, or storage technologies.

---

## 1. Purpose

The Data Model exists so the platform can answer: **how does business reality live as data?**

The [Domain Model](./DOMAIN_MODEL.md) names what exists in the seller’s commercial world (Order, Sale, Inventory Snapshot, Unit Cost, …).  
The Data Model states how those entities are represented as **logical data**: what is persisted, what is derived, what is historical, what is current, who owns each category, and which Application readings consume them.

Without a Data Model:

- Screens invent private derived ledgers.
- Live State overwrites historical evidence.
- Sync intake is confused with Accounting interpretation.
- Reporting cannot explain whether a number is a fact, a classification, or a calculation.

### How this document connects peer foundations

| Foundation | Connection |
|------------|------------|
| [Domain Model](./DOMAIN_MODEL.md) | Supplies entities and relationships; Data Model never renames or redefines them |
| [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md) | Supplies fact-authority and preservation principles; Data Model classifies what kinds of data the warehouse holds |
| [Sync Engine](./SYNC_ENGINE.md) | Supplies controlled intake into persisted facts; Data Model states what Sync may write vs what it must not invent |
| [Application Architecture](./APPLICATION_ARCHITECTURE.md) | Supplies capabilities and read journeys; Data Model defines the logical read models those capabilities consume |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Govern interpretation of persisted facts into money meaning; Data Model distinguishes raw/classified facts from interpreted results |
| Reporting (capability) | Consumes interpreted read models; does not own a private data store for authoritative claims |
| Physical Database (when documented) | Must implement this logical model; schema follows Data Model — never the reverse |

**Rule:** Technology must not redefine business meaning. If physical storage or interfaces conflict with Domain Model + Data Model, implementation changes.

---

## 2. Data Principles

1. **Single Source of Truth (Data)** — For authoritative historical and period claims, warehouse facts outrank presentation-only reconstruction.

2. **Immutable historical data (in spirit)** — Inventory Snapshots, closed-period evidence, and Verification Snapshots remain stable; corrections are deliberate and auditable (Historical Integrity).

3. **Current State vs Historical State** — Live State answers “now”; Historical Snapshots and period facts answer “then.” Mixing them unlabeled is a defect.

4. **Raw Data vs Derived Data** — Acquired marketplace events and seller-stewarded inputs are raw (or stewarded) facts. Commercial Performance totals, margins, simulations, and composed Reports are derived under declared rules.

5. **Persisted vs Calculated Data** — Decision-grade history and stewarded inputs are persisted. Calculations may be recomputed from facts + settled rules; authoritative claims must still resolve to warehouse facts, not to a screen-only memory.

6. **Temporal Consistency** — Business Event Date, Settlement Date, Reporting Period, Snapshot date, and Live State remain distinct unless a documented bridge applies (Accounting Rules: Time Principles).

7. **Tenant Isolation** — Every durable fact is scoped to Company and Marketplace Account (Multi-Tenant Commercial Reality).

8. **Logical referential integrity** — Relationships from the Domain Model (Account offers Products; Sales may generate Returns; Unit Cost feeds Product Cost; Snapshots describe Inventory) must hold as logical data integrity even when physical mechanisms differ.

9. **Interpretation stays outside raw storage** — Persistence stores evidence; Accounting interprets money; Application composes journeys.

10. **Verification before overconfidence** — Persistence ≠ completeness. Sync Verification and Coverage qualify trust for decision-grade use.

11. **Database-first authoritative reporting** — Authoritative Commercial Performance and related period readings consume warehouse facts.

12. **No second ledger** — Read models and Reports compose and calculate; they do not become an alternate fact authority for the same claim.

---

## 3. Data Categories

Platform data is classified by **role in truth**, not by storage technology.

### Master Data

**Purpose.** Relatively stable identity and tenancy that other data hangs on.

**Includes (logical).** Company; Marketplace; Marketplace Account; Brand; Category; Product; Model; Supplier Article; SKU; Size; Barcode; Warehouse; Supplier.

**Notes.** Master Data may change, but changes are identity/stewardship events — not high-frequency trading events. Assortment identity must remain consistent across capabilities (Domain Model / Application Architecture).

### Transaction Data

**Purpose.** Record business events as they occur in trading and fulfillment.

**Includes (logical).** Orders; Sales; Returns; Buyout-framed completion events where retained; marketplace logistics and fee events as acquired evidence; inbound fulfillment receipts (FBW Supplies) where retained as operational events.

**Notes.** Transaction Data is the primary raw material for Sales Performance and many Financial Performance inputs. An Order fact is not a Sale fact.

### Historical Data

**Purpose.** Preserve the past so periods remain reproducible.

**Includes (logical).** Closed-period transaction evidence retained for Reporting Periods; preserved economic classifications for past scopes; any durable record required to re-read “what happened then.”

**Notes.** Historical Data must not casually drift when Live State updates (Historical Integrity).

### Snapshot Data

**Purpose.** Capture point-in-time positions that Live State cannot reconstruct safely later.

**Includes (logical).** Inventory Snapshots (and transit quantities when available on a snapshot); Verification Snapshots for sync-trust audit.

**Notes.** Inventory Snapshot ≠ Verification Snapshot (Domain Model / Glossary). Snapshots are first-class data, not caches.

### Reference Data

**Purpose.** Shared classifications and labels that stabilize interpretation language.

**Includes (logical).** Cost category names as Accounting concepts (Marketplace Fee, Logistics, Storage, Acceptance, Penalties, Advertising, Adjustments, Acquiring, Compensation); fulfillment orientation concepts (for example FBW); epistemic labels (observed / estimated / simulated).

**Notes.** Reference Data does not replace Accounting Rules; it carries the vocabulary those rules use.

### Derived Data

**Purpose.** Produce interpreted or composed results from facts + rules + scope.

**Includes (logical).** Commercial Performance results; Net Profit / margins under a declared model; Product Cost period attribution from Unit Cost × sold activity; Estimated Tax under a declared base; Smart Pricing simulation outputs; Stock Health / Days Left style operational indicators; Warehouse Sales aggregations; composed Report bodies.

**Notes.** Derived Data may be materialized for performance, but **meaning authority** remains Accounting Rules + Domain Model facts — not the materialization itself.

### Reporting Data

**Purpose.** Bound and deliver management communication without owning a private ledger.

**Includes (logical).** Report Scope selections; composed Report artifacts (Business Report, Marketplace Intelligence sections, Settlement Reconciliation narratives, exportable deliverables); audit/validation presentations that restate interpreted facts.

**Notes.** Reporting Data is a **consumption and composition** category. It must resolve to warehouse facts + declared models.

### Configuration Data

**Purpose.** Hold seller and platform operating configuration that shapes scope and stewardship — not marketplace trading events.

**Includes (logical).** Company / Marketplace Account administration settings; credential stewardship boundaries (as configuration presence, not secret values in this document); seller Unit Cost stewardship records; Purchases (Module) records; reporting preferences that do not change money meaning.

**Notes.** Configuration and stewardship writes are narrow Application write paths (Application Architecture). They must not bypass Sync for marketplace transaction facts.

### Operational Trust Data

**Purpose.** Qualify whether other data is safe to treat as decision-grade.

**Includes (logical).** Sync Verification posture; Coverage; Last Sync awareness; Production Health / Operational Alerts; Import Audit purpose evidence; Verification Snapshots.

**Notes.** Trust Data does not redefine Revenue or Net Profit; it qualifies Availability.

---

## 4. Data Lifecycles

How major Domain Model concerns evolve as data (business language):

### Product / assortment lifecycle (Master Data)

```text
Identity established (Product / Model / SKU)
      ↓
Attributed (Brand / Category / Warehouse relevance)
      ↓
Stewarded (Unit Cost, Purchases linkage)
      ↓
Observed in trading & stock facts
      ↓
Analysed in read models
      ↓
(Optionally) retired from active assortment
```

Identity stability matters more than display labels. Supplier Article remains the usual commercial key for Model and Unit Cost.

### Order lifecycle (Transaction Data)

```text
Order Created (acquired)
      ↓
Order retained as demand evidence
      ↓
Order Cancelled (if applicable) — excluded from completed-demand readings where stated
      ↓
(Otherwise) may progress toward Sale / Buyout completion
```

Orders remain Orders even when later Sales exist; analytics must not silently rename them.

### Sale lifecycle (Transaction Data → Historical Data)

```text
Sale Completed (acquired)
      ↓
Contributes to period sales / commercial inputs
      ↓
May receive Return Processed
      ↓
Remains historical evidence for the Reporting Period
```

### Return lifecycle

```text
Return Processed (acquired)
      ↓
Links to prior sold reality
      ↓
Affects returned units/sales and related logistics classifications
      ↓
Preserved as historical evidence
```

### Inventory history lifecycle (Live State + Snapshot Data)

```text
Live State stock changes (Current Stock / warehouse position)
      ↓
Inventory Snapshot Captured for a business date
      ↓
Snapshot preserved (immutable in spirit)
      ↓
Inventory History read models consume snapshots — not today’s Live State rewritten as yesterday
```

### Cost history lifecycle (Configuration / stewardship → Derived)

```text
Unit Cost entered or updated (seller stewardship)
      ↓
Persisted as stewarded input for the cost key
      ↓
Applied to sold activity → Product Cost (derived for a period)
      ↓
Prior period Product Cost remains reproducible if facts and settled rules are unchanged
```

Deliberate Unit Cost corrections are allowed; unnoticed drift of past period meaning is not.

### Settlement history lifecycle

```text
Marketplace settlement-oriented figures become available
      ↓
Acquired / retained as settlement evidence for the period
      ↓
Interpreted under WB Settlement framing (Accounting Rules)
      ↓
Consumed by Financial Analysis and Settlement Reconciliation reporting
```

Settlement timing may lag Business Event Date; Data Model must preserve that honesty.

### Synchronization & verification lifecycle (intake + trust)

```text
Synchronization intended (Backfill or Incremental mode)
      ↓
Acquisition → Validation → Persistence
      ↓
Sync Verification evaluated
      ↓
Availability declared (with incompleteness visible when present)
      ↓
Read models may consume facts for decision support
```

---

## 5. Read Models

Logical read models are **Application-facing contracts over data**. They do not own facts. Each must declare scope (Company, Marketplace Account, time) and, when money is involved, the Accounting model.

### Dashboard (Commercial home)

| Aspect | Definition |
|--------|------------|
| Purpose | Period KPIs and Commercial Performance exploration for the seller-operator |
| Primary facts | Transaction and classified marketplace evidence; stewarded Unit Cost inputs |
| Derivation | Commercial Performance and related KPIs under historical Accounting model |
| Must not | Become a private ledger; silently use Smart Pricing tax base for historical Net Profit |

### Financial Reporting / Financial Analysis reading

| Aspect | Definition |
|--------|------------|
| Purpose | Historical and period commercial money reading, including cost categories and settlement framing where required |
| Primary facts | Warehouse period facts; settlement evidence when claiming WB Settlement |
| Derivation | Accounting Rules applied to facts for the declared model (Commercial Performance and/or WB Settlement) |
| Must not | Blend Commercial Performance and settlement into one unlabeled P&L |

### Warehouse Analytics (Warehouse Sales)

| Aspect | Definition |
|--------|------------|
| Purpose | Sales Performance attributed by Warehouse |
| Primary facts | Orders and/or Sales (and related amounts) with warehouse attribution |
| Derivation | Aggregations by Warehouse (orders, units, revenue/shares as the business question defines) |
| Must not | Treat warehouse attribution as ownership of Order/Sale entities; confuse Warehouse Sales with Warehouse Distribution (stock) |

### Product Analytics (operational)

| Aspect | Definition |
|--------|------------|
| Purpose | Operational product/Model decision support reading |
| Primary facts | Sales, costs, logistics, advertising visibility at product/Model grain |
| Derivation | Operational cuts under Accounting §3.4 discipline |
| Must not | Silently override Commercial Performance definitions of Revenue, Operating Profit, Net Profit, or historical Estimated Tax |

### Smart Pricing (simulation read model)

| Aspect | Definition |
|--------|------------|
| Purpose | Forward-looking price / margin simulation toward Target Margin |
| Primary facts | Stewarded costs and relevant marketplace fee/logistics assumptions; warehouse-backed inputs as needed |
| Derivation | Smart Pricing model outputs (labeled simulation); Estimated Tax uses Smart Pricing base |
| Must not | Rewrite historical Commercial Performance or period tax estimates |

### Inventory Intelligence

| Aspect | Definition |
|--------|------------|
| Purpose | Stock position, history, health, distribution, and replenishment-oriented support |
| Primary facts | Live State stock; Inventory Snapshots; optional sales-velocity context from transaction facts |
| Derivation | Stock Health, Days Left, Warehouse Distribution, history pivots |
| Must not | Use Live State as if it were an Inventory Snapshot for a past date |

### Reporting (composed management documents)

| Aspect | Definition |
|--------|------------|
| Purpose | Scoped management communication and exports |
| Primary facts | Same warehouse facts as underlying capabilities |
| Derivation | Composition of capability outputs under Report Scope; export parity with on-platform claims |
| Must not | Invent a divergent arithmetic branch for the same model and scope |

### Operational Monitoring

| Aspect | Definition |
|--------|------------|
| Purpose | Trust and readiness visibility |
| Primary facts | Sync Verification, Coverage, Verification Snapshots, sync outcome awareness |
| Derivation | Health posture and alerts |
| Must not | “Fix” incomplete sync by changing Accounting meaning |

### Cost Management / Purchasing stewardship views

| Aspect | Definition |
|--------|------------|
| Purpose | Maintain Purchases and Unit Cost inputs |
| Primary facts | Configuration / stewardship data; assortment identity |
| Derivation | Displays of stewarded costs and purchase records |
| Must not | Redefine Product Cost’s Accounting meaning |

---

## 6. Data Ownership

Logical ownership only. Consumers are Application capabilities / domains — not code modules.

### Master Data (tenancy & assortment)

| Aspect | Definition |
|--------|------------|
| Business Owner | Business Layer (Assortment and identity; Multi-Tenant Commercial Reality) |
| Source of Truth | Seller / marketplace identity reality as recorded for the Marketplace Account |
| Historical Strategy | Identity is stable; historical transaction/snapshot facts keep the identity references they had |
| Update Strategy | Administrative and catalog stewardship updates; not Sync-invented money meaning |
| Consumers | All capabilities that need scope or assortment grain |

### Transaction Data (Orders, Sales, Returns, related marketplace events)

| Aspect | Definition |
|--------|------------|
| Business Owner | Sales Performance / operational event reality (Business Model) |
| Source of Truth | Marketplace operational events acquired into the durable operating record |
| Historical Strategy | Retained as period evidence; not replaced by Live State |
| Update Strategy | Sync Engine intake (Backfill / Incremental); deliberate corrections only |
| Consumers | Financial Analysis; Product Analytics; Warehouse Analytics; Inventory Intelligence (velocity context); Reporting |

### Snapshot Data — Inventory Snapshots

| Aspect | Definition |
|--------|------------|
| Business Owner | Inventory Management / Historical Integrity |
| Source of Truth | Captured inventory position evidence for a date |
| Historical Strategy | Immutable in spirit; readable in Inventory History |
| Update Strategy | Snapshot capture / preservation processes; not silent overwrite by current stock |
| Consumers | Inventory Intelligence; Inventory History; Reporting inventory sections |

### Snapshot Data — Verification Snapshots

| Aspect | Definition |
|--------|------------|
| Business Owner | Operational Monitoring / Sync Verification philosophy |
| Source of Truth | Immutable evaluation of sync posture at a moment |
| Historical Strategy | Preserved for audit |
| Update Strategy | Created by verification evaluation; not edited as Live State |
| Consumers | Operational Monitoring; trust qualification of other read models |

### Stewarded cost & purchase data (Unit Cost, Purchases)

| Aspect | Definition |
|--------|------------|
| Business Owner | Procurement / Cost Management / Purchasing capabilities (stewardship); Accounting owns Product Cost meaning |
| Source of Truth | Seller procurement and unit-cost practice |
| Historical Strategy | Cost inputs retained so period Product Cost can be explained; rule/fact changes follow Accounting change management |
| Update Strategy | Narrow seller write paths (stewardship); not marketplace Sync for Unit Cost truth |
| Consumers | Financial Analysis; Product Analytics; Smart Pricing; Reporting |

### Marketplace economic classifications (fees, logistics, storage, …)

| Aspect | Definition |
|--------|------------|
| Business Owner | Accounting Layer (category meaning) |
| Source of Truth | Marketplace economic effects as acquired and classified for commercial/settlement reading |
| Historical Strategy | Period classifications preserved for reproducibility |
| Update Strategy | Sync intake of marketplace finance/settlement-related evidence; classification discipline per Accounting Rules |
| Consumers | Financial Analysis; Product Analytics; Settlement framing; Reporting |

### Settlement-oriented data

| Aspect | Definition |
|--------|------------|
| Business Owner | Accounting Layer (WB Settlement framing) |
| Source of Truth | Marketplace settlement reality for the period |
| Historical Strategy | Retained for reconciliation and settlement history |
| Update Strategy | Acquired when settlement figures are available; timing lag is expected |
| Consumers | Financial Analysis; Settlement Reconciliation reporting |

### Derived commercial results

| Aspect | Definition |
|--------|------------|
| Business Owner | Accounting Layer (rules) + Financial Analysis / Pricing Support / Product Analytics (application of rules) |
| Source of Truth | Facts + settled Accounting Rules + declared model — not the derived cache |
| Historical Strategy | Reproducible when facts and settled rules are unchanged |
| Update Strategy | Recalculate on fact/rule/scope change; never invent facts to match a desired total |
| Consumers | Dashboard; Reporting; capability UIs |

### Reporting composition data

| Aspect | Definition |
|--------|------------|
| Business Owner | Reporting capability |
| Source of Truth | Underlying read models and warehouse facts |
| Historical Strategy | A report about a past scope must use historical facts, not today’s Live State unlabeled |
| Update Strategy | Re-compose on demand for scope; exports must match claimed on-platform reading |
| Consumers | Seller-operators; management audiences |

### Operational trust data

| Aspect | Definition |
|--------|------------|
| Business Owner | Sync Engine (production of verification evidence) + Operational Monitoring (visibility) |
| Source of Truth | Intake and verification outcomes |
| Historical Strategy | Verification Snapshots preserved; postures remain honest (healthy / warning / incomplete) |
| Update Strategy | Updated by Sync and verification evaluations |
| Consumers | All decision-grade read models (qualification); Production Health |

### Ownership rule

If two stores or two read models disagree on an **authoritative historical claim**, architecture treats that as a defect to reconcile — not as “pick whichever screen is open” (Historical Data Warehouse ownership rule).

---

## 7. Scope Boundaries

### Intentionally included

- Logical data categories and principles
- Persistence vs derivation and current vs historical distinctions
- Data lifecycles for Domain Model concerns
- Logical read models aligned to Application Architecture capabilities
- Logical ownership, sources of truth, update/history strategies, and consumers

### Intentionally excluded

- SQL and query plans
- Table definitions, columns, indexes, constraints as physical DDL
- Migrations and migration runbooks
- APIs, endpoints, payloads
- Supabase or any vendor/storage product choice
- Repositories, services, ORMs
- UI components, screens, visual layout
- Algorithms and scheduling mechanisms
- Physical ER diagrams presented as storage design

### Boundary statement

| Document | Owns |
|----------|------|
| [Domain Model](./DOMAIN_MODEL.md) | What business entities are |
| **This Data Model** | How those entities exist as logical data |
| [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md) | Why/how the Data Layer preserves fact authority |
| [Sync Engine](./SYNC_ENGINE.md) | How facts are acquired under control |
| Database / physical docs | How logical data is physically stored |

---

## How to use this document

1. Start from the [Domain Model](./DOMAIN_MODEL.md) entity, then locate its data category and ownership here.
2. When designing a capability reading, pick a read model and declare facts vs derivation and the Accounting model.
3. When adding durable facts, extend Data Layer contracts deliberately (System Architecture); do not invent screen-only authoritative history.
4. When physical schema changes, preserve this logical model; update Database docs — do not silently revise business meaning.
5. Record consequential ownership or persistence-vs-derivation changes as ADRs.

This file is the Production logical Data Model for OrionShop.
