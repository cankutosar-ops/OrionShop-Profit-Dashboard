# Materialization — Registry Registration Model

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
- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Validation Model](./MATERIALIZATION_VALIDATION_MODEL.md)

---

## Principle

The Registry accepts **only** objects that have passed the full validation chain through Version Validation.

Unvalidated objects must not appear as registry entries used for retrieval.

---

## Registration Input

A **validated Knowledge Object** (post stage Version Validation).

---

## Derived Registry Entry

Map object → registry entry (12.0 schema), for example:

| Registry field | From object |
|---|---|
| `id` | Stable slug derived from Knowledge ID (e.g. `ko.fe-001`) or Knowledge ID itself — choose one scheme and keep forever |
| `title` | `title` |
| `category` | Mapped from object `category` / module |
| `owner` | `owner` |
| `version` | `version` |
| `status` | From `lifecycle` (`verified`→`active`, `deprecated`→`deprecated`, …) |
| `priority` | From authority / source_priority → tier1/tier2/tier3 |
| `verification_level` | From confidence + verification_status |

Optional: `path` to object storage URI; `tags` from object tags.

---

## Registration Rules

| Rule | Description |
|---|---|
| `REG-VALIDATED-ONLY` | Reject registration if any validation stage failed |
| `REG-UPSERT-BY-ID` | Updates replace prior registry row for same Knowledge ID |
| `REG-NO-ORPHANS` | Do not leave Ready flag without registry row |
| `REG-TRACE` | Store materialization run id + timestamp + validator version on the entry |
| `REG-ATOMIC-BATCH` | Batch: all entries commit or none |

---

## Registry vs Object Store

| Store | Holds |
|---|---|
| Object store | Full Knowledge Object (source of truth) |
| Registry | Catalog index for discovery / tier / owner filters |

Registry is a **projection**. On conflict, object store wins; re-run materialization.

---

## Non-Implementation Note

This sprint defines registration **rules** only. No registry runtime database or API is built in 12.3.
