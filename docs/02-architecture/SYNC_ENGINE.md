# Sync Engine

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
- [Glossary](../01-business/GLOSSARY.md)

---

Related Documents

- [Database](./DATABASE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Security](./SECURITY.md)
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

On consequential change to sync lifecycle, verification philosophy, or sync architectural boundaries

---

Source of Truth

This file

---

Purpose

Define the canonical synchronization architecture for OrionShop — how external and seller-world information enters the platform, evolves safely, and becomes trustworthy enough for reporting and decision support. The Historical Data Warehouse owns durable facts; this document owns the synchronization philosophy that feeds and protects that warehouse.

---

Scope

Conceptual synchronization architecture only. Does not specify interfaces, schedules, algorithms, retries, schemas, or runtime tooling.

---

## 1. Purpose

Synchronization exists because the seller’s business happens outside the platform, continuously, on the Marketplace and in related seller operations.

Without Sync, the Historical Data Warehouse cannot represent reality; without disciplined Sync, it represents reality inconsistently. Synchronization is therefore not a convenience button — it is the architectural capability that keeps OrionShop aligned with Business Events so Commercial Performance, inventory history, settlement visibility, and operational monitoring remain decision-grade.

Its role in a trustworthy decision-support platform is to:

- Acquire facts for a scoped Marketplace Account under Multi-Tenant Commercial Reality.
- Advance history without casually destroying it.
- Make incompleteness visible through Verification and Coverage.
- Deliver Availability of warehouse facts for Interpretation, Reporting, and Decision Support — without becoming Interpretation itself.

---

## 2. Architectural Role

Within System Architecture, the Sync Engine is the **controlled intake path** into the Data Layer. It spans the boundary between external operational systems and the Historical Data Warehouse.

It serves Application journeys (for example Sync Wildberries actions and Operational Monitoring) but does not own Business Layer vocabulary or Accounting Layer money meaning.

### Responsibilities

1. **Acquire** Business Event facts and related seller inputs into platform control for the scoped account.
2. **Validate and normalize** intake conceptually so persistence is coherent and scoped.
3. **Persist** through warehouse contracts without inventing a presentation ledger.
4. **Support Backfill and Incremental Sync** as coexisting modes of evolution.
5. **Enable Sync Verification and Coverage** so trust is earned, not assumed.
6. **Preserve integrity** on failure: prefer visible incomplete state over silent wrong completeness.
7. **Respect tenancy and secrecy** boundaries while moving facts inward.

Sync Engine refines System Architecture’s Collection → Verification → Storage flow. Historical Data Warehouse remains fact authority after successful persistence; Accounting Rules remain meaning authority after interpretation.

---

## 3. Synchronization Principles

Consistent with Project DNA, warehouse principles, and Glossary sync vocabulary:

1. **Controlled synchronization** — Intake is intentional and scoped (Company / Marketplace Account), not an unbounded scrape of the external world.

2. **Deterministic synchronization** — The same external facts, under the same sync mode and settled contracts, should yield the same warehouse outcomes.

3. **Idempotent synchronization** — Repeating an equivalent sync intent must not invent duplicate business truth or silently fork history.

4. **Incremental evolution** — Prefer controlled forward advancement after historical depth exists; avoid habitual full destructive reload of the past (Project DNA; Historical Data Warehouse).

5. **Repeatable synchronization** — Sync outcomes for a given intent must be reproducible when inputs and contracts are unchanged.

6. **Verifiable synchronization** — Persistence alone is insufficient; Sync Verification and Coverage qualify whether results are trustworthy for a question.

7. **History-preserving synchronization** — Sync must not treat Live State overwrite as a substitute for Historical Preservation (Inventory Snapshot and period evidence).

8. **Separation of intake from interpretation** — Sync delivers facts; it does not redefine Revenue, Net Profit, or Estimated Tax bases.

9. **Failure visibility** — Failed or partial sync must be observable; quiet success labels on incomplete Coverage are architectural defects.

10. **Tenant isolation** — Sync never blends Marketplace Account facts across boundaries.

11. **Auditability of material intake** — Significant acquisitions remain conceptually traceable (Import Audit purpose; Verification Snapshot purpose).

12. **Account Lifecycle awareness** — Sync posture evolves from historical initialization toward healthy ongoing Incremental Sync; modes are not confused (Glossary: Account Lifecycle).

---

## 4. Synchronization Lifecycle

Conceptually, synchronized information moves as follows:

```text
External Business Event
      ↓
Acquisition
      ↓
Validation
      ↓
Normalization
      ↓
Persistence
      ↓
Verification
      ↓
Availability
      ↓
Decision Support
```

### External Business Event

A Marketplace or seller-world occurrence that the platform needs to know about (Business Model lifecycle).

### Acquisition

Bringing candidate facts into platform custody for the scoped Marketplace Account — via Backfill depth or Incremental Sync advancement, as appropriate.

### Validation

Rejecting or quarantining incoherent, out-of-scope, or unsafe intake before it becomes authoritative warehouse truth.

### Normalization

Aligning acquired facts to platform contracts and Glossary identity (Brand, Model, Warehouse, and related business identity) without changing Accounting meaning.

### Persistence

Writing durable facts into the Historical Data Warehouse under tenant scope — respecting Historical Integrity.

### Verification

Evaluating whether what was persisted is complete and coherent enough for intended uses (Sync Verification, Coverage). Distinct from business KPI calculation.

### Availability

Making verified-enough warehouse facts usable by Application Layer interpretation and Reporting — with incompleteness disclosed when trust is not yet earned.

### Decision Support

Seller-operator use of resulting Information and Insight. Sync enables this stage; it does not own the Decision.

Loops are expected (new events, corrections, re-verification). Skipping Verification before claiming decision-grade historical completeness is forbidden by architecture.

---

## 5. Backfill Strategy

### Purpose of historical initialization

Backfill establishes historical depth for a Marketplace Account so the platform is not limited to “facts since first click.” It populates the warehouse with past intervals needed for Reporting Period analysis, Inventory History foundations where applicable, and credible Financial Performance reading over time.

### Why historical completeness matters

- Business Model success requires Historical transparency and comparable periods.
- Accounting Rules demand reproducible closed-period readings; shallow history cannot support that promise.
- Without Backfill, Incremental Sync only perfects a thin present — useful for operations, insufficient for management memory.
- Account Lifecycle treats historical catch-up as a first-class stage before claiming healthy ongoing sync.

Backfill is a **mode of synchronization**, not a one-off script identity. It must still obey Validation, Persistence, Verification, and Historical Integrity — especially: do not “complete” history by inventing missing facts.

Algorithms, windowing tactics, and job orchestration are out of scope here.

---

## 6. Incremental Synchronization

### Purpose of continuous updates

Incremental Sync keeps the warehouse aligned as new External Business Events occur after historical depth exists. It answers operational freshness: Last Sync relevance, current Coverage trajectory, and ongoing Availability for live decision support.

### Coexistence with historical data

- Incremental Sync advances the present; it must not casually rewrite preserved Historical Snapshots or closed-period evidence.
- Live State may update for operations while history remains stable (Historical Data Warehouse; Accounting Rules: Time Principles).
- Backfill and Incremental Sync coexist across Account Lifecycle: catch-up first in spirit, then controlled ongoing advancement — with re-entry to catch-up only as a deliberate recovery/completeness action, not as daily destruction of history.
- When increment and history appear to conflict, treat it as an integrity event requiring Verification and deliberate correction — not silent overwrite of the past.

Incremental Sync is implementation-independent as a principle: **small, controlled, repeatable forward motion under verification.**

---

## 7. Verification Philosophy

Synchronization must be verified before information becomes trusted for decision-grade claims.

### Why

- Acquisition can succeed technically while Coverage remains incomplete.
- Sellers decide on Commercial Performance and inventory positions; unverified “green” sync creates false Financial Confidence.
- Project DNA: verification over assumption.
- Warehouse philosophy: persistence ≠ completeness.

### Conceptual verification

- **Sync Verification** evaluates posture and coherence of synchronized sources for an account and relevant horizons.
- **Coverage** expresses how complete warehouse facts are relative to expected business activity for sync sources.
- **Verification Snapshot** preserves an immutable evaluation moment for audit — distinct from Inventory Snapshot.
- Verification may yield healthy, warning, or empty/incomplete postures; those labels must remain honest.
- Verification does not compute Net Profit, redefine cost categories, or replace Accounting Rules.
- Failed verification blocks overconfident Availability messaging; it does not authorize inventing facts to “pass.”

Trust is earned when Acquisition + Persistence + Verification align for the question being asked.

---

## 8. Consistency Strategy

Synchronization maintains consistency over time through discipline, not hope.

1. **Repeatability** — Equivalent sync intents against equivalent external facts converge to the same warehouse outcomes.
2. **Reconciliation** — Warehouse facts remain reconcilable to declared sync sources and periods; unexplained divergence is a defect.
3. **Stability of history** — Forward sync does not silently mutate preserved historical evidence.
4. **Cross-surface consistency enablement** — By feeding one warehouse, Sync enables Application and Reporting consistency; Sync itself must not write competing private stores for the same claim.
5. **Temporal consistency** — Sync respects Business Event Date vs Settlement Date vs snapshot time vs Live State; it does not collapse clocks.
6. **Model neutrality** — Sync provides facts usable by Commercial Performance, WB Settlement, and operational domains; it does not pick a financial model or unify Estimated Tax bases.
7. **Idempotent convergence** — Re-sync heals gaps and corrects deliberate targets without multiplying truth.

Consistency is a Sync + Warehouse joint property: Sync supplies controlled change; Warehouse holds stable evidence.

---

## 9. Failure Philosophy

Synchronization will fail. Architecture treats failure as a first-class state, not an embarrassment to hide.

### Conceptual stance

1. **Integrity over appearance** — Prefer an incomplete but honest warehouse to a complete-looking false one.
2. **Visibility** — Failures and partial successes must be observable through Operational Monitoring concepts (Production Health, Operational Alerts, Sync Verification posture, Last Sync awareness).
3. **Recoverability** — Failed or partial sync must be re-attemptable without destroying healthy history; recovery is deliberate convergence, not panic reload.
4. **Containment** — Failure in one sync source or horizon must not silently corrupt unrelated preserved history or other Marketplace Accounts.
5. **No silent reinterpretation** — Sync failure is not fixed by changing Accounting meaning in the Application Layer.
6. **Qualification of Availability** — When sync fails or Coverage warns, decision-grade claims for affected scopes must be qualified or withheld.

Operational runbooks and retry tactics are out of scope; the architectural rule is: **fail visibly, recover deliberately, preserve integrity.**

---

## 10. Architectural Boundaries

### Responsibilities of the Sync Engine

- Controlled Acquisition for scoped Marketplace Accounts.
- Conceptual Validation and Normalization prior to authoritative Persistence.
- Backfill and Incremental Sync mode discipline.
- Enabling Sync Verification, Coverage awareness, and intake auditability.
- Protecting Historical Integrity while advancing freshness.
- Surfacing success, partial success, and failure honestly.

### Responsibilities outside the Sync Engine

| Outside concern | Owner |
|-----------------|--------|
| Glossary vocabulary and Business Model domains | Business Layer |
| Revenue, costs, Estimated Tax bases, financial model choice | Accounting Layer |
| Durable storage contracts and historical preservation semantics | Historical Data Warehouse / Data Layer |
| Commercial Performance calculation and reporting composition | Application Layer (consuming warehouse + Accounting Rules) |
| Smart Pricing simulation | Application pricing capability (reads inputs; not a sync mode) |
| Executive Recommendations / analytics insight | Application / reporting capabilities |
| Runtime hosting and connectivity substrate | Infrastructure Layer |
| Statutory accounting and tax authority | Explicitly out of product scope |

### Differentiation

- **Synchronization** moves and qualifies facts.
- **Reporting** publishes interpreted results for a scope.
- **Analytics / decision support** generates insight and options.
- **Business interpretation** applies Accounting Rules and domain logic.

Sync must not silently perform reporting arithmetic or redefine business interpretation to “make the sync look successful.”

---

## 11. Quality Attributes

| Attribute | Meaning for synchronization |
|-----------|-----------------------------|
| Reliability | Sync completes with honest outcomes; partial states are real states, not fake success |
| Determinism | Same inputs and contracts yield the same warehouse effects |
| Observability | Progress, Last Sync, Verification posture, Coverage, and failures are visible |
| Recoverability | Incomplete or failed sync can converge later without erasing healthy history |
| Scalability | More accounts, deeper history, and more sources extend controlled intake — not uncontrolled coupling |
| Integrity | Tenant isolation, history preservation, and no duplicate truth under idempotent replay |
| Auditability | Material intake and verification evaluations remain conceptually traceable |
| Timeliness | Incremental Sync keeps Availability fresh enough for operations without sacrificing verification |

A sync capability that is fast but unverifiable has failed its architectural purpose.

---

## 12. Future Evolution

Synchronization may evolve while preserving these principles:

- Richer source Coverage and clearer per-domain trust postures as Business Model domains deepen.
- Stronger Verification Snapshot and Import Audit clarity as compliance and seller trust demands rise.
- Additional Marketplaces under the same tenant-scoped Sync philosophy — not a second sync religion per platform.
- Better separation of Backfill recovery vs routine Incremental Sync as Account Lifecycle matures.
- Tighter coupling to warehouse snapshot commitments where history would otherwise be lost — without turning Sync into the snapshot’s business meaning owner.
- Improved observability for seller-operators and operators — still without exposing secrets or collapsing tenancy.

Non-negotiables: controlled scoped intake, history-preserving evolution, verification before overconfidence, separation from accounting interpretation, and no multiple fact authorities for the same claim.

---

## How to use this document

1. Read System Architecture and Historical Data Warehouse first for placement and fact authority.
2. Use this document to judge whether a proposed intake change is Sync, Interpretation, or Reporting.
3. When sync meaning or boundaries change, update this document (and ADRs as needed) before changing behavior.
4. Do not document endpoints, schedules, or algorithms here — those belong in later technical docs only if consistent with this philosophy.

This file is the canonical synchronization architecture reference for the Knowledge Base.
