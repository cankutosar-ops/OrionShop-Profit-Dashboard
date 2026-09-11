# ADR-014 — Orion Knowledge Object Model

---

Status

Accepted

---

Owner

Platform Architecture

---

Module

Orion

---

Category

Decision

---

Dependencies

- [ADR-012](./ADR-012-orion-knowledge-foundation.md)
- [ADR-013](./ADR-013-orion-knowledge-materialization.md)
- [Knowledge Object Model](../10-orion/KNOWLEDGE_OBJECT_MODEL.md)

---

## Context

Articles (12.1) are human-oriented. Orion and future channels need a **structured, graph-capable source of truth** so Help Center, tooltips, APIs, and answers do not diverge from markdown folders.

## Decision

Adopt the **Knowledge Object** as the canonical source of truth for every Orion concept.

1. Identity: id, title, aliases, description (ID immutable).
2. Classification + single owner (+ business/technical owners).
3. Authority: Business Rules → ADR → Documentation → Implementation.
4. Typed relationship graph (`depends_on`, `used_by`, `implements`, `references`, `extends`, `related_to`, `verified_by`, `defined_by`, `superseded_by`, …).
5. Sources with priority; search metadata (keywords, tags, synonyms, abbreviations, locale).
6. Lifecycle: draft → verified → deprecated / archived / superseded.
7. Representations: Article, PDF, Help, Orion, future API — all derived from the object.

## Consequences

- Content sprints populate objects first (or in lockstep with articles).
- No runtime/LLM in 12.2.
- Folder trees are not the knowledge model; the graph is.

## References

- `docs/10-orion/KNOWLEDGE_OBJECT_*.md`
