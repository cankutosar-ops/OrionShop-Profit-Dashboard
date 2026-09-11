# Retrieval Strategy

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
- [Knowledge Registry](./KNOWLEDGE_REGISTRY.md)
- [Confidence & Citation](./CONFIDENCE_AND_CITATION.md)

---

## Principle

**Never retrieve randomly.**  
Questions resolve along a fixed ordered path.

---

## Canonical Retrieval Order

```
1. Business Rules
        ↓
2. Architecture Decisions
        ↓
3. Financial Engine Rules
        ↓
4. Warehouse Rules
        ↓
5. Administration Rules
        ↓
6. Documentation
        ↓
7. Database Schema
        ↓
8. Source Code
```

Sprint / Product decisions are consulted with Architecture Decisions / Business Rules as applicable (same Tier 1 band), then specialized engine/warehouse/admin rules.

API contracts and verification reports sit with Documentation / Schema (Tier 2 band) — after normative rules, before Source Code.

---

## Resolution Algorithm (Conceptual)

```
INPUT: question
OUTPUT: answer_packet | unknown

1. Classify domain (Finance | Warehouse | Admin | Reporting | Pricing | Cross-cutting | Unknown)
2. Load registry candidates filtered by domain tags + active status
3. Walk retrieval order (above); within each step, sort by verification_level then retrieval_weight
4. Collect evidence snippets with source ids
5. Apply conflict policy (Tier 1 wins)
6. If sufficient evidence:
     assemble Answer + Why + Sources + Confidence
   Else:
     return Unknown response
7. Never call Marketplace APIs or mutate DB during retrieval
```

---

## Stopping Rules

| Condition | Action |
|---|---|
| Single Tier 1 canonical rule answers the question | Stop → **Verified** |
| Multiple Tier 1/2 sources agree without conflict | Stop → **Derived** |
| Only Tier 3 evidence | Stop → **Implementation** (must say so) |
| Conflict between Tier 1 sources | Stop → **Unknown** or escalate to ADR (do not pick arbitrarily) |
| No relevant active sources | Stop → **Unknown** |

Do not “keep searching code” to invent a business rule after Tier 1 silence.

---

## Domain Shortcuts (Optimization, Not Reordering)

Shortcuts **narrow candidates**; they do **not** skip higher-priority empty tiers.

| Domain hint | Prefer first among Tier 1 |
|---|---|
| Net Profit / Revenue / Tax / Settlement | Financial Engine Rules + Business Rules |
| Inventory History / Backfill / Snapshots / FBS location | Warehouse Rules |
| Roles / settings / audit | Administration Rules |
| Report definitions | Product / Reporting documentation after Business Rules |

---

## Explicitly Disallowed Retrieval Behaviors

- Random / embedding-only top-k without hierarchy (future RAG must respect this order)
- Using deprecated/legacy sources over active Tier 1
- Using code comments to override `docs/01-business` or Financial Engine docs
- Live Marketplace fetches
- “Similar projects usually…” external knowledge

---

## Future RAG Compatibility

If embeddings are introduced later:

1. Vector search may **propose** candidate source ids.
2. Candidates are **re-ranked and filtered** by this retrieval order.
3. Final answer still requires confidence + citations.
4. Unknown gate remains mandatory.
