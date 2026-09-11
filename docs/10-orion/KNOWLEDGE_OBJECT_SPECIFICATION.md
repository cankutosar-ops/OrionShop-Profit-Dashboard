# Knowledge Object Specification

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

- [Knowledge Object Model](./KNOWLEDGE_OBJECT_MODEL.md)
- [Knowledge ID Specification](./KNOWLEDGE_ID_SPECIFICATION.md)
- [Knowledge Metadata Model](./KNOWLEDGE_METADATA_MODEL.md)

---

## Canonical Knowledge Object

A Knowledge Object is a structured record. Field names below are stable for future YAML/JSON/DB materialization.

---

## 1. Identity

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | Knowledge ID | yes | Stable id (`FE-001`, `WH-001`, …). **Never changes.** |
| `title` | string | yes | Canonical display title |
| `aliases` | string[] | yes (may be `[]`) | Alternate names users may use |
| `description` | string | yes | Short neutral description (1–3 sentences) |

### Alias rules

- Aliases are for search/match only; they do not create new objects.
- Prefer clear synonyms and product language (e.g. Revenue → `Seller Revenue`, not secret jargon).
- Abbreviations go in `abbreviations` (search block), not necessarily as titles.

**Example (schema only — not authored content):**

```text
id: FE-00X
title: Revenue
aliases: [Seller Revenue]
description: <filled in a content sprint from Business Rules>
```

---

## 2. Classification

| Field | Type | Required | Description |
|---|---|---|---|
| `module` | string | yes | Primary module (Financial Engine, Warehouse Platform, …) |
| `category` | enum | yes | Same article categories: `definition` \| `calculation` \| `architecture` \| `data` \| `process` \| `policy` \| `comparison` \| `faq` |
| `owner` | string | yes | Object maintainer |
| `business_owner` | string | yes | Business meaning owner |
| `technical_owner` | string | yes | Technical / implementation-link owner |

**Single owner rule:** `owner` is the single accountable maintainer of the object record.  
`business_owner` / `technical_owner` clarify dual accountability without splitting the object.

For calculations: `business_owner` = **Financial Engine** (or Product Owner with FE concurrence).

---

## 3. Authority (summary)

Full semantics: [KNOWLEDGE_OBJECT_AUTHORITY.md](./KNOWLEDGE_OBJECT_AUTHORITY.md)

| Field | Type | Required |
|---|---|---|
| `authority_level` | enum | yes |
| `confidence` | enum | yes — `Verified` \| `Derived` \| `Implementation` \| `Unknown` |
| `verification_status` | enum | yes — `unverified` \| `verified` \| `failed` \| `not_applicable` |
| `source_priority` | enum | yes — highest binding source band for this object |

---

## 4. Relationships (summary)

Full semantics: [KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md](./KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md)

| Field | Type | Required |
|---|---|---|
| `relationships` | RelationshipEdge[] | yes (may be `[]`) |

Each edge: `{ type, target_id, note? }`

---

## 5. Sources

Every object references its evidence set. Each source entry has priority.

| Field | Type | Required |
|---|---|---|
| `sources` | SourceRef[] | yes (may be `[]` only while `draft`) |

### SourceRef

| Field | Type | Description |
|---|---|---|
| `kind` | enum | `business_rule` \| `adr` \| `documentation` \| `implementation` \| `verification` |
| `ref` | string | Path, ADR id, registry source id, or code path |
| `priority` | int | Lower number = higher priority (1 = strongest) |
| `note` | string? | Optional |

### Default priority bands

| kind | Default priority band |
|---|---|
| `business_rule` | 1 |
| `adr` | 2 |
| `documentation` | 3 |
| `verification` | 4 |
| `implementation` | 5 |

Implementation sources never outrank business_rule / adr for meaning.

---

## 6. Search Metadata

| Field | Type | Required | Description |
|---|---|---|---|
| `keywords` | string[] | yes (may be `[]`) | Free retrieval terms |
| `aliases` | string[] | yes | (also identity; duplicated here conceptually for search indexes) |
| `tags` | string[] | yes | Faceted tags |
| `synonyms` | string[] | yes (may be `[]`) | Near-equivalents |
| `abbreviations` | string[] | yes (may be `[]`) | e.g. `NP`, `MF` |
| `locale` | string | yes | Default `en`; enables future localization |
| `localized_titles` | map<locale,string>? | no | Future multi-language titles |
| `localized_aliases` | map<locale,string[]>? | no | Future |

**Example shape (not content):**

```text
title: Revenue
aliases: [Income, Seller Revenue, Net Revenue]  # illustrative aliases only
abbreviations: []
tags: [commercial-performance, finance]
locale: en
```

---

## 7. Lifecycle & Version (summary)

| Field | Type | Required |
|---|---|---|
| `lifecycle` | enum | yes — see Lifecycle doc |
| `version` | string | yes — object content version |
| `superseded_by` | Knowledge ID? | no |
| `supersedes` | Knowledge ID? | no |
| `created_at` | ISO date | yes when materialized |
| `updated_at` | ISO date | yes when materialized |

---

## 8. Payload Extensions (Future-Compatible)

Optional blocks that do not change core identity:

| Block | Purpose |
|---|---|
| `formula` | Structured formula text (calculations) |
| `data_sources` | Tables / APIs / datasets |
| `exceptions` | Dual models / caveats |
| `examples` | Non-secret examples |
| `media` | Video / image refs |
| `channels` | Which representations are published |

---

## Completeness Rule

An object may be `lifecycle: draft` with incomplete `sources` / `relationships`.  
An object may not be `lifecycle: verified` without:

- identity filled
- classification filled
- authority + confidence set
- at least one `business_rule` or `adr` source for calculation/definition objects (or explicit `verification_status: not_applicable` for pure implementation pointers labeled Implementation confidence)
