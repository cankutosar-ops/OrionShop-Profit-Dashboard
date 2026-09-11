# Knowledge Object — Authority Model

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
- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Confidence & Citation](./CONFIDENCE_AND_CITATION.md)

---

## Principle

```
Business Rules
        ↓
Architecture Decisions
        ↓
Documentation
        ↓
Implementation
```

**Implementation never overrides Business Rules.**

---

## Authority Level

`authority_level` states which band governs the object’s **meaning**.

| Value | Meaning |
|---|---|
| `business_rule` | Bound by Tier 1 business / FE / warehouse / admin rules |
| `architecture_decision` | Bound by ADR / architecture |
| `documentation` | Bound by reviewed Tier 2 docs only (no stronger Tier 1 claim) |
| `implementation` | Bound only by code/types — must pair with `confidence: Implementation` |

An object about Net Profit **must** use `authority_level: business_rule` (or architecture if purely structural), never `implementation`.

---

## Source Priority

`source_priority` on the object = the **highest** (strongest) source kind that actually backs the object.

| source_priority | Allowed when |
|---|---|
| `business_rule` | ≥1 business_rule SourceRef |
| `architecture_decision` | ADR backs meaning; no conflicting business rule |
| `documentation` | Docs only |
| `verification` | Observational evidence only (rare as sole authority) |
| `implementation` | Code only |

If both business_rule and implementation exist, `source_priority` = `business_rule`.

---

## Confidence

Same enum as Sprint 12.0 / 12.1:

| Confidence | Rule |
|---|---|
| `Verified` | Canonical Tier 1 rule exists and is cited |
| `Derived` | Multiple reviewed sources agree |
| `Implementation` | Only implementation / raw code |
| `Unknown` | Insufficient trustworthy evidence — object should not be published as verified |

---

## Verification Status

| verification_status | Meaning |
|---|---|
| `unverified` | Not yet checked against verifiers / dual-read |
| `verified` | Matching verification evidence recorded in sources |
| `failed` | Verification attempted; mismatch — escalate; do not silently prefer code |
| `not_applicable` | No automated verifier (definition-only topics) |

`verification_status: verified` does **not** by itself make `confidence: Verified` without a business_rule/ADR citation for normative claims.

---

## Conflict Resolution

1. Prefer Business Rules over ADR prose if both speak to calculation meaning (ADR should point to Business Rules).
2. Prefer ADR over module documentation for boundaries.
3. Prefer documentation over implementation for narrative.
4. Implementation may explain *where*; it may not redefine *what*.
5. Unresolvable Tier 1 conflict → `confidence: Unknown` + ADR required.
