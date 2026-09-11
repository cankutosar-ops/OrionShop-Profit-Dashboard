# Knowledge Object Model

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
- [Knowledge Article Standard (12.1)](./KNOWLEDGE_ARTICLE_STANDARD.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)
- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Authority Model](./KNOWLEDGE_OBJECT_AUTHORITY.md)
- [Relationship Graph](./KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md)
- [Lifecycle & Versioning](./KNOWLEDGE_OBJECT_LIFECYCLE.md)
- [Representations](./KNOWLEDGE_OBJECT_REPRESENTATIONS.md)

---

## Purpose

Sprint **12.2** defines the **Knowledge Object** — the canonical, machine-oriented source of truth for every Orion concept.

| Artifact | Audience | Role |
|---|---|---|
| **Knowledge Object** | Orion / systems | **Source of truth** |
| **Knowledge Article** | Humans | One **representation** of an object |
| PDF / Help Center / Tooltip / API | Humans / clients | Other representations of the **same** object |

```
Knowledge Object  (canonical)
        ↓
   Representations
        ├── Knowledge Article (12.1 template)
        ├── PDF
        ├── Help Center
        ├── Product Tooltips
        ├── Orion answers
        └── Future API payloads
```

**Articles are not the source of truth.**  
They are generated from (or kept in sync with) Knowledge Objects.

---

## Vision: Human Docs vs Machine Knowledge

| Human documentation | Machine knowledge |
|---|---|
| Narrative, readable | Structured fields + graph edges |
| Folder trees | Relationship graph |
| Optional prose | Required identity, authority, sources |
| May lag | Object version is authoritative |

Every concept becomes an independent Knowledge Object, for example:

Revenue · Net Profit · Warehouse Location · Historical Backfill · Marketplace Fee · Estimated Tax · Company · Marketplace Account · Smart Pricing · Settlement · Inventory Snapshot

---

## Document Map (12.2)

| Document | Contents |
|---|---|
| [KNOWLEDGE_OBJECT_SPECIFICATION.md](./KNOWLEDGE_OBJECT_SPECIFICATION.md) | Canonical object schema (identity, classification, search, sources) |
| [KNOWLEDGE_OBJECT_AUTHORITY.md](./KNOWLEDGE_OBJECT_AUTHORITY.md) | Authority level, confidence, source priority |
| [KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md](./KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md) | Relationship types & graph rules |
| [KNOWLEDGE_OBJECT_LIFECYCLE.md](./KNOWLEDGE_OBJECT_LIFECYCLE.md) | Lifecycle + immutable ID versioning |
| [KNOWLEDGE_OBJECT_REPRESENTATIONS.md](./KNOWLEDGE_OBJECT_REPRESENTATIONS.md) | Human & channel representations |
| [ROADMAP.md](./ROADMAP.md) | Updated for object-first future |

---

## Non-Goals (12.2)

- LLM / embeddings / vector DB / RAG / chat
- Search engine or retrieval runtime
- API / UI
- Populating objects or writing articles
- Application code under `src/`

---

## Principle

**One concept → one Knowledge Object → many representations.**  
**Business Rules own calculations; Implementation never overrides them.**
