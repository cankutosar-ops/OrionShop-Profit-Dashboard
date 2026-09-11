# Knowledge Registry

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

- [Knowledge Hierarchy](./KNOWLEDGE_HIERARCHY.md)
- [Ownership Model](./OWNERSHIP.md)

---

## Purpose

The **Knowledge Registry** is the central catalog of every knowledge source Orion may use.

Phase 1 defines the **schema** and a **seed catalog** (architecture only).  
No runtime registry service is implemented in Sprint 12.0.

---

## Registry Entry Schema

Every source entry **must** include:

| Field | Type | Description |
|---|---|---|
| `id` | string (stable slug) | Unique identifier, e.g. `biz.accounting-rules` |
| `title` | string | Human-readable name |
| `category` | enum | See categories below |
| `owner` | string | Knowledge owner module / role (see OWNERSHIP.md) |
| `version` | string | Document/version stamp or `unversioned` |
| `status` | enum | `draft` \| `active` \| `deprecated` \| `legacy` |
| `priority` | enum | `tier1` \| `tier2` \| `tier3` |
| `verification_level` | enum | `canonical` \| `reviewed` \| `observational` \| `raw` |

### Recommended optional fields (future-compatible)

| Field | Description |
|---|---|
| `path` | Repo-relative path or URI |
| `locale` | BCP-47 language tag (default `en`) |
| `tags` | Search facets: `net-profit`, `fbs`, `warehouse`, … |
| `supersedes` | Prior `id` if replaced |
| `related_adrs` | ADR ids |
| `media_type` | `markdown` \| `schema` \| `api` \| `code` \| `video` \| `faq` \| … |
| `retrieval_weight` | Fine-grained weight within tier (default 100) |

---

## Categories

| category | Maps primarily to |
|---|---|
| `business_rule` | Tier 1 business |
| `architecture_decision` | Tier 1 ADRs / architecture |
| `financial_engine_rule` | Tier 1 FE |
| `warehouse_rule` | Tier 1 warehouse |
| `administration_rule` | Tier 1 admin |
| `sprint_decision` | Tier 1 sprint/product decisions |
| `product_decision` | Tier 1 product specs |
| `documentation` | Tier 2 docs |
| `database_schema` | Tier 2 schema |
| `api_contract` | Tier 2 API |
| `verification_report` | Tier 2 verifiers / reports |
| `source_code` | Tier 3 code |
| `type_definition` | Tier 3 types |
| `service_implementation` | Tier 3 services |
| `repository_implementation` | Tier 3 repositories |
| `user_documentation` | Future Tier 2 |
| `release_notes` | Future Tier 2 |
| `faq` | Future Tier 2 |
| `video_tutorial` | Future Tier 2 |

New categories may be added without changing tier precedence.

---

## Verification Levels

| Level | Meaning |
|---|---|
| `canonical` | Normative; conflicts resolve in its favor within tier |
| `reviewed` | Accepted documentation; may derive answers with other sources |
| `observational` | Verification output / audit evidence |
| `raw` | Unreviewed implementation; Implementation confidence only |

---

## Seed Catalog (Architecture Snapshot)

Illustrative registry — not an exhaustive inventory. Paths are relative to repo root.

### Tier 1

| id | title | category | owner | status | priority | verification_level |
|---|---|---|---|---|---|---|
| `biz.accounting-rules` | Accounting Rules | `business_rule` | Financial Engine | active | tier1 | canonical |
| `biz.kpi-catalog` | KPI Catalog | `business_rule` | Financial Engine | active | tier1 | canonical |
| `biz.glossary` | Glossary | `business_rule` | Product Owner | active | tier1 | canonical |
| `biz.business-model` | Business Model | `business_rule` | Product Owner | active | tier1 | reviewed |
| `arch.system` | System Architecture | `architecture_decision` | Platform Architecture | active | tier1 | reviewed |
| `arch.application` | Application Architecture | `architecture_decision` | Platform Architecture | active | tier1 | reviewed |
| `fe.financial-engine` | Financial Engine Module | `financial_engine_rule` | Financial Engine | active | tier1 | canonical |
| `fe.estimated-tax-dual` | Estimated Tax Dual Models | `financial_engine_rule` | Financial Engine | active | tier1 | canonical |
| `wh.historical-warehouse` | Historical Data Warehouse | `warehouse_rule` | Warehouse Platform | active | tier1 | canonical |
| `wh.warehouse-analytics-spec` | Warehouse Analytics Spec | `warehouse_rule` | Warehouse Platform | active | tier1 | reviewed |
| `admin.administration-spec` | Administration Specification | `administration_rule` | Administration | active | tier1 | reviewed |
| `gov.development-governance` | Development Governance | `administration_rule` | Platform Architecture | active | tier1 | reviewed |
| `product.dashboard-dna` | Project DNA | `product_decision` | Product Owner | active | tier1 | reviewed |

### Tier 2

| id | title | category | owner | status | priority | verification_level |
|---|---|---|---|---|---|---|
| `docs.database` | Database Architecture | `database_schema` | Platform Architecture | active | tier2 | reviewed |
| `docs.data-model` | Data Model | `database_schema` | Platform Architecture | active | tier2 | reviewed |
| `api.internal` | Internal API | `api_contract` | Platform Architecture | active | tier2 | reviewed |
| `api.wb-finance` | Wildberries Finance API | `api_contract` | Warehouse Platform | active | tier2 | reviewed |
| `mod.dashboard` | Dashboard Module Doc | `documentation` | Dashboard | active | tier2 | reviewed |
| `mod.inventory-history` | Inventory History Module | `documentation` | Warehouse Platform | active | tier2 | reviewed |
| `mod.smart-pricing` | Smart Pricing Module | `documentation` | Smart Pricing | active | tier2 | reviewed |
| `mod.reports` | Reports Module | `documentation` | Reporting | active | tier2 | reviewed |
| `verify.inventory-continuity` | Inventory Continuity Verifier | `verification_report` | Warehouse Platform | active | tier2 | observational |
| `verify.architecture-boundary` | Architecture Boundary Verifier | `verification_report` | Platform Architecture | active | tier2 | observational |

### Tier 3

| id | title | category | owner | status | priority | verification_level |
|---|---|---|---|---|---|---|
| `code.profit-engine-model-b` | profit-engine-model-b.ts | `source_code` | Financial Engine | active | tier3 | raw |
| `code.smart-pricing` | smart-pricing.ts | `source_code` | Smart Pricing | active | tier3 | raw |
| `types.database` | database.ts types | `type_definition` | Platform Architecture | active | tier3 | raw |
| `svc.dashboard-service` | dashboard-service.ts | `service_implementation` | Dashboard | active | tier3 | raw |

Legacy material under `docs/99-legacy/*` should be registered with `status: legacy` and must not override `active` Tier 1 sources.

---

## Registry Lifecycle

1. **Register** — add entry when a source becomes trusted.
2. **Activate** — `status: active` only after owner review.
3. **Deprecate** — keep readable; mark `deprecated` / set `supersedes`.
4. **Never delete history** without ADR — knowledge provenance matters.

---

## Non-Implementation Note

This registry is a **design artifact**. Future sprints may materialize it as YAML/JSON/DB without changing the schema fields above.
