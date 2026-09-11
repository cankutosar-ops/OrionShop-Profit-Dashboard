# Orion Knowledge — Future Roadmap

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

Roadmap

---

Dependencies

- [Orion Architecture](./ORION_ARCHITECTURE.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)

---

## Goal

Extend Orion without redesigning the foundation established in Sprint 12.0.

---

## Phase Map

| Phase | Focus | Notes |
|---|---|---|
| **12.0 Foundation** | Hierarchy, registry schema, retrieval, confidence, citation, ownership | Architecture |
| **12.1 Materialization** | Article template, Knowledge IDs, metadata, article relationships | Architecture |
| **12.2 Knowledge Object** | Canonical machine object, graph, authority, lifecycle, representations | Architecture |
| **12.3 Materialization Pipeline** | Validate → register → represent → index → Ready | **This sprint — architecture only** |
| **12.x Object materialization** | YAML/JSON/DB seed of Knowledge Objects | No LLM required |
| **12.x Pipeline runner** | Deterministic CLI/CI implementing 12.3 stages | No chat |
| **12.x Deterministic retriever** | Rule-based lookup over Ready objects + order | Still no chat required |
| **13.x Read-only answer API** | Returns Answer/Why/Sources/Confidence from objects | No mutations |
| **13.x Delivery surfaces** | Docs portal / help / tooltips / IDE assist | UX only |
| **14.x Assisted retrieval** | Optional embeddings **under** hierarchy filter | RAG must obey retrieval order |
| **Later** | Multi-language, video, FAQ, release notes | New registry/object fields only |

---

## Planned Source Kinds (No Schema Break)

Add via registry `category` + `media_type` only:

| Source kind | Tier | Notes |
|---|---|---|
| User Documentation | 2 | Operator-facing guides |
| API Documentation expansions | 2 | Already partially present |
| Video Tutorials | 2 | `media_type: video` + transcript optional |
| Release Notes | 2 | Version-scoped |
| FAQ | 2 | Must cite Tier 1 when answering calculations |
| Multi-language documentation | 2 | `locale` field; same `id` family |
| AI-generated drafts | draft only | Must pass same pipeline; never bypass Ready |
| Interactive tutorials | 2 | New representation channel |

---

## Compatibility Guarantees

Future work **must** preserve:

1. Tier precedence (Business Rules > Architecture > … > Code)
2. Confidence enum: Verified | Derived | Implementation | Unknown
3. Citation shape: Answer → Why → Sources → Confidence
4. Unknown fixed phrase policy
5. No Marketplace API / no DB mutations / no live calculations in Orion
6. Registry required fields: id, title, category, owner, version, status, priority, verification_level
7. Knowledge Object as source of truth; articles/PDFs/help as representations
8. Knowledge ID immutability; graph edges by Knowledge ID
9. Implementation never overrides Business Rules on objects
10. Materialization pipeline: fail-closed; no Ready without validation; no auto-fix

---

## Explicit Non-Goals (Remain Out Until Separate ADR)

- Autonomous agents that sync or mutate
- Code generation presented as verified knowledge
- Replacing Financial Engine or Warehouse with LLM reasoning
- Training on production credentials or encrypted secrets
