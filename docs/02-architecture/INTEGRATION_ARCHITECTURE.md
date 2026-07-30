# Integration Architecture

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
- [Glossary](../01-business/GLOSSARY.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Domain Model](./DOMAIN_MODEL.md)
- [Data Model](./DATA_MODEL.md)
- [Reporting Architecture](./REPORTING_ARCHITECTURE.md)

---

Related Documents

- [Sync Engine](./SYNC_ENGINE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
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

On consequential change to integration categories, ownership boundaries, intake contracts, or extension rules for external systems

---

Source of Truth

This file (integration architectural contracts). Intake mechanics philosophy remains owned by [Sync Engine](./SYNC_ENGINE.md). Durable fact authority remains owned by [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md). Business entity meaning remains owned by [Domain Model](./DOMAIN_MODEL.md) and [Glossary](../01-business/GLOSSARY.md).

---

Purpose

Define how OrionShop integrates with external systems: architectural principles, integration types, lifecycle, ownership transfer, failure posture, and extension — without becoming an API catalog or connector manual.

---

Scope

Architectural contracts for inbound and outbound integrations only. Does not specify endpoints, credentials formats, SDKs, queues, or schemas.

---

## 1. Purpose

Integrations exist so the platform can **observe and optionally notify** the seller’s wider commercial world — without becoming that world, and without letting external vocabularies redefine OrionShop’s Domain Model.

The platform’s primary commercial memory lives in the Historical Data Warehouse. External systems (especially Marketplaces) are **upstream operational realities**. Integrations are the controlled boundary through which those realities enter (and, where designed, through which notifications or exports leave).

Without Integration Architecture:

- External field names leak into business language.
- Marketplace screens become a competing Source of Truth.
- Sync logic spreads into every Application capability.
- New connectors force Reporting and Accounting changes.

### Role within the architecture

```text
External systems (Marketplace, seller systems, future partners)
        ↓
Integration adapters (this architecture’s contract)
        ↓
Sync Engine (controlled intake) / outbound publication paths
        ↓
Historical Data Warehouse (persisted internal facts)
        ↓
Interpretation · Application read models · Reporting
```

Infrastructure provides connectivity substrate. Integrations must not encode Commercial Performance meaning (System Architecture).

---

## 2. Architectural Principles

1. **External systems never become the Source of Truth for OrionShop’s authoritative history** — Once acquired and verified, warehouse facts are the fact authority for reporting and analysis. External UIs remain upstream companions, not the durable ledger.

2. **All integrations are adapters** — An adapter translates between an external operational world and internal Domain Model / Data Model contracts. Adapters are replaceable; the internal domain is not rewritten for each connector.

3. **Business terminology never follows external APIs** — Glossary and Domain Model names win. External labels may be mapped inward; they must not redefine Order, Sale, Revenue, Inventory Snapshot, or Estimated Tax.

4. **Internal domain remains stable even if integrations change** — Marketplace expansion, connector replacement, or protocol change must not force Domain Model or Accounting Rules renames.

5. **Synchronization is decoupled from application logic** — Application capabilities trigger or observe Sync; they do not each implement private intake paths for authoritative facts (Application Architecture; Sync Engine).

6. **Intake is separated from interpretation** — Integrations and Sync deliver facts; Accounting Rules interpret money; Reporting composes read models.

7. **Tenant isolation is mandatory** — Integration activity is scoped to Company / Marketplace Account. Cross-account blending is forbidden.

8. **Secrecy and credential stewardship are first-class** — Credentials enable connection; they are not business entities and must not appear in Domain language or reports as data meaning.

9. **History-preserving intake** — Integrations must not treat Live State overwrite as a substitute for Historical Preservation (Inventory Snapshots and period evidence).

10. **Verifiable intake** — Persistence alone is insufficient; Sync Verification and Coverage qualify trust.

11. **Honest failure** — Prefer visible incomplete state over silent false completeness.

12. **Outbound integrations do not create a second ledger** — Exports and notifications publish claimed internal readings; they must not invent divergent arithmetic (Reporting Architecture: export parity).

13. **Platform does not guarantee external correctness** — Beyond what can be acquired and verified, Marketplace-side truth remains the external party’s responsibility (Business Model; Project DNA).

14. **Statutory external worlds stay outside product scope** — Tax filing and statutory accounting systems are not OrionShop’s ledger; Estimated Tax remains an operational estimate (Accounting Rules).

---

## 3. Integration Types

Integration types are **architectural categories**. Presence in this list does not claim every type is currently productized. Each type must still obey Domain Model language and ownership rules.

### Marketplace

**Purpose.** Acquire trading, fulfillment, fee, settlement, engagement, and related operational realities for a Marketplace Account.  
**Direction.** Primarily inbound (events and positions); operator-triggered Synchronization.  
**Internal landing.** Transaction Data, Snapshot Data, settlement-oriented evidence, trust data — via Sync Engine into the warehouse.  
**Status posture.** Primary integration class for the product (for example Wildberries as current Marketplace focus; additional Marketplaces only under the same tenancy discipline).

### ERP

**Purpose.** Optionally exchange enterprise commercial or inventory master/transaction context with the seller’s ERP.  
**Direction.** Inbound and/or outbound depending on future design.  
**Constraint.** ERP vocabulary maps to Domain Model; ERP must not redefine Commercial Performance. Authoritative historical marketplace trading facts remain warehouse-owned after sync — not “whatever ERP shows today.”

### WMS

**Purpose.** Optionally exchange warehouse execution or stock-movement context.  
**Direction.** Typically inbound positions/movements; outbound instructions only if explicitly designed.  
**Constraint.** Warehouse and Inventory Snapshot meanings stay Glossary/Domain Model. WMS Live State must not erase Inventory Snapshot history.

### Accounting

**Purpose.** Optionally publish operational commercial readings to, or receive classifications from, the seller’s accounting tools.  
**Direction.** Typically outbound management figures; inbound only with strict model labeling.  
**Constraint.** Does not make OrionShop the statutory books. Settlement vs Commercial Performance walls remain. Tax authority systems remain out of scope.

### Payments

**Purpose.** Optionally observe payment or acquiring-related external events when not already represented through Marketplace settlement/finance classifications.  
**Direction.** Primarily inbound evidence.  
**Constraint.** Maps to Domain/Accounting categories (for example Acquiring) without inventing a parallel P&L.

### Shipping

**Purpose.** Optionally observe carrier or shipping milestones that affect logistics understanding.  
**Direction.** Primarily inbound.  
**Constraint.** Logistics cost classification remains Accounting-owned; shipping events must not be confused with Sales or Returns.

### Notifications

**Purpose.** Outbound alerts to sellers/operators (sync failure, verification warning, operational health).  
**Direction.** Outbound.  
**Constraint.** Notifications communicate trust and readiness; they must not become a silent rewrite of warehouse facts or KPI meaning.

### Identity

**Purpose.** Authenticate and authorize who may operate the platform (and, where relevant, bind operator identity to tenant administration).  
**Direction.** Inbound identity assertions / session establishment; outbound only as required by the identity provider contract.  
**Constraint.** Identity integration is not Marketplace Account identity. Company / Marketplace Account remain commercial tenancy entities (Domain Model). Access control ≠ Administration of selling identities.

### Seller stewardship channels (related, not always “systems”)

Seller Unit Cost and Purchases practices may enter through stewardship journeys rather than Marketplace Sync. Architecturally they are still **inbound truth from the seller’s procurement world**, persisted as Configuration / stewardship data (Data Model), not Marketplace transaction intake.

---

## 4. Integration Lifecycle

All durable inbound integrations follow a conceptual lifecycle aligned with Sync Engine:

```text
Connection
      ↓
Authentication
      ↓
Synchronization intent
      ↓
Acquisition
      ↓
Validation
      ↓
Normalization (to Domain / Data contracts)
      ↓
Persistence (warehouse)
      ↓
Verification
      ↓
Availability
      ↓
Monitoring
      ↓
Recovery (when needed)
```

### Connection

Establish that a Marketplace Account (or other scoped integration subject) is eligible to integrate — tenancy exists, integration type is allowed, scope is explicit.

### Authentication

Prove the right to access the external system for that scope. Credential stewardship is Administrative/Infrastructure concern; success enables intake, not interpretation.

### Synchronization

Declare sync intent and mode (Historical Import / Backfill vs Incremental Updates). Synchronization is controlled and scoped — not unbounded scraping (Sync Engine).

### Validation

Reject or quarantine incoherent, out-of-scope, or unsafe intake before it becomes authoritative warehouse truth.

### Historical Import

Initialize durable depth for an account so past Reporting Periods and historical inventory evidence can exist. History-preserving; does not invent missing facts.

### Incremental Updates

Advance the present after historical depth exists. Must not casually rewrite preserved Historical Snapshots or closed-period evidence.

### Monitoring

Observe outcomes: success, partial success, failure, Coverage, Sync Verification posture, Last Sync awareness, Production Health / Operational Alerts (Operational Monitoring).

### Recovery

Converge after failure or partial sync without erasing healthy history. Recovery is visible and deliberate — not silent reinterpretation of Accounting meaning to “make sync look successful.”

### Outbound lifecycle (exports / notifications)

```text
Internal read model claim (declared model + scope)
      ↓
Publication intent
      ↓
Delivery to external consumer / channel
      ↓
Parity & honesty (no divergent ledger)
```

Outbound publication consumes internal readings; it does not re-acquire marketplace truth as a substitute warehouse.

---

## 5. Data Ownership

Ownership transfer must be explicit.

| Concern | Owner |
|---------|--------|
| Upstream business events and operational reality | External system (for example Marketplace) |
| Seller procurement / Unit Cost practice | Seller’s cost and procurement world (stewarded into the platform) |
| Meaning of business terms and money | Glossary / Domain Model / Accounting Rules |
| Controlled acquisition into the platform | Sync Engine (inbound marketplace-class integrations) |
| Persisted durable operating record | Historical Data Warehouse |
| Application journeys and composition | Application Layer (consumes **internal** data) |
| Reporting publication | Reporting Architecture (composes read models; never owns facts) |
| Connectivity substrate | Infrastructure Layer |

### Ownership rules

1. **External system owns its business events** until successfully acquired under platform contracts.
2. **Historical Warehouse owns persisted history** used for authoritative claims inside OrionShop.
3. **Application consumes internal data only** for authoritative Commercial Performance, period reporting, and decision-grade inventory history — not live external screens as a silent substitute ledger.
4. **Adapters never own meaning** — Mapping is translation, not legislation of Glossary terms.
5. **If external present and warehouse history disagree on an authoritative historical claim**, treat it as an integrity event to reconcile — not “trust whichever UI is open” (Warehouse ownership rule).
6. **Outbound consumers receive claims**, not ownership of OrionShop’s warehouse.

---

## 6. Failure Principles

### Retries

Retry is an intake resilience behavior. Retries must remain **idempotent in business effect**: repeating an equivalent sync intent must not invent duplicate business truth or fork history (Sync Engine).

### Partial Sync

Partial success is a real state. It must be observable. Partial Sync must not be labeled as full completeness.

### Verification

Verification evaluates whether persisted results are coherent and complete enough for the intended question. Verification does not compute Net Profit or redefine cost categories.

### Recovery

Recovery restores Availability toward correctness without destroying preserved healthy history. Prefer quarantine and re-acquisition over silent overwrite of closed evidence.

### Consistency

Integrations must enable one warehouse fact authority per claim. Parallel private stores for the same authoritative claim are forbidden.

### Trust Levels

Trust is graduated and honest:

- **Unavailable / not connected** — no authoritative claim from that integration.
- **Incomplete / warning** — facts may exist; decision-grade use requires disclosure.
- **Verified enough for the question** — Availability may feed Interpretation and Reporting for that scope.
- **External-only live view** — may inform operators, but does not replace warehouse historical authority.

Operational Monitoring surfaces trust; Accounting meaning does not change to compensate for failure.

---

## 7. Extension Strategy

New integrations are added by **attachment of adapters**, not by rewriting the business core.

1. **Map the external world to Domain Model entities** — Identify which Orders, Sales, Inventory, settlement classifications, or stewardship inputs are in scope.
2. **Choose direction and type** — Marketplace, ERP, WMS, Accounting, Payments, Shipping, Notifications, Identity, or stewardship channel.
3. **Reuse Sync Engine philosophy for durable inbound marketplace-class facts** — Do not invent per-capability intake forks for authoritative history.
4. **Preserve Accounting and Reporting** — No new Estimated Tax base, no silent Commercial Performance dialect, no private report arithmetic for the connector’s convenience.
5. **Keep terminology stable** — External names map inward; Glossary does not chase vendor language.
6. **Extend tenancy deliberately** — Additional Marketplaces use the same Company / Marketplace Account pattern.
7. **Document before widening** — Update this Integration Architecture, Sync Engine / Warehouse as needed, and ADRs for consequential trade-offs.
8. **Only adapters change** when protocols or vendors change — Domain Model, Data Model categories, Reporting Architecture principles, and Accounting Rules remain the stable center.

Disruption of Reporting or Domain language when adding a connector is a smell that ownership was inverted.

---

## 8. Scope Boundaries

### Intentionally included

- Architectural role of integrations and adapters
- Principles that protect Domain, Warehouse, Sync, Application, and Reporting boundaries
- Integration type taxonomy (including future-oriented categories)
- Lifecycle of connection through recovery (and outbound publication honesty)
- Ownership transfer and failure/trust posture
- Extension strategy for new external systems

### Intentionally excluded

- API endpoint catalogs and field dictionaries
- Tokens, credential formats, and secret storage mechanisms
- Vendor SDKs and client libraries
- Message queues, schedulers, and runtime wiring
- SQL, schemas, and migrations
- Connector implementation guides and runbooks
- UI for sync buttons (journeys belong to Application; principles belong here and in Sync Engine)
- Guarantees of Marketplace-side correctness beyond acquired and verified evidence
- Statutory tax/accounting system replacement

### Boundary statement

| Document | Owns |
|----------|------|
| **This Integration Architecture** | How external systems attach without owning internal truth |
| [Sync Engine](./SYNC_ENGINE.md) | Controlled intake philosophy into the warehouse |
| [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md) | Persisted fact authority |
| [Domain Model](./DOMAIN_MODEL.md) / [Glossary](../01-business/GLOSSARY.md) | What entities and terms mean |
| [Reporting Architecture](./REPORTING_ARCHITECTURE.md) | How internal readings are published |
| API / connector docs (elsewhere) | Mechanism detail — must obey this architecture |

---

## How to use this document

1. When proposing a new external connection, classify its integration type and direction here first.
2. Map external concepts to Domain Model entities before designing intake.
3. Route durable marketplace-class facts through Sync Engine contracts into the warehouse.
4. Keep Application and Reporting on internal read models — not on live external screens as authoritative history.
5. If a vendor change seems to require renaming Revenue, Order, or Estimated Tax, stop — fix the adapter mapping, not the business language.
6. Record consequential integration-boundary decisions as ADRs.

This file is the Production Integration Architecture for OrionShop.
