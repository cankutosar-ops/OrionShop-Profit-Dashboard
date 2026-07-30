# Development Governance

---

Status

Production

---

Owner

Product Owner

---

Audience

- Product Owner
- Developers
- AI Assistants

---

Module

—

---

Category

Governance

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Glossary](../01-business/GLOSSARY.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md)
- [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)
- [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)
- [Documentation Standard](../DOCUMENTATION_STANDARD.md)

---

Related Documents

- [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](../02-architecture/SYNC_ENGINE.md)
- [Domain Model](../02-architecture/DOMAIN_MODEL.md)
- [Data Model](../02-architecture/DATA_MODEL.md)
- [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)
- [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md)
- [Product Specifications Index](../03-product/README.md)
- [Decisions Index](../06-decisions/INDEX.md)
- [Documentation Lifecycle](../DOCUMENTATION_LIFECYCLE.md)
- [Cross Reference System](../CROSS_REFERENCE.md)
- [Quality Checklist](../QUALITY_CHECKLIST.md)
- [Project Roadmap](../00-project/PROJECT_ROADMAP.md)

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

2026-07-29

---

Review Frequency

On material change to decision hierarchy, review gates, or Knowledge Base authority rules

---

Source of Truth

This file (engineering and Knowledge Base governance). Project identity remains owned by [Project DNA](../00-project/PROJECT_DNA.md). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Money meaning remains owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md). Layer and capability ownership remain owned by Architecture documents. Module product behavior remains owned by Product Specifications.

---

Purpose

Define the canonical Development Governance for OrionShop: how the platform may evolve through documentation, architecture, accounting, product specification, implementation, review, and release — without allowing downstream layers to redefine upstream meaning.

---

Scope

Business and engineering governance only. Does not specify CI/CD pipelines, cloud providers, deployment topology, infrastructure tooling, or runtime operations procedures (those remain outside this document’s authority).

---

## 1. Purpose

### Why governance exists

This project is a decision-support system whose value depends on **stable meaning**. If Revenue, Net Profit, Order, Sale, Inventory Snapshot, or Estimated Tax shift silently between chat, code, and screens, trust collapses even when features ship quickly.

Governance exists so that:

1. **Business need drives change** — not convenience of a connector, UI layout, or framework.
2. **The Knowledge Base remains authoritative** — humans and AI assistants share one decision hierarchy.
3. **Accounting and terminology cannot be reinvented in code** — implementation follows settled rules.
4. **Architecture and product specs bound ownership** — modules do not absorb each other’s duties.
5. **Significant change is reviewable** — business, accounting, architecture, product, implementation, and verification each have a voice before release.
6. **History stays honest** — consequential semantic changes are documented, effective-dated, and not smuggled through presentation.

Governance is part of the product. A feature that changes meaning or ownership without updating governing documents is **incomplete**, even if the software appears to work ([Project DNA](../00-project/PROJECT_DNA.md); [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md); [Accounting Rules](../01-business/ACCOUNTING_RULES.md) change management).

### What this document is

The highest-level **engineering governance** document for how the platform is evolved. It does not replace Project DNA (identity), Accounting Rules (money meaning), Architecture (structure), or Product Specifications (module behavior). It **orders and enforces** how those authorities interact.

---

## 2. Decision Hierarchy

Mandatory order for consequential change. **Implementation may never redefine an upstream layer.**

```text
Business Need
      ↓
Glossary
      ↓
Accounting Rules
      ↓
Architecture
      ↓
Product Specification
      ↓
Implementation
      ↓
Testing
      ↓
Release
```

### Layer duties

| Layer | Authority | May not |
|-------|-----------|---------|
| **Business Need** | Clarify the seller question, outcome, and domain fit against [Project DNA](../00-project/PROJECT_DNA.md) and [Business Model](../01-business/BUSINESS_MODEL.md) | Jump straight to screens or schemas |
| **Glossary** | Name and bound vocabulary; resolve aliases; forbid duplicate meanings | Invent money interpretation that belongs in Accounting Rules |
| **Accounting Rules** | Own money meaning, financial model walls, estimation epistemology, historical integrity for financial claims | Be overridden by Product Specs, UI, or code |
| **Architecture** | Own layer map, domain structure, data categories, sync/reporting/integration/operational contracts | Redefine Glossary terms or Accounting bases |
| **Product Specification** | Own module business behavior, questions, KPIs intent, workflows, handoffs | Redefine Accounting or invent parallel architecture ownership |
| **Implementation** | Realize settled meaning and contracts in software | Introduce local dialects, silent model blends, or undocumented ownership moves |
| **Testing** | Prove behavior matches settled docs for the declared scope and model | Treat green tests as license to skip documentation |
| **Release** | Publish only when governing docs and gates for the change class are satisfied | Ship semantic change as “just a UI tweak” |

### Hierarchy rules

1. **Upstream wins.** If code and Knowledge Base disagree, the Knowledge Base (correct layer) is corrected first — or the code is wrong.
2. **Skip nothing material.** A change that affects vocabulary, money, ownership, or module boundaries must touch every upstream layer it impacts before implementation.
3. **Additive preferred.** Prefer clarification and extension over silent redefinition ([Accounting Rules](../01-business/ACCOUNTING_RULES.md); [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)).
4. **Different questions may keep different models.** Unifying Commercial Performance, WB Settlement, Smart Pricing, or operational Product Analytics for “simplicity” is forbidden when that falsifies meaning ([Project DNA](../00-project/PROJECT_DNA.md)).
5. **ADRs record consequential trade-offs.** Informal chat is not authority ([Accounting Rules](../01-business/ACCOUNTING_RULES.md); [Decisions Index](../06-decisions/INDEX.md)).

### Mapping to Knowledge Base folders

| Hierarchy step | Primary documents |
|----------------|-------------------|
| Business Need | Project DNA, Business Model, Roadmap intent |
| Glossary | `docs/01-business/GLOSSARY.md` |
| Accounting Rules | `docs/01-business/ACCOUNTING_RULES.md` |
| Architecture | `docs/02-architecture/*` (System through Operational) |
| Product Specification | `docs/03-product/*` |
| Implementation / Testing / Release | Downstream engineering work governed by this document — not specified here as tooling |

---

## 3. Change Management

### 3.1 How business changes are introduced

1. State the **business need** as a seller question or decision outcome.
2. Confirm fit with Project DNA and Business Model domains (or explicitly extend Business Model).
3. Identify affected Glossary terms, Accounting models, Architecture ownership, and Product Specs.
4. Classify the change:
   - **Presentation-only** — no meaning/ownership change (still must not invent labels that conflict with Glossary).
   - **Capability extension** — new behavior inside existing ownership.
   - **Semantic / ownership change** — vocabulary, money, model walls, or module boundaries.
5. Semantic / ownership changes follow the full Decision Hierarchy before implementation.
6. Update Roadmap/intent records when scope of the product direction shifts.

### 3.2 How architectural changes are approved

1. Propose the ownership or contract change against [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md) and the affected subsystem docs (Warehouse, Sync, Application, Domain, Data, Reporting, Integration, Operational).
2. Prove **no upstream contradiction** with Glossary and Accounting Rules.
3. Update Architecture documents until ownership is unambiguous (single owner; no duplicate responsibility).
4. Update affected Product Specifications so module handoffs match Architecture.
5. Record an **ADR** for consequential architectural trade-offs.
6. Only then implement against settled contracts ([Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md): architecture drives implementation).

### 3.3 How terminology evolves

1. New or changed business words are defined in the **Glossary** first.
2. Aliases and “Not To Be Confused With” boundaries are updated when collisions appear (Order vs Sale, Buyout vs Purchases, Warehouse Sales vs Warehouse Distribution, Live State vs Inventory Snapshot, etc.).
3. Domain Model **uses** Glossary terms; it does not fork definitions.
4. Product Specs and Architecture cite Glossary terms; they do not redefine them.
5. External/vendor labels map **inward** to Glossary names; they never rename business language ([Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md)).
6. Deprecated terms remain discoverable (alias → canonical) until safely retired.

### 3.4 How accounting changes are validated

Follow [Accounting Rules — Change Management](../01-business/ACCOUNTING_RULES.md) as mandatory:

1. Change only when business reality, marketplace structure, documented defect, or scoped expansion requires it — not for cosmetic UI convenience.
2. Prefer additive clarification over silent redefinition.
3. Breaking changes to Revenue, Net Profit, or Estimated Tax historical meaning require explicit treatment as breaking accounting changes.
4. Provide **effective dating** for which Reporting Periods use old vs new rules.
5. Default: **no silent restatement** of published periods; restatement requires explicit decision.
6. Before financial behavior changes:
   - Update Accounting Rules
   - Update Glossary if terms/boundaries change
   - Record ADR for consequential model or base changes (especially Estimated Tax bases)
   - Update KPI Catalog / Business Model / Product Specs when affected
   - State historical integrity impact
   - Only then implement mathematics and presentation
7. Preserve **dual Estimated Tax bases** (historical reporting vs Smart Pricing) unless an intentional, documented framework change says otherwise — never “normalize” them casually.
8. After change: **re-qualify trust** for affected scopes before claiming continuity of historical reports ([Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)).

---

## 4. Documentation Rules

### 4.1 Documentation before implementation

Consequential meaning, ownership, model, or module-boundary changes update the canonical Knowledge Base **before** mathematics, interfaces, and presentation move ([Project DNA](../00-project/PROJECT_DNA.md): business before implementation; accounting before mathematics; mathematics before code).

Presentation-only work may proceed without Architecture rewrites only when it does not alter labels’ meaning, model walls, or ownership.

### 4.2 Canonical documents are authoritative

| Concern | Canonical authority |
|---------|---------------------|
| Project identity / principles | Project DNA |
| Vocabulary | Glossary |
| Business domains / users | Business Model |
| Money meaning / model walls | Accounting Rules |
| System layers / contracts | Architecture suite |
| Module business behavior | Product Specifications |
| Consequential trade-offs | ADRs (Decisions) |
| How evolution is governed | **This document** |

When two documents appear to conflict, resolve by **layer**: upstream meaning wins; fix the downstream document (or escalate a true upstream defect).

### 4.3 No duplicate definitions

1. Do not redefine Glossary terms in Architecture, Product Specs, modules, widgets, or code comments as competing authorities.
2. Do not create a second Accounting dialect in Product Specs or Reporting compositions.
3. Do not duplicate Architecture ownership statements in conflicting ways across subsystem docs.
4. Explain by **reference**, not by copy-paste mutation.

### 4.4 Single Source of Truth

Two complementary SoT ideas must not be confused:

1. **Source of Truth (Documentation)** — which Knowledge Base document is authoritative for a statement (document metadata / this governance).
2. **Single Source of Truth (Data)** — authoritative reporting reads durable warehouse facts, not transient presentation reconstruction when durable facts exist ([Project DNA](../00-project/PROJECT_DNA.md); Glossary).

Governance enforces documentation SoT. Architecture and Accounting enforce data SoT for reporting claims. Neither excuses the other.

### 4.5 Knowledge Base hygiene

1. Production documents carry Status, Version, Dependencies, Source of Truth, and review expectations.
2. Draft skeletons are not authority for shipping semantic behavior.
3. Indexes (`README` files) reflect reality after each completed Production document.
4. Cross-references remain navigational; **Dependencies** must not form circular authority (Related links may be bidirectional for navigation).

---

## 5. Review Process

Every **significant** feature (new capability, semantic change, ownership move, new money label, new sync/history behavior, or new product module behavior) must pass the following reviews before release.

### 5.1 Business Review

- Is the seller question real and in-scope for Project DNA / Business Model?
- Does it improve decision support rather than vanity analytics?
- Are tenancy and Account Lifecycle implications clear?

### 5.2 Accounting Review

- Which financial model applies (Commercial Performance, WB Settlement, Smart Pricing, operational Product Analytics, or non-P&L)?
- Are Glossary money terms used exactly?
- Are Estimated Tax bases correct for the question?
- Is historical integrity preserved (effective dating / no silent restatement)?

### 5.3 Architecture Review

- Which layer and capability own the change?
- Any ownership duplication or circular dependency?
- Sync / Warehouse / Reporting / Integration / Operational contracts still hold?
- Implementation independence of Architecture docs preserved (no schema-as-meaning)?

### 5.4 Product Review

- Does the relevant Product Specification describe the behavior?
- Are handoffs to neighboring modules explicit?
- Are KPIs intent-aligned without formula invention that contradicts Accounting Rules?

### 5.5 Implementation Review

- Does implementation follow settled docs (not the reverse)?
- No local dialects, silent model blends, or private ledgers?
- Secrets/tenancy boundaries respected at product intent level?

### 5.6 Verification

- Can claims be checked (sync/trust qualification, reproducibility, export parity where claimed)?
- Affected scopes re-qualified after semantic or intake changes?
- Tests and acceptance evidence map to documented behavior (without making test tooling part of this governance doc)?

**Gate rule:** failing any required review blocks release for significant change. Minor presentation-only changes may use a lighter path but still must not violate Glossary/Accounting labels.

---

## 6. Quality Gates

Mandatory gates before work that changes product behavior is accepted as complete.

### Gate A — Terminology consistency

- All user-facing and Knowledge Base terms match Glossary (or documented aliases).
- No collisions (Order/Sale/Buyout/Purchases; Snapshot types; Warehouse Sales vs Distribution; etc.).

### Gate B — Accounting consistency

- Declared financial model matches the business question.
- Cost/revenue categories follow Accounting Rules.
- Dual Estimated Tax bases not collapsed.
- Observed / estimated / simulated labeling honest.

### Gate C — Architecture consistency

- Ownership matches Application / Domain / Data / Reporting / Sync / Operational contracts.
- No capability absorbs another’s authoritative duty.
- No upstream contradiction.

### Gate D — Product consistency

- Behavior matches the module’s Product Specification (or the Spec is updated first).
- Neighbor handoffs respected (Financial Analysis, Product Analytics, Inventory, Warehouse, Pricing, Cost, Purchasing, Reporting, Monitoring, Administration).

### Gate E — Documentation completeness

- Canonical docs for affected layers updated and versioned appropriately.
- ADR recorded when consequential.
- Indexes updated.

### Gate F — No implementation leakage into Knowledge Base

- Production Foundation, Architecture, Product, and Governance docs remain free of table names, SQL, API routes, framework choices, and repository structure as meaning.
- Implementation details belong downstream (modules/dev docs), never as substitutes for business authority.

### Gate G — Historical and trust honesty

- Live State not used as unlabeled history.
- Incomplete Coverage / verification posture not hidden to force a green release narrative.
- Export parity claimed only when composition rules allow.

Work is **not acceptably complete** while only code or UI has moved for a semantic/ownership change.

---

## 7. Versioning

### 7.1 Production document versioning

Production Knowledge Base documents use semantic versioning:

| Change class | Version impact | Examples |
|--------------|----------------|----------|
| **Major** | Breaking meaning or ownership | Revenue redefined; Estimated Tax base change; module ownership transfer; Decision Hierarchy change |
| **Minor** | Additive compatible capability | New KPI intent section; new handoff; new perspective; clarified boundary without redefinition |
| **Patch** | Clarification, typo, cross-link, non-semantic wording | Broken link fix; wording clarity with same meaning |

### 7.2 Status

- **Draft** — not authority for shipping semantic behavior.
- **Production** — authoritative for its Source of Truth scope.
- **Deprecated** — superseded; retained for navigation until migration completes.

### 7.3 Deprecation

1. Mark deprecated document/section with replacement pointer.
2. Keep aliases in Glossary until references are cleared.
3. Do not delete Production history casually; prefer supersession with effective dating for accounting meaning.

### 7.4 Migration

When a Major semantic change ships:

1. Document old vs new rule and **effective date / period policy**.
2. State whether historical periods restate or remain under prior rules (default: no silent restatement).
3. Update Architecture/Product Specs and ADR.
4. Re-verify affected scopes before claiming continuity.
5. Communicate impact in project changelog / release notes at the product level (not infrastructure runbooks).

### 7.5 Suite coherence

Indexes (for example Product Specifications README) record suite progress. A single document’s version does not excuse leaving dependent Production docs contradictory — update the dependent set in the same change program when required.

---

## 8. Scope Boundaries

### Intentionally included

- Decision hierarchy across business, glossary, accounting, architecture, product, implementation, testing, release
- Change management for business, architecture, terminology, and accounting
- Documentation authority rules and SoT discipline
- Review process and quality gates for significant features
- Versioning, deprecation, and semantic migration expectations
- Governance relationship to the entire Production Knowledge Base

### Intentionally excluded

- CI/CD pipeline configuration
- Infrastructure and cloud provider choices
- Deployment topology and environments
- Runtime operations runbooks and on-call procedures
- Framework, language, and repository structure mandates
- SQL, schemas, API contracts, and service topology as governance content
- UI component specifications

Operational **business** integrity (trust, verification-before-publication, documentation-before-development) remains in [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md). This governance document orders engineering evolution against the Knowledge Base; it does not become a DevOps manual.

---

## How to use this document

1. Before starting significant work, locate the change on the Decision Hierarchy and identify upstream docs to update.
2. Refuse implementation that redefines Glossary, Accounting, Architecture, or Product Specs by stealth.
3. Run the Review Process and Quality Gates appropriate to the change class.
4. Version and index canonical documents as part of done.
5. When unsure whether a change is semantic, treat it as semantic until Business + Accounting + Architecture agree it is presentation-only.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Category | Governance |
| Canonical role | Highest-level engineering governance for Knowledge Base evolution |
| Last Updated | 2026-07-29 |
