# Materialization — Validation Model

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

- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Knowledge Object Authority](./KNOWLEDGE_OBJECT_AUTHORITY.md)
- [Knowledge Object Relationship Graph](./KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md)
- [Knowledge ID Specification](./KNOWLEDGE_ID_SPECIFICATION.md)
- [Lifecycle & Versioning](./KNOWLEDGE_OBJECT_LIFECYCLE.md)

---

## Principle

Objects failing validation **must never enter Orion** (never become Ready for Retrieval).

No automatic fixes. No silent corrections. Diagnostics only.

---

## A. Structural Validation (mandatory)

| Rule ID | Rule |
|---|---|
| `VAL-ID-UNIQUE` | Knowledge ID unique among Ready assets and current materialization batch |
| `VAL-ID-FORMAT` | ID matches registered prefix + monotonic `NNN` pattern |
| `VAL-META-REQUIRED` | Required identity + classification fields present (`id`, `title`, `aliases`, `description`, `module`, `category`, `owner`, `business_owner`, `technical_owner`) |
| `VAL-OWNER-REQUIRED` | `owner` non-empty; single maintainer |
| `VAL-AUTHORITY-REQUIRED` | `authority_level`, `source_priority` present and enum-valid |
| `VAL-CONFIDENCE-REQUIRED` | `confidence` ∈ {Verified, Derived, Implementation, Unknown} |
| `VAL-LIFECYCLE-VALID` | `lifecycle` ∈ allowed set; transition rules respected on update |
| `VAL-VERSION-INTEGRITY` | `version` present; updates must bump version; superseded links consistent |
| `VAL-REL-INTEGRITY` | Every relationship `type` is known; `target_id` shaped as Knowledge ID |
| `VAL-SOURCES-SHAPE` | Each source has `kind`, `ref`, `priority` |

---

## B. Authority Validation

Verify references and hierarchy:

| Source kind | Validation |
|---|---|
| Business Rule | `ref` resolves to known Tier 1 business/FE/warehouse/admin rule path or registry source; required for `confidence: Verified` calculations/definitions |
| Architecture (ADR) | ADR id exists when cited |
| Documentation | Path/registry id exists when cited |
| Implementation | Code path optional; **cannot** be sole support for Verified |
| Verification | Verifier/report ref optional; observational |

### Hierarchy checks

| Rule ID | Rule |
|---|---|
| `AUTH-HIERARCHY` | If both business_rule and implementation sources exist, `source_priority` / `authority_level` must not rank implementation above business_rule |
| `AUTH-NO-IMPL-VERIFIED` | `confidence: Verified` forbidden when only implementation sources exist |
| `AUTH-CALC-OWNER` | Calculation objects: `business_owner` must be Financial Engine (or Product Owner with FE concurrence policy) |
| `AUTH-CHAIN` | Authority band respects: Business Rules → Architecture Decisions → Documentation → Implementation |

---

## C. Relationship Validation

| Rule ID | Rule |
|---|---|
| `REL-TARGET-EXISTS` | Every `target_id` exists in Ready registry or current validated batch |
| `REL-NO-BROKEN` | No dangling references |
| `REL-TYPE-SEMANTICS` | Edge type allowed for the object categories involved |
| `REL-NO-CIRCULAR-OWNERSHIP` | No cycle where A owns B owns A via ownership edges or `owner` fields implying circular maintainer graphs; `superseded_by` must be acyclic |
| `REL-SUPERSEDE-PAIR` | `lifecycle: superseded` ⇒ `superseded_by` set and target exists |

`related_to` cycles for navigation are allowed; `superseded_by` / ownership cycles are not.

---

## D. Ownership Validation

| Rule ID | Rule |
|---|---|
| `OWN-SINGLE` | Exactly one `owner` |
| `OWN-BUSINESS` | `business_owner` present |
| `OWN-TECHNICAL` | `technical_owner` present |
| `OWN-MODULE-ALIGN` | `module` aligns with owner domain map (FE/WH/ADM/REP/…) |

---

## E. Knowledge ID Validation

| Rule ID | Rule |
|---|---|
| `ID-IMMUTABLE` | Existing Ready id cannot be changed on update |
| `ID-NO-REUSE` | Retired ids not reassigned to different concepts |
| `ID-PREFIX` | Prefix listed in ID specification |

---

## F. Version Validation

| Rule ID | Rule |
|---|---|
| `VER-BUMP-ON-CHANGE` | Content change ⇒ version increase |
| `VER-HISTORY` | Prior versions remain referenceable by id + version history (design); id stays constant |

---

## Batch Materialization

When registering a connected set (e.g. Revenue + Gross Sales):

1. Validate all objects structurally.
2. Resolve relationships within the batch ∪ Ready set.
3. Commit registry registration atomically (all Ready or none).

Partial batch publish is forbidden.
