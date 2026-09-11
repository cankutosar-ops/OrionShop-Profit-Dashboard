# ADR-012 — Orion Knowledge Foundation

---

Status

Accepted

---

Owner

Platform Architecture

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

Orion

---

Category

Decision

---

Dependencies

- [Orion Foundation](../10-orion/README.md)
- [Decisions Index](./INDEX.md)

---

## Context

OrionShop knowledge is spread across business docs, architecture, module specs, schema, APIs, verifiers, and code. Without a formal knowledge system, answers risk hallucination, code overriding business rules, or ad-hoc documentation search.

## Decision

Establish **Orion** as the platform’s **verified knowledge engine** (not a chatbot).

Sprint 12.0 delivers **architecture only**:

- Knowledge hierarchy (Tier 1–3)
- Knowledge registry schema + seed catalog
- Fixed retrieval order
- Confidence model (Verified / Derived / Implementation / Unknown)
- Citation contract (Answer → Why → Sources → Confidence)
- Ownership model
- Extensible roadmap for future source kinds

## Consequences

### Positive

- Single precedence model for all future Orion surfaces
- Business Rules remain authoritative over implementation
- Unknown handling prevents fabricated architecture

### Negative / Constraints

- No chat/LLM in 12.0 — retrieval UX deferred
- Registry is design-time until materialization sprint

### Forbidden by this ADR

- Orion calling Marketplace APIs
- Orion mutating databases
- Orion performing business calculations
- Orion taking sync/admin/code-generation actions
- Source code overriding Tier 1 business/architecture truth

## References

- `docs/10-orion/*`
