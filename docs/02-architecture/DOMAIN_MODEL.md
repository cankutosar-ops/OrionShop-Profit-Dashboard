# Domain Model

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

---

Related Documents

- [Glossary](../01-business/GLOSSARY.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Data Model](./DATA_MODEL.md)
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

On consequential change to business entity meaning, identity, ownership, or relationships

---

Source of Truth

This file (entity shape and ownership). Term definitions remain owned by the [Glossary](../01-business/GLOSSARY.md). Money interpretation remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md).

---

Purpose

Define the canonical Domain Model for OrionShop: the business language of every major entity the platform reasons about — identity, ownership, lifecycle, relationships, and logical sources of truth.

---

Scope

Business domain reality only. Does not define storage shapes, interfaces, presentation, or runtime mechanisms.

---

## 1. Purpose

The Domain Model exists so every human and AI participant shares one stable map of **what exists in the seller’s commercial world** before discussing calculation, synchronization, storage, or screens.

Without a Domain Model:

- Capabilities invent parallel names for the same reality.
- Orders are confused with Sales, Purchases with Buyouts, Inventory Snapshots with Live State.
- Ownership of meaning becomes ambiguous across Application, Accounting, and Data concerns.

### Relationship to peer Knowledge Base documents

| Document | Owns | Domain Model relationship |
|----------|------|---------------------------|
| [Business Model](../01-business/BUSINESS_MODEL.md) | Domains, decisions, lifecycle of business value | Domain Model supplies the entities those domains talk about |
| [Glossary](../01-business/GLOSSARY.md) | Canonical definitions and aliases | Domain Model **uses** Glossary terms; it does not redefine them |
| [Accounting Rules](../01-business/ACCOUNTING_RULES.md) | Money meaning and financial model walls | Domain Model names cost and settlement entities; Accounting decides how money is read |
| [Application Architecture](./APPLICATION_ARCHITECTURE.md) | Capability ownership and journeys | Capabilities **consume** this Domain Model; they do not invent private entity dialects |
| [System Architecture](./SYSTEM_ARCHITECTURE.md) | Layer placement | Domain Model lives in Business Layer meaning; layers consume it |
| [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md) | Durable fact authority | Warehouse **records** domain facts; it does not redefine what an Order or Sale *is* |
| [Sync Engine](./SYNC_ENGINE.md) | Controlled intake | Sync **acquires** domain events into durable facts; it does not redefine business entities |
| [Data Model](./DATA_MODEL.md) | How domain entities exist as logical data | Must follow this Domain Model — never the reverse |

**Rule:** Business terminology is authoritative. If implementation differs from this Domain Model (or Glossary / Accounting Rules), implementation must change.

---

## 2. Domain Principles

1. **Business-first terminology** — Names describe commercial reality, not storage, interfaces, or frameworks.

2. **Single business meaning** — Each entity has one Glossary-aligned meaning. Casual aliases are allowed only as documented aliases, never as alternate definitions.

3. **Single logical owner of meaning** — Vocabulary belongs to the Business Layer (Glossary). Money interpretation belongs to the Accounting Layer. Durable recording belongs to the Data Layer. Application capabilities journey and compose; they do not redefine entities.

4. **Stable identity** — An entity’s identity is the business identity that survives presentation and storage change (for example Company, Marketplace Account, Supplier Article, Warehouse name as used in operations).

5. **Explicit lifecycle** — Entities move through business states and events (created, completed, returned, stewarded, settled, verified). Lifecycles are commercial, not technical job states.

6. **Clear relationships** — Relationships are stated in business language (owns, offers, receives, becomes, affects, stores, describes).

7. **Implementation independence** — The Domain Model remains valid if databases, APIs, UI, frameworks, or marketplace integrations change.

8. **Tenant scope** — Commercial facts and identities are always understood under Multi-Tenant Commercial Reality: Company and Marketplace Account boundaries.

9. **Time honesty** — Live State, Historical Snapshot, Business Event Date, Settlement Date, and Reporting Period are distinct time concepts (Accounting Rules / Glossary). Entities must not silently collapse them.

10. **Epistemic honesty** — Observed marketplace facts, seller-stewarded costs, estimated values, and simulations remain distinguishable (Accounting Rules).

---

## 3. Core Domain Entities

Only entities that represent real business concepts are included. Forced technical notions (for example “finance transaction row” or “sync job record”) are omitted unless they name a distinct business idea.

For each entity:

- **Purpose** — why the business cares
- **Business Meaning** — Glossary-aligned sense (summary; Glossary remains definitional SoT)
- **Business Owner** — which Business Model concern / layer owns meaning
- **Lifecycle** — commercial states or evolution
- **Canonical Identity** — how the business recognizes “the same” entity
- **Relationships** — key links
- **Business Source of Truth (logical)** — where truth comes from in business terms (never a technical store)

### 3.1 Tenancy and marketplace

#### Company

| Aspect | Definition |
|--------|------------|
| Purpose | Top-level commercial organization boundary for seller operations |
| Business Meaning | A commercial organization that owns one or more Marketplace Accounts |
| Business Owner | Business Layer — Multi-Tenant Commercial Reality |
| Lifecycle | Established → operated → (optionally) retired as a tenancy container |
| Canonical Identity | The seller’s organization identity within the product |
| Relationships | Owns Marketplace Accounts; scopes all commercial reading |
| Logical SoT | Seller’s organizational reality as administered for the platform |

#### Marketplace

| Aspect | Definition |
|--------|------------|
| Purpose | Name the trading platform type (for example Wildberries) |
| Business Meaning | The marketplace platform on which selling identities operate |
| Business Owner | Business Layer |
| Lifecycle | Stable platform concept; expansion of Marketplace types is a deliberate Business Model change |
| Canonical Identity | Marketplace type / platform identity |
| Relationships | Hosts Marketplace Accounts; is the upstream operational world Sync acquires from |
| Logical SoT | External marketplace platform reality |

#### Marketplace Account

| Aspect | Definition |
|--------|------------|
| Purpose | Single selling identity under a Company |
| Business Meaning | One selling identity on a Marketplace, belonging to one Company; commercial data and credentials are scoped here |
| Business Owner | Business Layer — Multi-Tenant Commercial Reality / Administration |
| Lifecycle | Created → credentialed → synchronized → operated → (optionally) deactivated |
| Canonical Identity | The selling identity under its Company (not confused with Seller ID field alone) |
| Relationships | Belongs to one Company; offers assortment; receives Orders/Sales; holds Inventory positions; is the unit of Sync and Reporting Scope |
| Logical SoT | Seller’s marketplace selling identity as recognized in operations |

---

### 3.2 Assortment and identity

#### Brand

| Aspect | Definition |
|--------|------------|
| Purpose | Commercial brand grouping for analysis and filtering |
| Business Meaning | Brand attribution for assortment |
| Business Owner | Assortment and identity domain |
| Lifecycle | Assigned and maintained with catalog reality |
| Canonical Identity | Brand as used in seller catalog / marketplace attribution |
| Relationships | Groups Products / Models |
| Logical SoT | Catalog / marketplace brand attribution for the Marketplace Account |

#### Category

| Aspect | Definition |
|--------|------------|
| Purpose | Merchandise category grouping |
| Business Meaning | Category attribution for assortment and profitability rollups |
| Business Owner | Assortment and identity domain |
| Lifecycle | Assigned and maintained with catalog reality |
| Canonical Identity | Category as used in seller catalog / marketplace attribution |
| Relationships | Groups Products / Models |
| Logical SoT | Catalog / marketplace category attribution |

#### Product

| Aspect | Definition |
|--------|------------|
| Purpose | Sellable catalog item as understood by the seller |
| Business Meaning | Catalog / display sense of a sellable item (often the human-readable title) |
| Business Owner | Assortment and identity domain |
| Lifecycle | Offered → sold → replenished / retired |
| Canonical Identity | Product as a catalog item in seller and marketplace understanding |
| Relationships | Belongs to Brand/Category; realized commercially as Model / SKU grains; receives demand via Orders; completes via Sales |
| Logical SoT | Seller catalog reality for the Marketplace Account |

#### Model

| Aspect | Definition |
|--------|------------|
| Purpose | Primary article-level commercial unit for inventory and many analytics |
| Business Meaning | Seller’s article-level unit (commonly one Supplier Article with multiple sizes) |
| Business Owner | Assortment and identity domain |
| Lifecycle | Active in assortment → stocked → analysed → replenished or discontinued |
| Canonical Identity | Typically keyed by Supplier Article |
| Relationships | Has SKUs (size/barcode grain); has Unit Cost stewardship; participates in Inventory and analytics |
| Logical SoT | Seller article-level commercial identity |

#### Supplier Article

| Aspect | Definition |
|--------|------------|
| Purpose | Seller’s own article code |
| Business Meaning | Identifier that keys a Model across cost, catalog, and analytics |
| Business Owner | Assortment and identity domain |
| Lifecycle | Assigned with Model; stable while the article remains the commercial key |
| Canonical Identity | Seller article code |
| Relationships | Identifies Model; keys Unit Cost |
| Logical SoT | Seller’s article coding practice |

#### SKU

| Aspect | Definition |
|--------|------------|
| Purpose | Finer stock-keeping grain than Model |
| Business Meaning | Size- or barcode-level stock-keeping unit |
| Business Owner | Assortment and identity domain |
| Lifecycle | Stocked → sold / returned → depleted or replenished |
| Canonical Identity | Size and/or Barcode grain under a Model |
| Relationships | Belongs to Model; holds Inventory; appears in expansions of analytics |
| Logical SoT | Marketplace / seller size-barcode stock identity |

#### Size

| Aspect | Definition |
|--------|------------|
| Purpose | Size dimension of SKU identity |
| Business Meaning | Size attribute of a stock-keeping unit |
| Business Owner | Assortment and identity |
| Lifecycle | Stable attribute of SKU |
| Canonical Identity | Size label within Model |
| Relationships | Part of SKU identity |
| Logical SoT | Catalog / marketplace size attribution |

#### Barcode

| Aspect | Definition |
|--------|------------|
| Purpose | Item barcode identity |
| Business Meaning | Marketplace/item barcode associated with stock-keeping identity |
| Business Owner | Assortment and identity |
| Lifecycle | Assigned with item identity |
| Canonical Identity | Barcode value |
| Relationships | May identify SKU grain; not the same as Supplier Article |
| Logical SoT | Marketplace / packaging barcode reality |

---

### 3.3 Demand, sales, and returns

#### Order

| Aspect | Definition |
|--------|------------|
| Purpose | Represent customer demand placed on the Marketplace Account |
| Business Meaning | A marketplace customer order (operational counts may exclude cancelled orders when that distinction is stated) |
| Business Owner | Sales Performance domain |
| Lifecycle | Created → (optionally) Cancelled → or progresses toward completion |
| Canonical Identity | The marketplace order event for the account |
| Relationships | Targets Product/Model/SKU; may become Sale / Buyout; attributed to Warehouse where warehouse demand analytics apply |
| Logical SoT | Marketplace order reality acquired into the seller’s durable operating record |

#### Sale

| Aspect | Definition |
|--------|------------|
| Purpose | Represent completed commercial sale events |
| Business Meaning | A completed marketplace sale used in commercial and inventory reasoning |
| Business Owner | Sales Performance / Financial Performance inputs |
| Lifecycle | Completed → may later be subject to Return |
| Canonical Identity | The completed sale event for the account |
| Relationships | Distinct from Order; may generate Return; contributes to sales, Revenue story, and Warehouse Sales analytics |
| Logical SoT | Marketplace completed-sale reality in the durable operating record |

#### Buyout

| Aspect | Definition |
|--------|------------|
| Purpose | Name marketplace purchase-by-customer framing when contrasting Orders with completed purchases |
| Business Meaning | Buyout / purchase-by-customer framing (not the seller Purchases module) |
| Business Owner | Sales Performance |
| Lifecycle | Aligns with completed purchase-by-customer events in funnel language |
| Canonical Identity | Marketplace buyout framing for the event |
| Relationships | Related to Sale; must not be confused with Purchase (seller procurement) |
| Logical SoT | Marketplace buyout / completed-purchase framing |

#### Return

| Aspect | Definition |
|--------|------------|
| Purpose | Represent reversal of previously sold units/value |
| Business Meaning | Marketplace return of a previously sold unit/value |
| Business Owner | Sales Performance / Financial Performance inputs |
| Lifecycle | Processed against a prior Sale → affects returned units/sales and may affect settlement classifications |
| Canonical Identity | The return event referencing prior sold reality |
| Relationships | References completed Sale; affects Returned Units / Returned Sales; may incur Return Logistics; is not From Customer transit |
| Logical SoT | Marketplace return reality in the durable operating record |

---

### 3.4 Inventory and warehouses

#### Warehouse

| Aspect | Definition |
|--------|------------|
| Purpose | Name fulfillment locations that hold or move stock |
| Business Meaning | A warehouse / fulfillment location in marketplace logistics |
| Business Owner | Inventory Management |
| Lifecycle | Active location in FBW (primary orientation) or other fulfillment models as scoped |
| Canonical Identity | Warehouse as named in marketplace operations |
| Relationships | Stores Inventory; attributes Warehouse Distribution and Warehouse Sales |
| Logical SoT | Marketplace warehouse topology for the account |

#### Inventory (domain position)

| Aspect | Definition |
|--------|------------|
| Purpose | Represent stock as working capital and operational position |
| Business Meaning | Stock position and inventory management concern (Current Stock and related position metrics) |
| Business Owner | Inventory Management |
| Lifecycle | Continuously changing Live State; historically preserved via Inventory Snapshots |
| Canonical Identity | Position for assortment grain (Model/SKU) at Warehouse or rolled up, under account scope |
| Relationships | Stored in Warehouses; independent of whether a Sale occurred today; described historically by Inventory Snapshots |
| Logical SoT | Marketplace stock reality (Live State) and preserved snapshot history |

#### Current Stock

| Aspect | Definition |
|--------|------------|
| Purpose | Quantify on-hand stock now |
| Business Meaning | On-hand quantity in Live State (distinct from transit metrics when those exist) |
| Business Owner | Inventory Management |
| Lifecycle | Changes with receipts, sales, returns, and warehouse movements |
| Canonical Identity | Quantity for a scoped grain at a moment of Live State |
| Relationships | Part of Inventory; not an Inventory Snapshot |
| Logical SoT | Live operational stock picture |

#### Inventory Snapshot

| Aspect | Definition |
|--------|------------|
| Purpose | Preserve “what stock was then” |
| Business Meaning | Point-in-time capture of inventory position for a date so past stock can be reviewed without rewriting the present |
| Business Owner | Inventory Management / Historical Integrity |
| Lifecycle | Captured for a business date → preserved → readable later |
| Canonical Identity | Account-scoped inventory position as of a snapshot date (and warehouse grain where applicable) |
| Relationships | Describes Inventory state historically; distinct from Verification Snapshot |
| Logical SoT | Preserved historical inventory evidence in the durable operating record |

#### To Customer / From Customer (when available)

| Aspect | Definition |
|--------|------------|
| Purpose | Represent in-transit stock toward or returning from the customer |
| Business Meaning | Outbound / inbound transit quantities on snapshots where available |
| Business Owner | Inventory Management |
| Lifecycle | Present on eligible snapshots; not a substitute for Return events |
| Canonical Identity | Transit quantities on a given Inventory Snapshot |
| Relationships | Belong to Inventory Snapshot; From Customer ≠ Return |
| Logical SoT | Marketplace transit picture when provided |

---

### 3.5 Procurement and unit economics inputs

#### Supplier

| Aspect | Definition |
|--------|------------|
| Purpose | Name the vendor the seller buys goods from |
| Business Meaning | Vendor in the Purchases (Module) sense |
| Business Owner | Procurement |
| Lifecycle | Engaged → supplies Purchases → ongoing |
| Canonical Identity | Supplier as recognized in seller procurement |
| Relationships | Supplies Purchases; not Supplier Article |
| Logical SoT | Seller’s procurement counterparties |

#### Purchase

| Aspect | Definition |
|--------|------------|
| Purpose | Record seller procurement of goods for sale |
| Business Meaning | Seller purchase record (Purchases Module) — distinct from Buyout |
| Business Owner | Procurement / Purchasing capability |
| Lifecycle | Created / imported → lines recorded → informs cost stewardship |
| Canonical Identity | A procurement event/document under Company / account operating context |
| Relationships | From Supplier; lines relate to Supplier Article / assortment; may inform Unit Cost practice |
| Logical SoT | Seller’s procurement practice and records |

#### Unit Cost

| Aspect | Definition |
|--------|------------|
| Purpose | Maintain per-unit product cost input |
| Business Meaning | Per-unit cost maintained for a Supplier Article (or equivalent cost key) used to derive Product Cost |
| Business Owner | Procurement / Cost Management stewardship; Accounting meaning of derived Product Cost remains Accounting Layer |
| Lifecycle | Entered / updated by seller stewardship → applied to sold units as Product Cost |
| Canonical Identity | Cost key (typically Supplier Article) under tenant scope |
| Relationships | Belongs to Model/Supplier Article; feeds Product Cost |
| Logical SoT | Seller-maintained unit economics |

---

### 3.6 Money classifications and settlement

These entities are **business/accounting classifications**, not presentation widgets. How they enter Commercial Performance, WB Settlement, or Smart Pricing is governed by Accounting Rules.

#### Product Cost

| Aspect | Definition |
|--------|------------|
| Purpose | Attribute COGS to sold units for a period |
| Business Meaning | Cost of goods attributed to sold units based on Unit Cost |
| Business Owner | Accounting Layer (category meaning); Cost Management (Unit Cost inputs) |
| Lifecycle | Derived for a Reporting Period when sales and Unit Cost are known |
| Canonical Identity | Period Product Cost for scoped assortment |
| Relationships | Derived from Unit Cost × sold activity; deducted in commercial profitability per Accounting Rules |
| Logical SoT | Seller Unit Cost practice + completed sales activity |

#### Marketplace Fee

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace fee take in the commercial fee story |
| Business Meaning | Marketplace fee classification in Commercial Performance |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized with marketplace economic activity for the period |
| Canonical Identity | Fee classification for scoped period / assortment as rules define |
| Relationships | Distinct from Acquiring, Penalties, Acceptance, Adjustments |
| Logical SoT | Marketplace fee reality as classified for commercial reading |

#### Logistics

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace logistics costs for the period |
| Business Meaning | Logistics cost category (with Return Logistics as related classification where distinct) |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized with marketplace logistics events for the period |
| Canonical Identity | Logistics classification for scoped period |
| Relationships | Distinct from Product Cost and Storage |
| Logical SoT | Marketplace logistics charges as classified |

#### Storage

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace storage costs |
| Business Meaning | Storage cost category |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Storage classification for scoped period |
| Relationships | Distinct from Acceptance and Logistics |
| Logical SoT | Marketplace storage charges as classified |

#### Acceptance

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace acceptance (intake) operation costs |
| Business Meaning | Acceptance cost category |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Acceptance classification for scoped period |
| Relationships | Distinct from Storage and Logistics |
| Logical SoT | Marketplace acceptance charges as classified |

#### Penalties

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace penalty amounts |
| Business Meaning | Penalties cost category |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Penalties classification for scoped period |
| Relationships | Distinct from Marketplace Fee and Adjustments |
| Logical SoT | Marketplace penalties as classified |

#### Advertising

| Aspect | Definition |
|--------|------------|
| Purpose | Represent advertising spend attributed to the period |
| Business Meaning | Advertising cost category |
| Business Owner | Accounting Layer (with seller advertising practice as input where stewarded) |
| Lifecycle | Recognized / attributed for the period |
| Canonical Identity | Advertising classification for scoped period / assortment |
| Relationships | Distinct from Marketplace Fee |
| Logical SoT | Advertising spend reality as classified for commercial reading |

#### Adjustments

| Aspect | Definition |
|--------|------------|
| Purpose | Represent other marketplace cost adjustments |
| Business Meaning | Adjustments (Other Costs) category |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Adjustments classification for scoped period |
| Relationships | Distinct from Compensation and Marketplace Fee |
| Logical SoT | Marketplace adjustments as classified |

#### Acquiring

| Aspect | Definition |
|--------|------------|
| Purpose | Represent acquiring / payment-processing related amounts in classification |
| Business Meaning | Acquiring category as defined for commercial/settlement visibility |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Acquiring classification for scoped period |
| Relationships | Distinct from Marketplace Fee |
| Logical SoT | Marketplace acquiring amounts as classified |

#### Compensation

| Aspect | Definition |
|--------|------------|
| Purpose | Represent marketplace compensation / reimbursement amounts |
| Business Meaning | Compensation treated separately from Marketplace Fee |
| Business Owner | Accounting Layer |
| Lifecycle | Recognized for the period |
| Canonical Identity | Compensation classification for scoped period |
| Relationships | Related to settlement/finance classification; distinct from Adjustments where rules separate them |
| Logical SoT | Marketplace compensation reality as classified |

#### Estimated Tax

| Aspect | Definition |
|--------|------------|
| Purpose | Represent estimated tax charge used in profitability and informational settlement context |
| Business Meaning | One Glossary term with **two intentional bases** (historical reporting vs Smart Pricing) — Accounting Rules |
| Business Owner | Accounting Layer |
| Lifecycle | Computed under the declared financial model for the question being asked |
| Canonical Identity | Estimated Tax under a declared model (never silently blended) |
| Relationships | Historical reporting Estimated Tax ≠ Smart Pricing Estimated Tax base |
| Logical SoT | Accounting Rules for the declared model + relevant observed bases |

#### WB Settlement (Settlement)

| Aspect | Definition |
|--------|------------|
| Purpose | Present marketplace settlement / payout-oriented understanding for a period |
| Business Meaning | Settlement-oriented view distinct from Commercial Performance |
| Business Owner | Accounting Layer (framing); Financial Analysis / Reporting (application reading and reconciliation narrative) |
| Lifecycle | Settlement figures become available on marketplace settlement timing → readable for reconciliation |
| Canonical Identity | Settlement framing for Company / Marketplace Account / period |
| Relationships | Includes or sits beside Seller Payout and Settlement Amount; informed by Realization Report availability; not a substitute Commercial Performance P&L |
| Logical SoT | Marketplace settlement reality + Accounting settlement framing |

#### Seller Payout / Settlement Amount

| Aspect | Definition |
|--------|------------|
| Purpose | Name primary payout / settlement totals within settlement framing |
| Business Meaning | Payout and settlement total concepts inside WB Settlement |
| Business Owner | Accounting Layer |
| Lifecycle | Follow settlement availability for the period |
| Canonical Identity | Settlement-scoped totals |
| Relationships | Belong to WB Settlement framing; not identical to Revenue or Net Profit |
| Logical SoT | Marketplace settlement figures under settlement framing |

---

### 3.7 Reporting and trust

#### Report

| Aspect | Definition |
|--------|------------|
| Purpose | Communicate scoped management truth |
| Business Meaning | A composed management document (for example Business Report, Product Report, Marketplace Intelligence composition, Settlement Reconciliation, exports) |
| Business Owner | Reporting domain / Reporting capability |
| Lifecycle | Scoped → composed from interpreted facts → previewed / exported |
| Canonical Identity | Report kind + Report Scope (Company, Marketplace Account, period, filters) |
| Relationships | **Never owns** business entities; composes readings of Orders, Sales, Inventory, costs, Settlement, etc. |
| Logical SoT | Interpreted warehouse facts under declared Accounting models — not a private ledger |

#### Report Scope

| Aspect | Definition |
|--------|------------|
| Purpose | Bound what a Report is about |
| Business Meaning | Explicit tenancy, time, and filter scope for reporting |
| Business Owner | Reporting |
| Lifecycle | Chosen before composition |
| Canonical Identity | The scope parameters of a report reading |
| Relationships | Applies to Report composition |
| Logical SoT | Seller’s chosen analytical scope |

#### Synchronization (Sync)

| Aspect | Definition |
|--------|------------|
| Purpose | Bring Marketplace Account reality into the durable operating record under control |
| Business Meaning | Controlled synchronization of marketplace operational truth for an account (including Sync Wildberries as the primary operator action) |
| Business Owner | Sync Engine philosophy (intake); Application Administration / Sync Control (trigger); Operational Monitoring (visibility) |
| Lifecycle | Intended → Acquired → Validated → Persisted → Verified → Available |
| Canonical Identity | A synchronization effort for a Marketplace Account and horizon/mode (Backfill or Incremental) |
| Relationships | Feeds warehouse facts for Orders, Sales, Inventory, settlement inputs; produces basis for Sync Verification |
| Logical SoT | Marketplace operational reality as successfully acquired and verified — incompleteness must remain visible |

#### Sync Verification / Verification Snapshot

| Aspect | Definition |
|--------|------------|
| Purpose | Qualify whether synchronized facts are trustworthy enough for a question |
| Business Meaning | Sync Verification posture and immutable Verification Snapshot for audit — distinct from Inventory Snapshot |
| Business Owner | Operational Monitoring / Sync Verification philosophy |
| Lifecycle | Evaluated → snapshot preserved → informs Production Health |
| Canonical Identity | Verification evaluation for account/horizon at a moment |
| Relationships | Qualifies Availability of domain facts; does not redefine Revenue or Net Profit |
| Logical SoT | Verification evidence of intake completeness/coherence |

---

### 3.8 Entities evaluated and not forced

| Candidate | Decision |
|-----------|----------|
| Finance Transaction | **Not introduced** as a standalone domain entity. Marketplace economic effects are modeled as Orders/Sales/Returns plus Accounting cost/settlement classifications. |
| Sync Job | **Not introduced** as a technical job entity. Use Synchronization (Sync) as the business process. |
| Inventory | Included as domain position + Current Stock + Inventory Snapshot (not a single overloaded blob). |
| Advertising Cost / Logistics Cost / Storage Fee / Acceptance Fee / Penalty | Included under Glossary/Accounting names: Advertising, Logistics, Storage, Acceptance, Penalties. |

---

## 4. Entity Relationships

Business relationship map (not a storage schema):

```text
Company
  owns
Marketplace Account
  sells on
Marketplace

Marketplace Account
  offers
Brand / Category / Product / Model / SKU
  identified by
Supplier Article / Size / Barcode

Marketplace Account
  receives
Orders
  may progress to
Sales (and Buyout framing)
  may generate
Returns

Sales and Returns
  contribute to
Financial Performance readings
  and may attribute to
Warehouse (Warehouse Sales)

Marketplace Account
  holds
Inventory (Current Stock)
  stored in
Warehouses

Inventory Snapshots
  describe
Inventory state as of a date

Supplier
  supplies
Purchases
  which relate to
Supplier Article / Model
  whose
Unit Cost
  feeds
Product Cost

Marketplace economic classifications
  (Marketplace Fee, Logistics, Storage, Acceptance, Penalties,
   Advertising, Adjustments, Acquiring, Compensation)
  inform
Commercial Performance and/or WB Settlement
  per Accounting Rules

WB Settlement
  summarizes settlement-oriented financial understanding
  distinct from Commercial Performance

Report
  composes
interpreted domain facts under Report Scope
  and never owns those facts

Synchronization
  acquires marketplace reality for a Marketplace Account
  into the durable operating record
  qualified by
Sync Verification
```

### Relationship rules (summary)

1. Company owns Marketplace Accounts — never the reverse.
2. Marketplace Account offers assortment and is the commercial scope for Orders, Sales, Inventory, Sync, and Reports.
3. Products/Models receive Orders; Orders are not Sales.
4. Orders may become Sales; Sales may generate Returns.
5. Returns refer to completed sales reality; they are not warehouse “From Customer” transit.
6. Inventory is stored in Warehouses and exists independently of whether a Sale happened today.
7. Inventory Snapshots describe Inventory historically; they do not replace Live State.
8. Costs (Unit Cost / Product Cost and marketplace fee categories) belong to assortment and period economics — not to Reports.
9. Settlements summarize settlement-oriented understanding; they do not redefine Commercial Performance.
10. Warehouses store Inventory; warehouse attribution of Orders/Sales is analytical, not ownership of the Order entity by the Warehouse.

---

## 5. Business Events

Major events in business language (aligned with Business Model lifecycle: Business event → Recorded → Verified → Reported → Analysed → Decision):

| Event | Business meaning |
|-------|------------------|
| Order Created | Customer places an Order on the Marketplace Account |
| Order Cancelled | An Order is cancelled and must not be treated as completed demand where that distinction applies |
| Sale Completed | A Sale (completed sale) occurs |
| Return Processed | A Return is processed against prior sold reality |
| Buyout Recognized | Marketplace buyout framing is recognized for funnel/completed-purchase language |
| Purchase Recorded | Seller records a Purchase from a Supplier |
| Unit Cost Updated | Seller updates Unit Cost for a cost key |
| Inventory Changed (Live) | Live stock position changes |
| Inventory Snapshot Captured | Historical Inventory Snapshot is preserved for a date |
| Warehouse Receipt (FBW Supplies) | Inbound fulfillment receipt affects stock path (distinct from Sale) |
| Marketplace Fee / Cost Classified | Marketplace economic effects are classified into cost categories for a period |
| Settlement Generated / Available | Settlement-oriented figures become available for a period |
| Synchronization Completed | A Sync effort finishes with an honest outcome (success, partial, or failure) |
| Sync Verification Evaluated | Trust posture is evaluated for synchronized sources |
| Report Composed | A Report is composed for a Report Scope |
| Price Simulated | Smart Pricing simulation produces labeled forward-looking outputs (not historical Net Profit) |

Events are commercial. Recording, verification, and reporting are later lifecycle stages — not substitutes for the event itself.

---

## 6. Domain Rules

1. **An Order is not a Sale.** Demand and completion are distinct.
2. **A Sale may generate a Return.** Returns reference completed sales reality.
3. **Buyout is not Purchase (Module).** Marketplace buyout ≠ seller procurement.
4. **Purchases (Module) are not chart “Purchases” that mean Buyout.** Disambiguate in language.
5. **Inventory exists independently from Sales.** Stock can exist with no sale today; sales do not redefine what Inventory *is*.
6. **Inventory Snapshot ≠ Live State.** History must not be overwritten by the present.
7. **Inventory Snapshot ≠ Verification Snapshot.** Stock history ≠ sync trust evaluation.
8. **Unit Cost ≠ Product Cost.** Unit Cost is the stewarded input; Product Cost is period attribution to sold units.
9. **Costs belong to Products/Models (assortment economics) and periods** — Reports never own cost truth.
10. **Reports never own business data.** They compose interpreted facts under a declared model and scope.
11. **Settlements summarize settlement-oriented financial understanding**; they are not Commercial Performance.
12. **Warehouses store Inventory**; they do not own Orders as entities (warehouse may attribute demand/sales analytically).
13. **From Customer transit ≠ Return.** Transit is inventory movement; Return is a sales return event.
14. **Estimated Tax has two intentional bases.** Historical reporting and Smart Pricing must not be silently unified (Accounting Rules).
15. **Commercial Performance, WB Settlement, Smart Pricing, and operational Product Analytics answer different questions.** Disagreement is a defect only when they claim the same question.
16. **Synchronization does not redefine money meaning.** Intake delivers facts; Accounting interprets.
17. **Multi-tenant isolation is mandatory.** Domain facts are always under Company / Marketplace Account scope.
18. **Application capabilities must use these entities as named.** Private dialects for the same business reality are forbidden.

---

## 7. Scope Boundaries

### Intentionally included

- Business entities, identities, lifecycles, relationships, events, and domain rules.
- Logical sources of truth in business terms.
- Alignment hooks to Glossary, Business Model, Accounting Rules, and Application Architecture.

### Intentionally excluded

- Database schema, tables, columns, SQL
- Entity-relationship diagrams as storage design
- APIs, endpoints, payloads
- Services, repositories, modules-as-code
- UI layouts, widgets, navigation chrome
- Frameworks, hosting, credentials mechanisms
- Sync scheduler internals or job queues
- KPI formula detail (see Accounting Rules / KPI catalogs)
- Full Glossary prose (link Glossary; do not fork definitions)

### Boundary statement

This Domain Model is the canonical reference for **what business entities exist and how they relate**.  
The Glossary remains the canonical reference for **term definitions**.  
Accounting Rules remain the canonical reference for **how money is read**.  
Application Architecture remains the canonical reference for **which capability owns which journey**.  
Historical Data Warehouse and Sync Engine remain the canonical references for **fact authority and intake**.

---

## How to use this document

1. When naming an entity in any Knowledge Base or product discussion, start here and confirm the Glossary definition.
2. When assigning ownership of a journey, use Application Architecture — do not invent a second Domain Model inside a module.
3. When money is involved, apply Accounting Rules to the entities named here.
4. When persistence or sync changes, preserve these entities and relationships; change only mechanisms.
5. If a new business entity is required, update Glossary + this Domain Model (and Accounting Rules if money meaning changes) before implementation.

This file is the Production Domain Model for OrionShop.
