# Knowledge Ownership Model

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

- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)
- [Orion Architecture](./ORION_ARCHITECTURE.md)

---

## Principle

**Business Rules always own calculations.**  
**Implementation never owns business logic.**

Orion attributes every source to an **owner**. Owners maintain truth; Orion only retrieves.

---

## Owner Map

| Domain | Owner | Owns (knowledge) | Does not own |
|---|---|---|---|
| Financial calculations, KPI meaning, tax bases | **Financial Engine** | Net Profit, Revenue, Estimated Tax models, fee semantics | Warehouse sync runtime |
| Warehouse, inventory history, locations, backfill, snapshots | **Warehouse Platform** | Historical warehouse rules, FBS-as-location, continuity | Financial formulas |
| Reports definitions & reporting architecture | **Reporting** | Report contracts, export semantics | Engine math inventing |
| Smart Pricing simulator meaning | **Smart Pricing** | Simulator tax-base difference vs reporting | Historical reporting tax |
| Dashboard presentation of commercial KPIs | **Dashboard** | Widget meaning as projection of engine | Changing engine formulas |
| Users, roles, settings, audit surfaces | **Administration** | Admin governance & platform settings meaning | Marketplace credential crypto design beyond published security docs |
| Auth / AuthZ / RLS / Secrets | **Security / Platform Architecture** | Security architecture docs | Business KPI definitions |
| Cross-cutting system shape | **Platform Architecture** | Layering, boundaries, Orion itself | Module-specific business rules |
| Product intent / glossary / roadmap | **Product Owner** | Glossary, DNA, product decisions | Day-to-day implementation |

---

## Ownership vs Authority

| Concept | Meaning |
|---|---|
| **Owner** | Who maintains the source and accepts changes |
| **Authority** | Which tier/source wins in conflict (see hierarchy) |

Example: Financial Engine **owns** Net Profit knowledge. A Dashboard widget doc may **describe** Net Profit but cannot redefine it. Code under `profit-engine-model-b.ts` **implements** it but does not **own** the business meaning.

---

## Change Control

| Change type | Required |
|---|---|
| Business calculation meaning | Owner = Financial Engine + Product Owner; update Tier 1 docs; ADR if structural |
| Warehouse location / FBS semantics | Owner = Warehouse Platform; architecture update |
| Orion registry / retrieval rules | Owner = Platform Architecture; ADR |
| Implementation-only refactor | Owner = module; Tier 3 only; must not silently change Tier 1 |

---

## Orion’s Own Ownership

| Artifact | Owner |
|---|---|
| Orion architecture & registry schema | Platform Architecture |
| Seed catalog accuracy | Platform Architecture + respective domain owners |
| Future chat UX | Product Owner + Platform Architecture |

Orion does **not** own Financial Engine or Warehouse truth — it **references** them.
