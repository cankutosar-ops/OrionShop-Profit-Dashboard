# Knowledge Object — Lifecycle & Versioning

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
- [Knowledge ID Specification](./KNOWLEDGE_ID_SPECIFICATION.md)

---

## Lifecycle States

| lifecycle | Meaning | Publishable to Orion answers? |
|---|---|---|
| `draft` | Work in progress | No (except internal preview) |
| `verified` | Approved meaning + citations | Yes |
| `deprecated` | Still readable; prefer successor | Yes, with deprecation notice |
| `archived` | Historical only; not for default retrieval | No (unless explicit historical query) |
| `superseded` | Replaced by another object id | Redirect via `superseded_by` |

Note: Article `status` (12.1) aligns: `active` ≈ object `verified` (plus non-deprecated publishable states). Prefer object `lifecycle` as canonical once objects exist.

---

## Transition Rules

```text
draft ──► verified
draft ──► archived          (abandoned)
verified ──► deprecated
verified ──► superseded     (requires superseded_by)
deprecated ──► archived
deprecated ──► superseded
superseded ──► archived     (optional cleanup)
```

**Forbidden**

- `archived` → `verified` without new review (create new version bump + re-verify, or new object only if meaning split)
- Changing `id` on any transition
- `superseded` without `superseded_by`

---

## Versioning Strategy

### Immutable identity

- **Knowledge ID never changes.**
- Historical references (articles, ADRs, edges, help URLs keyed by id) **remain valid**.

### Mutable content version

| Field | Rule |
|---|---|
| `version` | Semver-like (`1.0.0`); increments on meaningful content change |
| Relationships | Survive version updates (same `id`); edges may record `since_version` |
| Representations | Regenerate articles/PDFs from the new version; do not fork a new id |

### When to new ID vs new version

| Situation | Action |
|---|---|
| Clarify wording / add example | Bump `version` |
| Correct formula to match Business Rules | Bump `version`; cite sources |
| Split one concept into two | New ids for children; parent may `deprecated` or keep as umbrella |
| Replace concept entirely | `superseded` + new id |

---

## Ownership During Lifecycle

- Only `owner` (or Platform Architecture for Orion meta-objects) may transition lifecycle.
- `business_owner` must approve `draft → verified` for calculation/definition objects.
