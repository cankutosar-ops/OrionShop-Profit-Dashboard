# ADR-015 — Orion Knowledge Materialization Pipeline

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

- [ADR-014 Knowledge Object Model](./ADR-014-orion-knowledge-object-model.md)
- [Knowledge Materialization Pipeline](../10-orion/KNOWLEDGE_MATERIALIZATION_PIPELINE.md)

---

## Context

Knowledge Objects (12.2) must not become retrievable without a single, deterministic quality gate. Unvalidated objects would break Orion’s no-hallucination guarantee.

## Decision

Adopt the **Materialization Pipeline**:

Object → Validation → Authority → Relationship → Ownership → Knowledge ID → Version → Registry Registration → Representation Generation → Index Generation → **Ready for Retrieval**

Rules:

- Fail-closed; no Ready on error
- No automatic fixes / silent corrections
- Registry accepts only validated objects
- Representations and indexes are outputs; object remains source of truth
- Atomic batch registration for connected graphs

## Consequences

- Future pipeline runners implement these stages in CI/CLI
- AI drafts still use the same pipeline
- No runtime registry/retriever/chat in 12.3

## References

- `docs/10-orion/KNOWLEDGE_MATERIALIZATION_PIPELINE.md`
- `docs/10-orion/MATERIALIZATION_*.md`
