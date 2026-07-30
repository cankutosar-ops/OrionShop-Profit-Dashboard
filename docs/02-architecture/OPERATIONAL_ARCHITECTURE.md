# Operational Architecture

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
- [Reporting Architecture](./REPORTING_ARCHITECTURE.md)
- [Integration Architecture](./INTEGRATION_ARCHITECTURE.md)

---

Related Documents

- [Application Architecture](./APPLICATION_ARCHITECTURE.md) — Operational Monitoring capability
- [Sync Engine](./SYNC_ENGINE.md)
- [Reporting Architecture](./REPORTING_ARCHITECTURE.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md) — change management
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

On consequential change to Account Lifecycle, verification/publication order, trust states, or platform evolution discipline

---

Source of Truth

This file (operational business architecture). Sync intake philosophy remains owned by [Sync Engine](./SYNC_ENGINE.md). Fact preservation remains owned by [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md). Money-rule change discipline remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md).

---

Purpose

Define how OrionShop operates as a living system: onboarding, synchronization, verification, reporting publication, audit, and continuous evolution — while preserving business integrity.

---

Scope

Operational **business** architecture only. Does not specify DevOps, CI/CD, cloud providers, deployment, or runtime tooling.

---

## 1. Purpose

Operational Architecture exists so the platform can **keep running without losing meaning**.

OrionShop is not a one-time import. Marketplace Accounts are onboarded, history is filled, truth advances incrementally, trust is verified, reports are published, defects are audited, and the product evolves. Each of those motions can corrupt Commercial Performance, Inventory history, or seller trust if done without discipline.

This document states the operational order of business integrity:

```text
Meaning & architecture settled
        ↓
Account onboarded under tenancy
        ↓
Historical depth established
        ↓
Incremental synchronization
        ↓
Verification & Coverage honesty
        ↓
Interpretation & read models
        ↓
Reporting publication
        ↓
Audit & recovery when needed
        ↓
Documented evolution (then implementation)
```

Without Operational Architecture:

- Features ship before terminology and rules exist.
- Live State silently rewrites yesterday’s history.
- Reports publish before verification.
- “Fixes” change Accounting meaning to mask incomplete Sync.

---

## 2. Operational Principles

1. **Business-first evolution** — Business questions, Domain entities, and Accounting models lead. Implementation follows settled Knowledge Base meaning (Project DNA).

2. **Historical data is never casually rewritten** — Inventory Snapshots and closed-period evidence are immutable in spirit; corrections are deliberate and auditable (Historical Integrity).

3. **Verification before publication** — Decision-grade historical claims require qualified Availability. Persistence alone is not permission to claim completeness (Sync Engine; Reporting Architecture).

4. **Architecture before implementation** — Structural and ownership questions are settled in architecture documents before code widens contracts.

5. **Documentation before development** — Consequential meaning, ownership, or model changes update canonical Knowledge Base (and ADRs when needed) before mathematics and presentation move.

6. **Reproducibility** — Same scope + unchanged facts + unchanged settled rules ⇒ same reportable results.

7. **Observability** — Sync outcomes, Coverage, Verification posture, and operational alerts must be visible to operators (Operational Monitoring / Production Health). Quiet false success is a defect.

8. **Auditability** — Material intake, verification evaluations, and published financial claims remain reconstructible to facts and rules.

9. **Tenant isolation in operations** — Every operational workflow is scoped to Company / Marketplace Account. No cross-tenant operational shortcuts.

10. **Separation of duties in motion** — Intake ≠ interpretation ≠ reporting composition ≠ stewardship writes.

11. **Honest trust labels** — Prefer visible Partial / Pending / Failed over unlabeled “healthy” incompleteness.

12. **No semantic breakage by convenience** — UI or connector convenience must not silently redefine Revenue, Net Profit, Order, Sale, or Estimated Tax bases.

13. **Account Lifecycle awareness** — Historical initialization and ongoing Incremental Sync are distinct operational modes; they must not be confused (Glossary: Account Lifecycle).

14. **Seller remains accountable for decisions** — The platform improves judgment quality; it does not own the seller’s commercial risk (Business Model).

---

## 3. Operational Workflows

Business processes only — not runbooks or tooling.

### 3.1 Initial account onboarding

**Purpose.** Bring a Marketplace Account under Multi-Tenant Commercial Reality so the platform may legally and logically hold its facts.

**Flow (conceptual):**

1. Company exists (or is established) as the tenancy root.
2. Marketplace Account is created under that Company for a Marketplace type.
3. Integration connection and authentication become possible (Integration Architecture).
4. Account enters Account Lifecycle toward historical initialization — not yet treated as “fully historically complete.”
5. Application Administration scopes operator work to that account; Reporting and Sync intents become meaningful.

**Integrity rule.** No authoritative multi-period Commercial Performance claims until historical depth and verification posture support them.

### 3.2 Historical backfill

**Purpose.** Establish durable historical depth so past Reporting Periods and inventory history can exist.

**Flow (conceptual):**

1. Declare Backfill / historical import intent for the Marketplace Account.
2. Acquire external business events and positions through controlled intake (Sync Engine).
3. Validate and normalize to Domain / Data contracts.
4. Persist into the Historical Data Warehouse.
5. Preserve Inventory Snapshots and period evidence as history — not as disposable cache.
6. Evaluate Coverage / Verification for the initialized horizons.

**Integrity rule.** Backfill must not invent missing facts to force completeness. Incomplete history remains incomplete until evidence exists.

### 3.3 Incremental synchronization

**Purpose.** Keep the durable operating record current after historical depth exists.

**Flow (conceptual):**

1. Operator or scheduled intent requests Incremental Sync for the scoped account (for example Sync Wildberries as the primary action concept).
2. Acquire new and changed external realities.
3. Persist without casually rewriting preserved Historical Snapshots or closed-period evidence.
4. Update Live State companions where appropriate — without substituting them for history.
5. Expose outcome honesty (success, partial, failure).

**Integrity rule.** Incremental Sync advances the present; it does not redefine yesterday’s published meaning by silent overwrite.

### 3.4 Verification

**Purpose.** Earn trust that synchronized facts are coherent and complete enough for a stated question.

**Flow (conceptual):**

1. Run Sync Verification / Verification Audit for the account and relevant horizons.
2. Capture Verification Snapshot for audit when evaluation occurs.
3. Publish posture to Operational Monitoring / Production Health (Coverage, alerts, Last Sync awareness).
4. Qualify which read models and reports may claim decision-grade status.

**Integrity rule.** Verification does not compute Net Profit or change Accounting categories to improve appearances.

### 3.5 Reporting publication

**Purpose.** Compose and publish management / analytical views for a Report Scope.

**Flow (conceptual):**

1. Declare Report Scope (Company, Marketplace Account, time basis, filters).
2. Confirm trust qualification for historical claims (Verification / Coverage).
3. Consume capability read models under a declared Accounting model (or non-P&L inventory reading).
4. Compose Report sections without owning a private ledger (Reporting Architecture).
5. Publish on-platform views and/or exportable deliverables with export parity.

**Integrity rule.** No decision-grade historical publication that bypasses warehouse facts or hides known incompleteness.

### 3.6 Audit workflow

**Purpose.** Investigate disagreement, incompleteness, or suspected semantic drift — then restore integrity.

**Flow (conceptual):**

1. Detect symptom (Dashboard vs Report mismatch, settlement lag confusion, coverage gap, unexpected KPI change).
2. Separate layers: meaning (Glossary/Accounting) vs facts (Warehouse) vs intake (Sync/Integration) vs composition (Reporting).
3. Reconstruct fact path and rule path (Reporting Architecture auditability).
4. Classify defect: incomplete sync, mapping error, rule defect, composition bug, or external upstream change.
5. Recover intake/history deliberately; or update canonical documents if business meaning must change.
6. Re-verify and re-publish only after integrity is restored.

**Integrity rule.** Do not “fix” audits by inventing a one-off report dialect.

### 3.7 Feature evolution

**Purpose.** Extend the product without corrupting the living record or business language.

**Flow (conceptual):**

1. Start from the business question (Business Model domain).
2. Update Domain / Glossary / Accounting / Architecture as required — documentation before development.
3. Attach capabilities, adapters, or read models without forking Commercial Performance.
4. Implement against settled contracts.
5. Verify operational impact (sync, history, reporting consistency).
6. Record consequential trade-offs as ADRs.

**Integrity rule.** Architecture drives implementation; connectors and screens do not legislate terminology.

---

## 4. Trust Model

Operational trust states describe **business readiness to believe**, not infrastructure probe codes. Labels should remain honest (aligned with Sync Verification / Coverage vocabulary).

| Trust state | Business meaning |
|-------------|------------------|
| **Pending** | Intake or verification has not yet produced a usable judgment for the question; claims should wait or be clearly provisional |
| **Partial** | Some facts exist, but Coverage / coherence is incomplete for the intended decision-grade claim; incompleteness must be disclosed |
| **Verified** | For the stated scope and question, acquisition + persistence + verification align enough to support decision-grade use |
| **Failed** | Sync or verification did not succeed; authoritative claims from that effort must not be treated as complete success |
| **Recovered** | After failure or partial state, deliberate recovery has restored Availability toward correctness without erasing healthy history |

### Trust rules

1. Trust is **question-scoped** — Verified for Live Stock today ≠ Verified for a closed commercial month.
2. Trust is **tenant-scoped** — One Marketplace Account’s Verified state does not transfer to another.
3. **Partial is real** — Not a temporary embarrassment to hide; a first-class operating state.
4. **Recovered is earned** — Requires visible correction path, not a renamed Failed.
5. Reporting and Decision Support must **consume** trust states; they must not overwrite them by optimistic arithmetic.
6. External live screens may look “fine” while internal trust is Partial/Failed — warehouse + verification remain the internal authority for historical claims.

---

## 5. Operational Boundaries

Clarify who does what while the system runs:

| Concern | Operational responsibility |
|---------|----------------------------|
| **External systems** | Own upstream events and operational reality; may change without OrionShop consent |
| **Integration layer** | Adapter boundary: connect, authenticate, translate — never redefine Domain meaning (Integration Architecture) |
| **Sync Engine** | Controlled intake lifecycle; Backfill vs Incremental discipline; enable Verification |
| **Historical Warehouse** | Persist and preserve the durable operating record; fact authority for authoritative claims |
| **Application layer** | Journeys: Administration, Sync Control triggers, stewardship writes, capability read models, Operational Monitoring visibility |
| **Reporting layer** | Compose and publish from read models; never own or mutate business facts; verify-before-publish for decision-grade history |
| **Accounting / Business meaning** | Govern how money and terms are read; change only through documented change management |
| **Seller-operator** | Owns commercial decisions and stewardship inputs (Unit Cost, Purchases); platform supports judgment |

### Boundary rules in operation

1. Application must not run private authoritative intake forks that bypass Sync philosophy.
2. Reporting must not publish a second ledger.
3. Warehouse must not invent Accounting meaning.
4. Integrations must not force Glossary renames when vendors change labels.
5. Operational Monitoring qualifies trust; it is not Commercial Performance.

---

## 6. Change Management

Evolving a living system without breaking semantics:

### Principles

1. **Business rules evolve before code** — Especially money meaning (Accounting Rules change management).
2. **Architecture drives implementation** — Application, Data, Reporting, Integration, and Operational architectures settle ownership before widening behavior.
3. **Canonical documents govern terminology** — Glossary and Domain Model win over chat, tickets, and connector slang.
4. **No breaking semantic changes by stealth** — If Net Profit, Revenue, Order/Sale boundaries, or Estimated Tax bases change, treat as consequential: document, effective-date, ADR when required; default is no silent restatement of published periods.
5. **Prefer additive clarification** — Extend categories and capabilities without quietly redefining existing claims.
6. **Knowledge Base is part of the product** — A feature that ships without updating governing docs is operationally incomplete when meaning or ownership shifted.
7. **Verify after change** — Meaning or intake changes require re-qualification of trust for affected scopes before claiming continuity of historical reports.

### Minimum sequence for consequential change

```text
Business question clarified
      ↓
Update Domain / Glossary / Accounting / Architecture as needed
      ↓
ADR for consequential trade-offs
      ↓
Implement adapters / capabilities against settled contracts
      ↓
Verify → publish
```

No financial or historical-integrity behavior change is complete while only code or UI has moved (Accounting Rules).

---

## 7. Scope Boundaries

### Intentionally included

- How the platform continuously operates while preserving business integrity
- Operational principles (history, verification-before-publication, documentation discipline)
- Business workflows: onboarding, backfill, incremental sync, verification, reporting publication, audit, feature evolution
- Trust model as business readiness states
- Operational boundaries across external, integration, warehouse, application, and reporting
- Change management for semantic and architectural evolution

### Intentionally excluded

- Infrastructure provisioning and cloud providers
- Deployment topologies and environments
- CI/CD pipelines and release tooling
- Monitoring product/tool configuration
- Runtime configuration files and secrets machinery
- Schedulers, queues, and job runners as mechanisms
- SQL, schemas, and API catalogs
- DevOps runbooks and incident pager processes (business audit workflow remains in scope; tooling does not)

### Boundary statement

| Document | Owns |
|----------|------|
| **This Operational Architecture** | Living-system business operation and evolution discipline |
| [Sync Engine](./SYNC_ENGINE.md) | Intake philosophy |
| [Integration Architecture](./INTEGRATION_ARCHITECTURE.md) | External attachment contracts |
| [Reporting Architecture](./REPORTING_ARCHITECTURE.md) | Publication composition rules |
| [Application Architecture](./APPLICATION_ARCHITECTURE.md) | Capability ownership including Operational Monitoring |
| Infrastructure / DevOps docs (elsewhere) | How runtime is hosted — must not redefine business operation meaning |

---

## How to use this document

1. When onboarding an account, follow Account Lifecycle: connect → backfill → verify → then claim historical completeness.
2. When publishing reports, check trust state for the question and scope before decision-grade language.
3. When something looks wrong, run the audit workflow by layer (meaning vs facts vs intake vs composition).
4. When evolving features, refuse implementation that skips documentation of meaning or ownership changes.
5. When pressure mounts to “just overwrite history,” stop — use deliberate correction and verification instead.

This file is the Production Operational Architecture for OrionShop.
