# Knowledge Hierarchy

---

Status

Draft

---

Owner

Platform Architecture

---

Module

Orion

---

Category

Architecture

---

Dependencies

- [Orion Architecture](./ORION_ARCHITECTURE.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)

---

## Principle

**Source code must never override Business Rules.**  
**Architecture documents always win over implementation.**

---

## Tier Model

### Tier 1 — Highest (Normative)

Authoritative meaning of the platform.

| Kind | Examples (paths) | Owns |
|---|---|---|
| Business Rules | `docs/01-business/*` | Calculations, KPI definitions, glossary |
| Architecture Decisions | `docs/06-decisions/*`, ADRs | Structural / boundary decisions |
| Financial Engine Rules | `docs/03-modules/FINANCIAL_ENGINE.md`, estimated-tax dual-model rules | Profit / tax / revenue semantics |
| Warehouse Rules | `docs/02-architecture/HISTORICAL_DATA_WAREHOUSE*.md`, warehouse product specs | Warehouse meaning, locations, continuity |
| Administration Rules | Admin specs + governance docs | Platform governance meaning |
| Sprint / Product Decisions | Signed sprint docs, product specs under `docs/03-product/*` | Accepted product intent |

Tier 1 answers yield **Verified** when a single clear rule exists.

---

### Tier 2 — Supporting (Descriptive / Contractual)

Explains and constrains the system; does not invent business math.

| Kind | Examples | Role |
|---|---|---|
| Documentation | Module READMEs, onboarding, architecture overviews | Narrative explanation |
| Database Schema | `docs/02-architecture/DATABASE.md`, migrations (read-only) | Persistence facts |
| API Contracts | `docs/05-api/*` | Interface contracts |
| Verification Reports | `scripts/verify-*.mjs` outcomes, sprint PASS reports | Evidence of correctness |

Tier 2 may produce **Derived** when combined with Tier 1, or **Implementation**-adjacent facts (e.g. table names) when schema is the only source.

---

### Tier 3 — Lowest (Implementation)

How the system is built today. Never normative for business meaning.

| Kind | Examples | Role |
|---|---|---|
| Source Code | `src/lib/*`, `src/services/*` | Implementation detail |
| Types | `src/types/*` | Shape of data in code |
| Services / Repositories | Service & data-access modules | Runtime wiring |

Use Tier 3 only when:

- Question is explicitly about implementation, **or**
- Higher tiers are silent and the answer is labeled **Implementation**, **or**
- Illustrating *where* a Verified rule is applied (still cite Tier 1 as authority)

---

## Precedence Diagram

```
Tier 1 Business Rules
        ↓ overrides
Tier 1 Architecture / Engine / Warehouse / Admin / Product Decisions
        ↓ overrides
Tier 2 Documentation / Schema / API / Verification
        ↓ overrides
Tier 3 Source Code / Types / Services
```

---

## Mapping to Question Classes

| Question class | Primary tier |
|---|---|
| “What is Net Profit?” / “How is Revenue calculated?” | Tier 1 Business + Financial Engine |
| “Why is FBS a Warehouse Location?” | Tier 1 Warehouse + Architecture ADR/decision |
| “Which table stores Finance?” | Tier 2 Schema (cite DATABASE / migrations) |
| “Where in code is X computed?” | Tier 3 (label Implementation; cite Tier 1 for meaning) |
| “Does verify script confirm Y?” | Tier 2 Verification |

---

## Extensibility

New source *kinds* attach to an existing tier (or a new Tier 2/3 subtype) via the [Knowledge Registry](./KNOWLEDGE_REGISTRY.md) without changing precedence rules.
