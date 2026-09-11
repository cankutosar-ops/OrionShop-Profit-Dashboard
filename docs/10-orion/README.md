# Orion Knowledge System — Foundation

---

Status

Draft

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

Architecture

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [Architecture Rules](../07-development/ARCHITECTURE_RULES.md)

---

Related Documents

- [Orion Architecture](./ORION_ARCHITECTURE.md)
- [Knowledge Hierarchy](./KNOWLEDGE_HIERARCHY.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)
- [Retrieval Strategy](./RETRIEVAL_STRATEGY.md)
- [Confidence & Citation](./CONFIDENCE_AND_CITATION.md)
- [Ownership Model](./OWNERSHIP.md)
- [Roadmap](./ROADMAP.md)
- [Knowledge Article Standard (12.1)](./KNOWLEDGE_ARTICLE_STANDARD.md)
- [Canonical Article Template](./templates/KNOWLEDGE_ARTICLE_TEMPLATE.md)
- [Knowledge Object Model (12.2)](./KNOWLEDGE_OBJECT_MODEL.md)
- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Knowledge Materialization Pipeline (12.3)](./KNOWLEDGE_MATERIALIZATION_PIPELINE.md)

---

Related ADRs

- [ADR — Orion Knowledge Foundation](../06-decisions/ADR-012-orion-knowledge-foundation.md)
- [ADR — Orion Knowledge Materialization](../06-decisions/ADR-013-orion-knowledge-materialization.md)
- [ADR — Orion Knowledge Object Model](../06-decisions/ADR-014-orion-knowledge-object-model.md)
- [ADR — Orion Knowledge Materialization Pipeline](../06-decisions/ADR-015-orion-knowledge-materialization-pipeline.md)

---

## Purpose

Orion is the **verified knowledge engine** of the OrionShop platform.

Orion is **not** a chatbot, action agent, or code generator.

Orion answers questions using **only verified project knowledge**.

---

## Non-Goals (Phase 1)

Phase 1 defines architecture only. It does **not** include:

- Chat UI
- LLM / prompt integration
- Embeddings / vector DB / RAG pipeline
- Marketplace API access
- Database mutations
- Business calculations at answer time
- Sync, administration actions, or code generation
- Implementation suggestions presented as facts

---

## Core Guarantees

| Guarantee | Meaning |
|---|---|
| No hallucinations | Unknown → explicit unknown response |
| No assumptions | Missing evidence ≠ inferred rule |
| No Marketplace API | Knowledge only; never live seller APIs |
| No DB mutations | Read-only knowledge surfaces |
| No calculations | Does not recompute Net Profit, fees, tax, etc. |
| No actions | Does not sync, mutate settings, or deploy |
| Source precedence | Business Rules & Architecture always beat code |

---

## Document Map

| Document | Contents |
|---|---|
| [ORION_ARCHITECTURE.md](./ORION_ARCHITECTURE.md) | System role, boundaries, layers |
| [KNOWLEDGE_HIERARCHY.md](./KNOWLEDGE_HIERARCHY.md) | Tier 1–3 source tiers |
| [KNOWLEDGE_REGISTRY.md](./KNOWLEDGE_REGISTRY.md) | Registry schema + seed catalog |
| [RETRIEVAL_STRATEGY.md](./RETRIEVAL_STRATEGY.md) | Ordered resolution path |
| [CONFIDENCE_AND_CITATION.md](./CONFIDENCE_AND_CITATION.md) | Confidence levels + answer shape |
| [OWNERSHIP.md](./OWNERSHIP.md) | Module ownership of knowledge |
| [ROADMAP.md](./ROADMAP.md) | Future sources without redesign |

---

## Phase 1 Status

**Architecture defined. Implementation deferred.**
