# System Architecture

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

---

Related Documents

- [Architecture README](./README.md)
- [Application Architecture](./APPLICATION_ARCHITECTURE.md)
- [Database](./DATABASE.md)
- [Sync Engine](./SYNC_ENGINE.md)
- [Historical Data Warehouse](./HISTORICAL_DATA_WAREHOUSE.md)
- [Security](./SECURITY.md)
- [Decisions Index](../06-decisions/INDEX.md)
- [Modules](../03-modules/README.md)

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

On consequential change to layers, source-of-truth strategy, or architectural constraints

---

Source of Truth

This file

---

Purpose

Define the canonical system architecture blueprint for OrionShop: how major layers interact to serve the Business Model under Accounting Rules and Glossary meaning. Project DNA states why architecture matters philosophically; this document states the architectural shape.

---

Scope

Conceptual system architecture only. Does not specify technologies, interfaces, persistence schemas, module internals, or presentation units.

---

## 1. Purpose

Architecture exists to keep the platform coherent as capabilities grow.

Without an explicit blueprint, each new surface invents its own path from Marketplace reality to seller judgment — and the Business Model’s promise of consistent interpretation fails. Architecture matters because:

- Sellers trust numbers only when layers agree on meaning and authority.
- Historical Commercial Performance and Inventory readings must remain stable.
- Different financial models (Commercial Performance, WB Settlement, Smart Pricing) must coexist without becoming accidental second ledgers.
- New domains must attach to shared foundations instead of forking truth.

This document is the architectural contract for that coherence. Detailed subsystem designs (data, sync, warehouse, security) refine it; they must not contradict it.

---

## 2. Architectural Principles

Principles below are consistent with Project DNA, Business Model, and Accounting Rules. They govern structure — they do not restate project identity.

1. **Separation of concerns** — Business meaning, accounting interpretation, application capabilities, durable data, and infrastructure each own distinct responsibilities.

2. **Single source of truth (data)** — Authoritative reporting reads from the Historical Data Warehouse / persisted facts, not from transient presentation reconstruction when durable facts already exist (Glossary: Single Source of Truth (Data); Project DNA: database-first reporting).

3. **Immutable history in spirit** — Past periods and Historical Snapshots are preserved; corrections are deliberate and auditable (Accounting Rules: Historical Integrity).

4. **Reproducible reporting** — Same scope, same settled rules, same warehouse facts ⇒ same Commercial Performance and settlement readings.

5. **Layered architecture** — Dependencies point inward toward meaning and data foundations; outer layers consume contracts, they do not redefine them.

6. **Loose coupling** — Modules and presentation units integrate through clear contracts; they do not embed parallel accounting or business vocabularies.

7. **High cohesion** — Each layer and module owns a focused responsibility aligned with Business Model domains.

8. **Different questions, deliberate models** — Distinct financial models remain separated by design; unifying them for convenience is forbidden when meaning would falsify (Accounting Rules: Financial Models).

9. **Verification over assumption** — Completeness and trustworthiness of recorded facts are checkable (Sync Verification, Coverage) before claims are treated as decision-grade.

10. **Multi-tenant commercial boundaries** — Company and Marketplace Account scope is an architectural constant, not an optional filter.

11. **Knowledge Base as architectural memory** — Consequential structure and meaning changes are documented; undocumented architecture is incomplete architecture.

12. **Incremental evolution** — Prefer controlled advancement of warehouse and sync posture over brittle full rewrites as the default mindset (Project DNA: incremental synchronization).

---

## 3. Architectural Layers

Conceptual layers, from meaning to substrate:

```text
Business Layer
      ↓
Accounting Layer
      ↓
Application Layer
      ↓
Data Layer
      ↓
Infrastructure Layer
```

Cross-cutting concerns (security, tenancy, observability, Knowledge Base governance) apply across layers without collapsing them.

### Business Layer

Owns real-world domain intent: Business Model domains, Glossary vocabulary, decision lifecycle, and what “good” means for the seller-operator. It answers *what business we are in* and *what questions matter*.

### Accounting Layer

Owns money interpretation: Accounting Rules, financial model boundaries (Commercial Performance, WB Settlement, Smart Pricing), revenue and cost category meaning, estimation vs observation, and change management for financial behavior. It answers *how money must be read*.

### Application Layer

Owns product capabilities that serve Business Model domains: commercial reading, inventory, pricing support, procurement inputs, reporting, operational monitoring, and account/company administration. It composes workflows and experiences; it must consume Business and Accounting meaning rather than inventing it.

### Data Layer

Owns durable recorded truth: Historical Data Warehouse orientation, period facts, Inventory Snapshots, verification captures, and the authority path for reporting. It answers *what is stored as the record of the business*.

### Infrastructure Layer

Owns runtime substrate: hosting, connectivity to external Marketplaces, secrets handling, operational delivery. It enables other layers; it does not define Revenue, Net Profit, or business vocabulary.

Presentation is part of the Application Layer’s outward face. It displays and composes; it is not a separate source of financial truth.

---

## 4. Information Flow

Conceptually, information moves through the platform as follows:

```text
Business Event
      ↓
Collection
      ↓
Verification
      ↓
Storage
      ↓
Interpretation
      ↓
Reporting
      ↓
Decision Support
```

### Business Event

Marketplace or seller-world occurrence: Order, Sale, Return, fee or adjustment recognition, stock movement, supply, purchase of goods, price intent, and similar events described in the Business Model lifecycle.

### Collection

Bringing external and seller-provided facts into the platform’s control for the scoped Marketplace Account — continuously and incrementally where appropriate — without yet claiming decision-grade completeness.

### Verification

Assessing whether recorded facts are complete and coherent enough for the intended question (Coverage, Sync Verification posture). Verification does not redefine Accounting Rules.

### Storage

Persisting facts and Historical Snapshots in the Data Layer so Live State refresh does not erase history.

### Interpretation

Applying Accounting Layer models and Application Layer domain logic to produce Commercial Performance, settlement framing, inventory readings, or simulations — always labeled by model and epistemic status.

### Reporting

Publishing scoped, reproducible views and management documents for a Reporting Period or operational scope — consistent across surfaces that claim the same model.

### Decision Support

Helping the seller-operator move from information to insight and action (Business Model decision framework), including recommendations and pricing simulation where appropriate — without transferring ownership of commercial risk.

Flows may loop (new events, corrections, re-verification) but must not skip Storage and Interpretation when claiming historical Commercial Performance.

---

## 5. Separation of Responsibilities

| Concern | Owning layer | Must not |
|---------|--------------|----------|
| Vocabulary and domain intent | Business Layer | Be redefined ad hoc in Application or Infrastructure |
| Money meaning and model boundaries | Accounting Layer | Be reimplemented as local presentation arithmetic |
| Workflows, modules, user journeys | Application Layer | Become a second ledger or silent rulebook |
| Durable facts, history, snapshots | Data Layer | Be bypassed by “calculate only in the screen” for authoritative reports |
| Runtime and external connectivity | Infrastructure Layer | Encode Commercial Performance meaning |
| Consequential trade-offs | ADR / Knowledge Base process | Remain only in informal memory |

### Ownership rules

1. Application capabilities may specialize views; they inherit Glossary terms and Accounting Rules.
2. When Application needs new money meaning, Accounting Layer (and Glossary) change first.
3. When Application needs new durable facts, Data Layer contracts change deliberately — not as a side effect of a screen.
4. Infrastructure may constrain feasibility; it does not overrule Business or Accounting meaning.
5. Modules share Data and Accounting foundations; they do not each own a private Commercial Performance dialect.

---

## 6. Source of Truth Strategy

Authority is layered and explicit (aligned with Business Model “Sources of Business Truth” and Glossary SoT terms).

1. **Meaning authority** — Glossary (terms), Accounting Rules (money), Business Model (domain), Project DNA (identity). Disputes about “what a word means” are resolved there.
2. **Fact authority** — Data Layer warehouse facts for the scoped Company and Marketplace Account. Authoritative reporting is database-first.
3. **Model authority** — Which financial model applies is an Accounting Layer decision, declared by the question being asked.
4. **Documentation metadata** — Source of Truth (Documentation) names which Knowledge Base document is authoritative for a statement; it is not a substitute for Single Source of Truth (Data).
5. **Non-authority** — Chat history, unlabeled exports, and presentation-only reconstructions do not override Production Knowledge Base meaning or warehouse facts.

When meaning and facts conflict with a screen, the screen is wrong until proven otherwise through verification and rule review.

---

## 7. Historical Data Strategy

Historical information is preserved so the Business Model’s historical analysis objective is achievable.

1. **Past is evidence** — Closed Reporting Periods and Inventory Snapshots remain readable without depending on the Marketplace’s present UI.
2. **Immutability in spirit** — Live State updates serve operations; they must not silently rewrite published historical interpretation (Accounting Rules: Historical Integrity).
3. **Deliberate correction** — Genuine fact corrections and dated rule changes are allowed; unnoticed drift is not.
4. **Snapshot discipline** — Historical Snapshot and Live State are distinct architectural times (Accounting Rules: Time Principles). Mixing them unlabeled is an architectural defect.
5. **Purpose** — History supports comparison, incident investigation, learning, and reproducible management reporting — not nostalgia.

The Historical Data Warehouse concept is the Data Layer expression of this strategy. Subsystem documents may detail mechanisms; they must preserve this intent.

---

## 8. Reporting Strategy

Reporting is a first-class architectural outcome, not a side export.

1. **Model-declared reporting** — Every report claims Commercial Performance, WB Settlement, operational inventory reading, simulation, or an explicitly mixed narrative with a bridge — never an unlabeled blend.
2. **Consistency** — Surfaces that claim the same model, scope, and rules must agree (Accounting Rules: Reporting Principles).
3. **Reproducibility** — Re-running the same report against unchanged facts and rules yields the same results.
4. **Explainability** — Reports expose enough context (period, account, model, epistemic status) for seller-operator trust.
5. **Export parity** — Offline deliverables that claim a model must match the on-platform reading for that model and scope within stated rounding policy.
6. **No presentation ledger** — Formatting, section order, and emphasis may vary; category meaning may not.

Reporting consumes Interpretation; it does not own a private Accounting Layer.

---

## 9. Extensibility

New capabilities should extend the architecture by attachment, not by fork.

1. **Start from the question** — Map to Business Model domain and Accounting model (or confirm non-financial).
2. **Reuse layers** — Prefer existing Data facts, Accounting categories, and Application module boundaries.
3. **Add contracts upward** — New durable facts → Data Layer; new money meaning → Accounting Layer + Glossary; new journeys → Application Layer.
4. **Preserve tenancy** — Extensions remain Company / Marketplace Account scoped unless a documented multi-account rule exists.
5. **Keep model walls** — New simulation or forecast capabilities must not overwrite historical Commercial Performance paths.
6. **Document before widening** — Consequential extensions update this blueprint and related Knowledge Base docs; ADRs capture trade-offs.
7. **Marketplace expansion** — Additional Marketplaces enter through the same layering and tenancy model, with explicit Business and Accounting extensions — not parallel products sharing a logo only.

Extensibility is measured by how little contradictory truth a change introduces.

---

## 10. Architectural Constraints

Intentional constraints (violations are defects):

1. **No direct business or accounting logic invented solely in presentation** — Presentation may format and navigate; it may not redefine Revenue, Net Profit, or Estimated Tax bases.
2. **No duplicated business interpretation** — Parallel dialects of Commercial Performance across modules are forbidden.
3. **No multiple sources of truth for the same claim** — One meaning authority, one fact authority, one declared model per claim.
4. **No silent unification of distinct financial models** — Especially historical Estimated Tax vs Smart Pricing.
5. **No architecture-by-exception** — Shortcuts that bypass Data or Accounting layers for “just this screen” are disallowed for authoritative numbers.
6. **No undocumented consequential decisions** — Material structural or meaning changes require Knowledge Base / ADR updates.
7. **No cross-tenant leakage** — Facts and secrets stay inside Company / Marketplace Account boundaries.
8. **No unlabeled time mixing** — Live State, Historical Snapshot, Business Event Date, and Settlement Date remain distinct unless a documented bridge says otherwise.
9. **No treating verification as optional for decision-grade historical claims** — Incomplete Coverage must be visible.
10. **No replacement of Knowledge Base meaning by implementation convenience** — Code follows settled architecture and accounting; it does not silently revise them.

---

## 11. Non-Goals

This architecture intentionally does not solve:

- Becoming the Marketplace’s operating platform or fulfillment network.
- Providing statutory accounting, certified audit opinions, or tax filing authority.
- Guaranteeing external Marketplace correctness beyond collection, storage, and verification of available facts.
- Optimizing for a single screen’s convenience at the expense of system-wide meaning.
- Prescribing specific vendors, frameworks, or hosting products (Infrastructure choices must serve these layers, not redefine them).
- Eliminating the need for seller judgment — Decision Support assists; it does not absorb commercial accountability.
- Collapsing all analytics into one universal metric model.
- Real-time absolute certainty when Verification and Coverage say otherwise.

---

## 12. Quality Attributes

Desired system qualities, conceptually:

| Attribute | Meaning for this architecture |
|-----------|-------------------------------|
| Reliability | Decision-grade readings fail safely: incomplete or unverified states are disclosed rather than silently wrong |
| Consistency | Same model + scope + rules + facts ⇒ same interpretation across surfaces |
| Maintainability | Layer ownership lets change land in one place without rewriting every capability |
| Scalability | Growth in accounts, history, and domains extends foundations rather than multiplying truths |
| Traceability | From report claim back to model, rules, and recorded facts — and to ADRs when trade-offs apply |
| Auditability | Important results can be reconstructed from warehouse facts and published Accounting Rules |
| Extensibility | New capabilities attach cleanly without violating constraints |
| Explainability | Architecture and reports make model and epistemic status visible to humans and automated assistants |

Quality is failing when the platform is rich in surfaces but poor in agreement.

---

## How to use this document

1. Read Project DNA, Business Model, Glossary, and Accounting Rules before proposing structural change.
2. Locate the owning layer for the change; update that layer’s contracts first.
3. Use subsystem architecture docs for specialized depth; if they conflict with this blueprint, this document wins until deliberately revised.
4. Record consequential deviations as ADRs.

This file is the canonical system architecture reference for the Knowledge Base.
