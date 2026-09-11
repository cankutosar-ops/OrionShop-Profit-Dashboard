# Knowledge Metadata Model

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

- [Knowledge ID Specification](./KNOWLEDGE_ID_SPECIFICATION.md)
- [Confidence & Citation](./CONFIDENCE_AND_CITATION.md)
- [Ownership Model](./OWNERSHIP.md)

---

## Purpose

Every Orion Knowledge article carries the same metadata block.

Metadata is machine-readable intent for future registry / retrieval; humans keep it at the top of each article.

---

## Required Metadata Fields

| Field | Type | Description |
|---|---|---|
| `id` | Knowledge ID | Stable id, e.g. `FE-001` |
| `title` | string | Human title |
| `module` | string | Primary module name (Financial Engine, Warehouse, …) |
| `category` | enum | Article category (below) |
| `owner` | string | Accountable team / module for the article |
| `business_owner` | string | Who owns business meaning |
| `technical_owner` | string | Who owns technical accuracy / links to implementation |
| `version` | semver-like string | Article revision, e.g. `1.0.0` |
| `status` | enum | `draft` \| `active` \| `deprecated` \| `superseded` |
| `confidence` | enum | `Verified` \| `Derived` \| `Implementation` \| `Unknown` |
| `last_updated` | ISO date | `YYYY-MM-DD` |
| `tags` | string[] | Facets for retrieval (`net-profit`, `fbs`, …) |

All twelve fields are **mandatory** on every article (use `TBD` only while `status: draft`).

---

## Category Enum (Article)

Distinct from registry source `category`, but aligned in spirit:

| category | Use for |
|---|---|
| `definition` | What a term/KPI is |
| `calculation` | How a metric is calculated (cites Business Rules) |
| `architecture` | Structural / boundary knowledge |
| `data` | Tables, fields, datasets |
| `process` | Operational flows (backfill, sync stages) — descriptive |
| `policy` | Governance / admin / security policy |
| `comparison` | Differences (e.g. Revenue vs Settlement) |
| `faq` | Short Q&A grounded in Tier 1 |

---

## Owner Fields

| Field | Answers |
|---|---|
| `owner` | Who maintains this article file |
| `business_owner` | Who decides business truth (often Financial Engine / Product Owner / Warehouse) |
| `technical_owner` | Who validates implementation links (often same module’s eng owner) |

**Rule:** For calculation articles, `business_owner` must be **Financial Engine** or **Product Owner** with FE concurrence — never “the service file.”

---

## Confidence in Metadata

`confidence` on the article is the **authoritative confidence for the article as a whole**.

- Must match Sprint 12.0 confidence model.
- If any critical section is Unknown, either lower article confidence or split articles.
- `Unknown` articles should not be `active`.

---

## Optional Metadata (Future-Compatible)

| Field | Description |
|---|---|
| `locale` | BCP-47; default `en` |
| `supersedes` | Prior Knowledge ID |
| `superseded_by` | Newer Knowledge ID |
| `registry_sources` | List of registry source ids cited |
| `reviewers` | Names/roles |
| `audience` | `operator` \| `developer` \| `executive` |

Adding optional fields does not require changing the required twelve.

---

## Serialization (Design)

Articles use the project’s horizontal-rule metadata style (same family as other docs), with an explicit **Orion Metadata** block listing all required fields.

YAML/JSON front-matter may be adopted later without changing field names.
