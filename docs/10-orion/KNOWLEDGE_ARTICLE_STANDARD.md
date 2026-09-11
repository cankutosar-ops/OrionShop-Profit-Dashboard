# Knowledge Article Standard

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

- [Orion Foundation](./README.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)
- [Confidence & Citation](./CONFIDENCE_AND_CITATION.md)
- [Knowledge ID Specification](./KNOWLEDGE_ID_SPECIFICATION.md)
- [Metadata Model](./KNOWLEDGE_METADATA_MODEL.md)
- [Relationship Model](./KNOWLEDGE_RELATIONSHIP_MODEL.md)
- [Canonical Template](./templates/KNOWLEDGE_ARTICLE_TEMPLATE.md)

---

## Purpose

Sprint **12.1** defines **how** every Orion Knowledge article is written.

It does **not** author knowledge content.

Every future Orion article **must** follow the same canonical format.

---

## Documents in This Sprint

| Document | Role |
|---|---|
| [KNOWLEDGE_ID_SPECIFICATION.md](./KNOWLEDGE_ID_SPECIFICATION.md) | Stable ID system (`FE-001`, `WH-001`, …) |
| [KNOWLEDGE_METADATA_MODEL.md](./KNOWLEDGE_METADATA_MODEL.md) | Required metadata fields |
| [KNOWLEDGE_RELATIONSHIP_MODEL.md](./KNOWLEDGE_RELATIONSHIP_MODEL.md) | Links to rules, ADRs, docs, code, verifiers |
| [templates/KNOWLEDGE_ARTICLE_TEMPLATE.md](./templates/KNOWLEDGE_ARTICLE_TEMPLATE.md) | Canonical article body |

---

## Non-Goals

- Writing FE/WH/ADM/REP articles
- Chat UI / LLM / RAG
- Changing application modules
- Replacing existing `docs/01-business` files (they remain Tier 1 sources; articles will cite them later)

---

## Materialization Principle

```
Foundation (12.0)     →  what may be known, and in what order
Materialization (12.1) →  how each knowledge unit is written
Content sprints (later) →  what is written into articles
```

---

## Article Lifecycle (Preview)

1. Allocate stable ID (`FE-001`, …) — **never reuse / never renumber**
2. Copy canonical template
3. Fill metadata
4. Author sections (later sprints)
5. Set `status` + `confidence`
6. Register in Knowledge Registry (materialized catalog, later)

---

## Validation

`npm run verify:orion-knowledge-materialization-12-1`
