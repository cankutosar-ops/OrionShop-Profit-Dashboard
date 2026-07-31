# Historical Data Warehouse

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
- [Glossary](../01-business/GLOSSARY.md)

---

Related Documents

- [Database](./DATABASE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Historical Data Warehouse Platform — Sprint 10.0](./HISTORICAL_DATA_WAREHOUSE_PLATFORM.md)
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

On consequential change to historical strategy, snapshot philosophy, or data ownership boundaries

---

Source of Truth

This file

---

Purpose

Define the canonical architecture of the Historical Data Warehouse — the project’s persistent business-data platform. System Architecture places it in the Data Layer; this document explains why it exists, what it owns, and how it supports reproducible reporting and decision support.

---

Scope

Conceptual data-platform architecture only. Does not specify schemas, interfaces, scheduling, algorithms, or storage technologies.

---

## 1. Purpose

The Historical Data Warehouse exists so OrionShop can remember the seller’s business.

Marketplace screens and live operational caches answer “what is true right now.” Sellers also need “what was true then,” “what did we earn in that Reporting Period,” and “can we defend this number next month.” Without a durable warehouse, every report becomes a fragile reconstruction against a moving external world.

The business problem solved is **loss of commercial memory**: disappearing history, non-reproducible periods, and decisions made on Live State alone. The warehouse turns Business Events into preserved evidence for Financial Performance, Sales Performance, Inventory Management, Reporting, and Operational Monitoring — under Company and Marketplace Account scope.

---

## 2. Architectural Role

Within System Architecture, the Historical Data Warehouse is the primary expression of the **Data Layer**.

It sits beneath the Application Layer and serves the Accounting and Business layers by providing authoritative recorded facts. It does not invent Glossary meaning or Accounting Rules; it holds the durable inputs those layers interpret.

### Responsibilities

1. **Persist** scoped business facts needed for reporting and analysis.
2. **Preserve** history so past Reporting Periods and Inventory Snapshots remain readable.
3. **Separate** durable records from transient Live State and from external Marketplace presentation.
4. **Support** Verification and Coverage judgments about completeness — without redefining money meaning.
5. **Enable** database-first reporting: authoritative Commercial Performance and related readings consume warehouse facts.
6. **Respect** Multi-Tenant Commercial Reality: facts remain bound to Company and Marketplace Account.

Subsystem documents (for example Sync Engine, Database) refine mechanisms. They must not relocate meaning authority into the warehouse or presentation.

---

## 3. Core Principles

Consistent with Project DNA, Accounting Rules, and System Architecture:

1. **Persistence** — Decision-grade history is written to durable storage, not left only in memory or ephemeral views.

2. **Historical integrity** — Past readings do not casually drift when Live State changes (Accounting Rules: Historical Integrity).

3. **Reproducibility** — Unchanged facts + unchanged settled rules ⇒ unchanged reportable results for a scope.

4. **Single source of truth (data)** — For authoritative reporting claims, warehouse facts outrank presentation-only reconstruction (Glossary: Single Source of Truth (Data)).

5. **Immutable historical records in spirit** — Historical Snapshots and closed-period evidence are stable; corrections are deliberate and auditable.

6. **Separation from operational systems** — The Marketplace and live operational caches are sources and companions; they are not the warehouse itself.

7. **Scoped ownership** — Every durable fact belongs to an explicit tenant boundary (Company / Marketplace Account).

8. **Time honesty** — Business Event Date, Settlement Date, Historical Snapshot, and Live State remain distinct unless a documented bridge applies (Accounting Rules: Time Principles).

9. **Verification before overconfidence** — Persistence does not equal completeness; Coverage and Sync Verification qualify trust.

10. **Interpretation stays outside raw storage** — The warehouse stores evidence; Accounting Layer models interpret money; Application Layer presents journeys.

11. **Incremental evolution** — Prefer controlled advancement (Backfill then Incremental Sync mindset) over brittle full replacement of history as the default posture.

12. **Auditability of intake** — Material imports and preservations remain traceable (conceptually: Import Audit and Verification Snapshot purposes).

---

## 4. Business Data Lifecycle

Conceptually, business information matures through the warehouse as follows:

```text
Business Event
      ↓
Acquisition
      ↓
Verification
      ↓
Persistence
      ↓
Historical Preservation
      ↓
Business Interpretation
      ↓
Reporting
      ↓
Decision Support
```

### Business Event

A real-world occurrence in Marketplace or seller operations (as in the Business Model lifecycle).

### Acquisition

Bringing facts into the platform’s control for the scoped Marketplace Account — including historical catch-up and ongoing advancement — without yet asserting that every decision-grade claim is complete.

### Verification

Assessing whether acquired facts are coherent and complete enough for the intended question. Verification protects trust; it does not invent Revenue or Net Profit.

### Persistence

Recording facts in the warehouse so they survive Live State refresh and external UI change.

### Historical Preservation

Retaining period evidence and snapshots so “then” remains available after “now” moves on.

### Business Interpretation

Applying Accounting Rules and Application domain logic to warehouse facts — Commercial Performance, WB Settlement framing, inventory readings, or simulation inputs as appropriate.

### Reporting

Publishing scoped, reproducible views and management documents from interpreted warehouse truth.

### Decision Support

Enabling seller-operator action with honest epistemic status (observed, estimated, simulated).

Skipping Persistence or Historical Preservation breaks the chain: Interpretation then becomes theater against a vanishing past.

---

## 5. Historical Strategy

### Why history is preserved

- Business Model requires historical analysis and learning.
- Commercial Performance and inventory investigations need period and snapshot evidence.
- Seller trust depends on comparing like with like across time.
- External Marketplace presentation is not a reliable long-term archive for the seller’s own operating system.

### Why historical information must remain stable

- Decisions already made were based on a reading of the past; silent rewrite falsifies that record.
- Accounting Rules forbid casual restatement; architecture must make restatement hard and visible.
- Live State exists for operations; stability of history exists for accountability.

### Why historical reports must be reproducible

- Management documents and on-platform readings that claim the same model and scope must agree.
- Reproducibility is how the platform proves it is a system of record, not a chart generator.
- Without reproducibility, Financial Confidence (Business Model success) collapses.

History is preserved to serve truth over time — not to hoard undifferentiated raw noise without Verification.

---

## 6. Source of Truth Philosophy

The warehouse becomes authoritative for reporting and analysis through a clear authority chain:

1. **Meaning** is defined in Glossary, Accounting Rules, Business Model, and Project DNA — not inside opaque storage conventions.
2. **Facts** for authoritative claims live in the warehouse for the scoped account.
3. **Reports and Application readings** that claim historical Commercial Performance, period costs, or Inventory Snapshots must read those facts (database-first), not invent a parallel ledger.
4. **Live State** may inform operations and “current” inventory views; when a claim is historical, Historical Snapshot or period warehouse facts win.
5. **External Marketplace truth** is upstream of acquisition; once recorded and verified, the seller’s operating truth for OrionShop reporting is the warehouse record — until a deliberate correction updates it.

The warehouse is not “truth because it exists.” It is truth for reporting because architecture assigns it fact authority and because Verification qualifies readiness.

---

## 7. Snapshot Philosophy

A snapshot is a **business commitment to a point in time**.

### Purpose

- Capture a readable “as of” position (especially Inventory Snapshot) so history does not depend on today’s Live State.
- Separate “what we believed/held then” from “what we hold now.”
- Support incident investigation, trend analysis, and reproducible inventory reporting.
- Complement period-based commercial history: periods answer “over this interval”; snapshots answer “at this moment.”

### Business meaning

- Snapshots are evidence, not suggestions.
- Snapshot time is an architectural clock distinct from Settlement Date and from continuous Live State.
- When transit or other attributes are unavailable for a historical moment, honesty requires absence or qualification — not invented precision.
- Verification Snapshot serves trust evaluation of sync posture; it must not be confused with Inventory Snapshot (Glossary distinction).

Scheduling, retention mechanics, and storage layout are out of scope here; the philosophical rule is: **preserve moments that business decisions will later need to re-open.**

---

## 8. Incremental Evolution

The warehouse must both recover the past and keep pace with the present.

### Historical Backfill (conceptual)

Backfill establishes historical depth for a Marketplace Account — loading past intervals into durable storage so reporting is not limited to “since we turned the system on.” It answers: *Can we know earlier periods at all?*

### Incremental Sync (conceptual)

Incremental advancement keeps the warehouse current after history is in place — controlled forward motion as new Business Events occur. It answers: *Can we stay aligned without rewriting everything?*

### Why they coexist

- Backfill without increment leaves the platform permanently stale.
- Increment without backfill leaves a shallow present with no memory.
- Account Lifecycle conceptually progresses from catch-up toward healthy ongoing sync; the warehouse must support both modes without treating Live State overwrite as a substitute for historical preservation.
- Full destructive reload of history as a daily habit contradicts Historical Integrity; evolution prefers append, correct deliberately, and advance incrementally.

This section defines coexistence of modes — not algorithms.

---

## 9. Data Ownership

### Warehouse ownership

The warehouse owns the **seller’s durable operating record** inside OrionShop: scoped facts required for Sales Performance, Financial Performance inputs, Inventory history, verification evidence, and related analytical foundations.

### Operational systems ownership

- **Marketplace** owns the upstream trading and fulfillment reality the platform acquires from.
- **Live operational caches / Live State** own “current picture” convenience; they do not own closed history.
- **Seller procurement and cost practices** own Unit Cost truth the seller maintains; the warehouse persists what the platform has recorded for use in Product Cost interpretation.
- **Application Layer** owns journeys and composition; it does not own a private fact store that contradicts the warehouse for authoritative claims.
- **Accounting Layer** owns interpretation rules; it does not store a second set of period facts.

### Ownership rule

If two stores disagree on an authoritative historical claim, architecture treats that as a defect to reconcile — not as “pick whichever screen is open.”

---

## 10. Architectural Boundaries

### Responsibilities of the warehouse

- Persist and preserve scoped business facts and Historical Snapshots.
- Provide the fact base for database-first reporting and analysis.
- Support Verification, Coverage, and auditability of intake and preservation.
- Maintain tenant isolation of stored facts.
- Enable reproducibility of historical readings when rules and facts are unchanged.

### Responsibilities intentionally outside the warehouse

- Defining Glossary terms or Accounting Rules.
- Computing presentation layout or module navigation.
- Acting as statutory accounting books or tax authority systems.
- Guaranteeing Marketplace correctness beyond what was acquired and verified.
- Owning Smart Pricing simulation logic (simulation may *read* warehouse-backed inputs; the warehouse does not *become* the simulator).
- Replacing Infrastructure concerns (runtime, connectivity) or Security policy definition (though it must obey tenancy and secrecy constraints).
- Storing undocumented parallel ledgers for “temporary” screens.

---

## 11. Quality Attributes

| Attribute | Meaning for the warehouse |
|-----------|---------------------------|
| Consistency | Same scoped facts feed the same model the same way across reporting surfaces |
| Auditability | Material preservations and corrections can be reasoned about; verification evidence supports trust claims |
| Durability | History survives operational refresh, redeployment of Application experiences, and Marketplace UI change |
| Traceability | From a reported historical claim back to preserved facts and declared model/rules |
| Recoverability | Past periods and snapshots remain re-readable after incidents; Backfill/correction paths restore evidence deliberately |
| Scalability | Growth in accounts, history depth, and domains extends the platform without multiplying contradictory stores |
| Integrity | Live State and history do not silently overwrite each other |
| Isolation | Company / Marketplace Account boundaries hold under growth |

A warehouse that is large but inconsistent has failed its architectural purpose.

---

## 12. Future Evolution

The warehouse may evolve while keeping its principles:

- Deeper historical coverage and richer snapshot kinds as Business Model domains demand — without eroding immutability in spirit.
- Stronger Verification and Coverage semantics as trust requirements rise.
- Additional Marketplace types under the same tenancy and fact-authority model.
- Clearer separation of period facts, point-in-time snapshots, and verification evidence as volumes grow.
- Improved recoverability and Import Audit clarity without introducing silent restatement.
- Support for longer-horizon Forecast and Decision Engine inputs as **consumers** of warehouse truth — not as writers of alternate history.

Non-negotiables under evolution: Single Source of Truth (Data) for authoritative reporting, Historical Integrity, tenant scope, time honesty, and separation of storage from accounting meaning.

---

## How to use this document

1. Treat System Architecture as the parent blueprint; treat this document as the Data Layer’s warehouse contract.
2. Use Sync Engine and Database documents for specialized depth only when they remain consistent with these principles.
3. When a change affects what “history” means, update this document (and ADRs as needed) before changing behavior.
4. Never justify a presentation-only historical number by bypassing the warehouse while claiming database-first reporting.

This file is the canonical reference for the project’s Historical Data Warehouse architecture.
