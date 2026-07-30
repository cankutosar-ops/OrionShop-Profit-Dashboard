# Project DNA

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

Project

---

Dependencies

- [Start Here](../09-onboarding/START_HERE.md)
- [Documentation Standard](../DOCUMENTATION_STANDARD.md)

---

Related Documents

- [Project Roadmap](./PROJECT_ROADMAP.md)
- [Business](../01-business/README.md)
- [Architecture](../02-architecture/README.md)
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

On major product or architecture direction change

---

Source of Truth

This file

---

Purpose

Define the lasting identity, philosophy, boundaries, and direction of the Wildberries Profit Dashboard so every human and AI participant shares one stable frame of reference before making decisions.

---

Scope

Project identity and principles only. Does not specify features, formulas, interfaces, or code.

---

## 1. Project Identity

### What this project is

This project is an operational decision-support system for Wildberries sellers. It turns marketplace activity into a coherent picture of commercial performance, cost structure, inventory position, and profitability so sellers can act with confidence.

It is a product with a durable Knowledge Base, a shared accounting language, and a disciplined way of turning marketplace data into trustworthy numbers and explanations.

### What this project is NOT

- Not a generic BI toy or chart gallery.
- Not a marketplace replacement, seller cabinet clone, or advertising network.
- Not a one-off spreadsheet automation wrapped in a UI.
- Not an experimental sandbox where rules change without recorded intent.
- Not a dump of raw API responses presented as insight.

### Why it exists

Wildberries sellers operate under fee structures, logistics realities, advertising spend, returns, inventory movement, and tax exposure that interact. Fragmented exports and ad-hoc spreadsheets make it easy to misread profit, mis-time replenishment, and disagree about “what the numbers mean.”

This project exists to replace that ambiguity with a single, explainable view of the business.

### The business problem it solves

Sellers need answers that hold up under scrutiny:

- What did we actually earn after marketplace and operating costs?
- Where does money leak — commission, logistics, storage, ads, returns, tax estimates?
- Which products, categories, and periods drive or destroy profit?
- What is the inventory position, and how should stock decisions relate to sell-through?
- Can the same question be answered the same way tomorrow?

The project solves the gap between marketplace raw data and seller-grade business judgment.

---

## 2. Vision

The long-term vision is a trusted commercial operating system for marketplace sellers — starting with Wildberries — where:

- Historical performance is preserved and explainable.
- Current operations are visible without rewriting the past.
- Decisions (pricing, inventory, assortment, spend) are supported by consistent rules.
- New capabilities extend the same accounting and data foundations rather than inventing parallel truths.

The product should become the place sellers and operators go when they need a number they can defend, a trend they can trust, and a rationale they can share.

---

## 3. Mission

Help Wildberries sellers make better business decisions by providing accurate, explainable, and consistent views of profitability, costs, commercial performance, and inventory — grounded in durable business meaning, not ephemeral screens.

---

## 4. Core Principles

1. **Database is the single source of truth for reporting.** Operational numbers shown to users must reconcile to persisted, queryable facts — not to transient client-side reconstruction when the warehouse already holds the answer.

2. **Business before implementation.** Meaning, ownership of metrics, and intended questions come before screens, schemas, and code structure.

3. **Accounting before mathematics.** Definitions of revenue, cost, profit, and related concepts must be settled as business rules before formulas are refined.

4. **Mathematics before code.** Calculation intent must be clear and reviewable before it is encoded; code implements settled math, it does not invent it silently.

5. **Reproducible calculations.** The same inputs and the same rules must produce the same results across time, surfaces, and exporters.

6. **Traceable decisions.** Significant product and technical choices are recorded so later work can respect intent instead of rediscovering it.

7. **Historical data is immutable in spirit.** Past periods are not casually rewritten to fit today’s convenience. Corrections are deliberate, auditable, and distinguished from live operational refresh.

8. **Different questions may require different models.** When two modules answer different business questions, their rules may differ deliberately. Unifying them for “simplicity” is forbidden when that would falsify meaning.

9. **AI-readable documentation.** The Knowledge Base is written so humans and automated assistants can navigate identity, rules, and architecture without tribal memory.

10. **Modular architecture and separation of responsibilities.** Modules own clear boundaries. Shared foundations (data, sync, accounting meaning) are not copied into every feature.

11. **Verification over assumption.** Claims about data completeness, sync health, and metric correctness should be checkable — not merely asserted.

12. **Multi-tenant commercial reality.** Companies and marketplace accounts are first-class boundaries. Seller data stays scoped; secrets stay protected.

---

## 5. Product Philosophy

### Decision support over vanity analytics

The product exists to improve decisions — pricing, inventory, assortment, spend, and operational priorities. Charts and tables are means, not ends.

### Accuracy over visual complexity

A correct plain number beats an impressive but ambiguous visualization. Visual design serves clarity; it must not obscure definitions or invent precision the data does not have.

### Explainability

Users and builders should be able to answer: what does this number mean, what does it include, what does it exclude, and which rule produced it?

### Consistency

The same concept must not mean different things on different screens without an explicit, documented reason. Naming and semantics stay aligned across modules, reports, and exports.

### Auditability

Important results should be reconstructible from stored facts and published rules. Silent overrides and unexplained exceptions erode trust.

### Long-term maintainability

Features are accepted only when they fit the product’s language and foundations. Short-term convenience that creates a second competing truth is rejected.

---

## 6. Architecture Philosophy

Architecture serves durable reporting and decision support, not feature fashion.

### Historical warehouse

The system treats historical commercial and inventory reality as something to preserve. The warehouse exists so the past remains available for comparison, investigation, and learning — independent of whatever the marketplace UI shows today.

### Incremental synchronization

Marketplace data arrives continuously. Synchronization is designed to bring the warehouse forward safely and repeatedly, preferring controlled increments and reconciliation over brittle full rewrites as the default mindset.

### Modular design

Capabilities (dashboarding, financial reporting, inventory, pricing support, settings, and related areas) evolve as modules with clear ownership. Modules share foundations; they do not each reinvent persistence or accounting meaning.

### Layer separation

Business meaning, system structure, product modules, presentation units, and external integrations are documented and designed as distinct layers. Crossing layers is allowed through deliberate contracts, not accidental coupling.

### Database-first reporting

Authoritative reporting reads from the warehouse. Presentation layers compose and display; they do not become a second unofficial ledger.

Conceptual architecture only — detailed design belongs elsewhere in the Knowledge Base.

---

## 7. Development Philosophy

New work follows a structured path from understanding to delivery:

1. **Understand the business question** — what decision or truth is required?
2. **Locate existing meaning** — glossary, accounting rules, KPIs, prior decisions.
3. **Respect architecture** — extend foundations; do not bypass them.
4. **Design the change** — boundaries, data needs, failure modes, verification.
5. **Implement** — only after meaning and structure are clear.
6. **Verify** — confirm results against agreed definitions and warehouse facts.
7. **Document** — preserve intent, rules, and decisions in the Knowledge Base.

Ad-hoc feature work that skips meaning and verification is out of process, even if the UI looks finished.

---

## 8. Documentation Philosophy

Documentation in this project is a **Knowledge Base**, not a pile of forgotten READMEs.

It exists to preserve:

- **Identity** — what the project is and is not.
- **Business meaning** — definitions sellers and engineers share.
- **Architectural intent** — how the system is meant to hold together.
- **Decisions** — why one path was chosen over another.
- **Operational expectations** — how quality and change are judged.

The Knowledge Base is the single documentation system of record. Chat history, tickets, and informal notes may inform work; they do not supersede Production Knowledge Base documents.

Documentation is written for engineers, architects, product owners, and automated assistants equally. Ambiguity that only “the original author” understands is a defect.

---

## 9. AI Collaboration Philosophy

Automated assistants are participants in the same engineering discipline as humans.

They must:

- **Understand before coding** — read identity, business meaning, architecture, and relevant decisions first.
- **Respect business rules** — never “simplify” accounting or metric definitions in ways that change meaning.
- **Maintain consistency** — reuse established language, modules, and patterns; avoid parallel truths.
- **Preserve architectural decisions** — treat accepted decisions as constraints, not suggestions.
- **Prefer the Knowledge Base** — when documentation and informal memory conflict, documentation wins until deliberately updated.
- **Declare gaps** — if required meaning is missing, say so; do not invent product truth to fill silence.

AI assistance accelerates work that already has clear intent. It does not authorize silent redesign of the product’s foundations.

---

## 10. Quality Philosophy

Quality is judged by outcomes that survive time and scrutiny:

| Expectation | Meaning |
|-------------|---------|
| Correctness | Numbers and behaviors match agreed business rules |
| Reproducibility | Same rules and inputs yield the same results |
| Maintainability | Future contributors can change one concern without breaking others |
| Scalability of understanding | The Knowledge Base and modular design still work as the product grows |
| Transparency | Definitions, exclusions, and known limits are visible |
| Verification | Important claims can be checked against warehouse facts and published rules |

A feature that cannot be explained, reproduced, or verified is incomplete — regardless of visual polish.

---

## 11. Scope

### Included

- Wildberries-focused profitability and commercial performance decision support.
- Cost and fee visibility needed to understand net outcomes.
- Inventory position and history as they support operational decisions.
- Seller-oriented reporting and exports grounded in the warehouse.
- Multi-company / multi-account commercial scoping as a product boundary.
- A durable Knowledge Base for meaning, architecture, modules, and decisions.
- Forward-looking decision aids (for example pricing support) when they use explicitly defined models that may differ from historical reporting by design.

### Not Included

- Replacing the marketplace seller cabinet or marketplace logistics operations.
- Guaranteeing marketplace-side correctness beyond what is available and verified.
- Acting as a legal or tax filing system (estimates and operational views are not a substitute for professional tax advice or statutory accounting).
- Unbounded multi-marketplace productization without deliberate expansion of scope and foundations.
- Feature work that creates a second conflicting source of truth for the same business question.

### Future Direction

- Deeper decision support on top of the same accounting and warehouse foundations.
- Stronger historical completeness and operational confidence over longer horizons.
- Clearer separation between “what happened” reporting and “what if” simulation — without collapsing distinct models.
- Controlled expansion to additional marketplaces only when company/account foundations and meaning remain coherent.
- Continuous hardening of verification, explainability, and Knowledge Base coverage.

---

## 12. Success Criteria

Success is not measured by feature count. The project succeeds when:

1. **Trust** — sellers and operators rely on the numbers for real decisions.
2. **Correctness** — results match published business meaning under verification.
3. **Maintainability** — the system can evolve without accumulating contradictory definitions.
4. **Extensibility** — new modules and decision aids attach to shared foundations cleanly.
5. **Business value** — the product shortens the path from marketplace noise to actionable commercial judgment.

If those criteria hold, the project is healthy even when the UI is quiet. If they fail, no amount of surface activity compensates.

---

## How to use this document

1. Read this file before proposing or implementing material change.
2. Proceed to Business, Architecture, Modules, and Decisions in the Knowledge Base as needed.
3. When a new principle is required, update this document deliberately — do not contradict it silently in code or chat.

This document is the canonical entry point for project identity within the Knowledge Base.
