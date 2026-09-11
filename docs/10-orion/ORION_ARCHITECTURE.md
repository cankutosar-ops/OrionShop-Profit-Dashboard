# Orion Architecture

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

- [Orion Foundation Index](./README.md)
- [Knowledge Hierarchy](./KNOWLEDGE_HIERARCHY.md)
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)

---

## 1. What Orion Is

Orion is the **living knowledge base** of OrionShop.

Users should not need to hunt across `docs/`, ADRs, and code to learn:

- What Net Profit is
- How Revenue is defined
- What Warehouse Sales Analytics reads
- Why FBS is a Warehouse Location
- Which module owns Inventory History

Orion resolves those questions from **registered, prioritized, verified sources**.

---

## 2. What Orion Is Not

| Not Orion | Reason |
|---|---|
| Chatbot | Conversation UX is a later delivery surface |
| Calculator | Financial Engine owns formulas; Orion cites them |
| Sync agent | Warehouse / Sync Engine own runtime sync |
| Admin console | Administration owns platform operations |
| Code generator | Development tools own implementation |
| Live Marketplace client | Never calls WB/Ozon APIs for answers |

---

## 3. Architectural Position

```
┌─────────────────────────────────────────────┐
│  Future Delivery Surfaces (out of Phase 1)  │
│  Chat UI · Docs portal · IDE assistant      │
└─────────────────────┬───────────────────────┘
                      │ questions / answers
┌─────────────────────▼───────────────────────┐
│              ORION KNOWLEDGE ENGINE         │
│  Registry · Retrieval · Confidence · Cite   │
└─────────────────────┬───────────────────────┘
                      │ read-only
┌─────────────────────▼───────────────────────┐
│           KNOWLEDGE SOURCE TIERS            │
│  T1 Business/Architecture/Rules             │
│  T2 Docs / Schema / API / Verifiers         │
│  T3 Source code / types / services          │
└─────────────────────────────────────────────┘

Existing platform modules (Dashboard, FE, Warehouse, …)
remain unchanged. Orion does not sit inside their
calculation or sync paths.
```

Orion is a **cross-cutting knowledge plane**, not a peer business module that owns KPIs or data pipelines.

---

## 4. Hard Boundaries

### Allowed (Phase 1 design)

- Describe knowledge sources and precedence
- Define registry metadata
- Define retrieval order
- Define confidence and citation contracts
- Define unknown handling
- Plan extensibility for future source kinds

### Forbidden (all phases unless explicitly approved later)

- Mutating database rows
- Calling Marketplace APIs
- Recomputing financial / warehouse metrics
- Triggering sync, backfill, or admin actions
- Overriding Business Rules with source-code opinion
- Answering without a confidence label
- Answering without sources when confidence ≠ Unknown

---

## 5. Logical Layers (Future Implementation)

Phase 1 defines layers only; no runtime code in this sprint.

| Layer | Responsibility |
|---|---|
| **Ingress** | Accept a natural-language or structured question (future) |
| **Intent classification** | Map question → domain (Finance, Warehouse, Admin, …) |
| **Registry lookup** | Select candidate sources by category + priority |
| **Ordered retrieval** | Walk the retrieval hierarchy until evidence is enough |
| **Conflict resolution** | Higher tier / architecture wins over lower tier |
| **Answer assembly** | Answer → Why → Sources → Confidence |
| **Unknown gate** | If no trustworthy evidence → fixed Unknown response |

---

## 6. Conflict Resolution Policy

When sources disagree:

1. **Business Rules** win over all other tiers for calculation meaning.
2. **Architecture Decisions (ADRs)** win over module docs and code for structural truth.
3. **Module architecture / product specs** win over implementation comments.
4. **Verification reports** confirm or challenge implementation; they do not invent rules.
5. **Source code** may only explain *how currently implemented*, never *what should be true* when it conflicts with Tier 1.

If conflict cannot be resolved → **Unknown** (or Explicit Conflict note under Derived only when multiple Verified sources disagree and require human ADR).

---

## 7. Relationship to Existing Platform Layers

| Platform layer | Orion relationship |
|---|---|
| Client → API → Service → Repository → DB | Untouched; Orion does not become a service in that chain in Phase 1 |
| Financial Engine | Knowledge *about* formulas; never executes them |
| Warehouse Platform | Knowledge *about* engines/locations; never runs them |
| Administration | Knowledge *about* governance; never mutates settings |
| Reporting / Smart Pricing | Cite module ownership and inputs; do not generate reports or prices |

---

## 8. Phase 1 Deliverable

This document set **is** the Orion Knowledge Foundation.

No chat, no LLM wiring, no embeddings, no runtime retrieval service in Sprint 12.0.
