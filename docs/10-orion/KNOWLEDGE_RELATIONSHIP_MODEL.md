# Knowledge Relationship Model

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
- [Retrieval Strategy](./RETRIEVAL_STRATEGY.md)
- [Knowledge Article Standard](./KNOWLEDGE_ARTICLE_STANDARD.md)

---

## Purpose

Orion articles do not stand alone. They **declare relationships** to other knowledge so retrieval and conflict resolution stay deterministic.

---

## Canonical Relationship Chain

Articles may reference, in this conceptual order of authority:

```
Business Rules
        ↓
Architecture Decisions
        ↓
Related Documents
        ↓
Implementation
        ↓
Verification Reports
```

This mirrors Sprint 12.0 retrieval precedence. An article **must not** treat Implementation as overriding Business Rules.

---

## Relationship Types

| Type | Direction | Meaning | Section in template |
|---|---|---|---|
| `business_rules` | article → Tier 1 business docs | Normative calculation / meaning sources | Business Rule / Dependencies |
| `architecture_decisions` | article → ADRs | Structural decisions that constrain the topic | ADR References |
| `related_knowledge` | article → other Knowledge IDs | Peer / parent / child articles | Related Knowledge |
| `related_documents` | article → Tier 2 docs | Module specs, architecture narratives | Dependencies / Related |
| `implementation` | article → code / types / services | Where it is implemented today | Dependencies (Implementation) |
| `verification` | article → verify scripts / reports | Evidence that behavior matches rules | Verification |
| `data_sources` | article → tables / APIs / datasets | Where numbers or entities come from | Data Sources |
| `exceptions` | article → documented exceptions | Known deviations / dual models | Exceptions |

---

## Relationship Rules

1. **Calculation articles** (`category: calculation`) **must** list at least one `business_rules` link before any `implementation` link.
2. **Architecture articles** **must** list ADR and/or architecture docs; code links are optional and labeled Implementation.
3. **Implementation links are optional** for Verified articles; when present they illustrate, not redefine.
4. **Verification links** cannot invent rules; they only support Derived/observational confidence.
5. **Related Knowledge** uses Knowledge IDs only (`FE-001`), never fragile relative paths alone (paths may accompany IDs).
6. **Cycles** among `related_knowledge` are allowed for navigation but must not create conflicting Verified claims; conflicts → ADR or Unknown.
7. **Legacy docs** (`docs/99-legacy/*`) may be linked as historical only; they must not be the sole support for `confidence: Verified`.

---

## Cardinality Guidance

| Relationship | Min (active article) | Max |
|---|---|---|
| Business Rules (for calculations) | 1 | unbounded |
| ADR References | 0 (or 1+ for architecture topics) | unbounded |
| Related Knowledge | 0 | unbounded |
| Implementation | 0 | unbounded |
| Verification | 0 | unbounded |

---

## Conflict Handling via Relationships

If Business Rules and Implementation disagree:

1. Article states the **Business Rule** as Answer.
2. Exceptions section notes implementation drift if verified by a report.
3. Confidence becomes **Derived** or topic escalates to ADR — never silently prefer code.

---

## Extensibility

New relationship types (e.g. `video`, `faq_parent`) may be added in the template’s Related Knowledge / Dependencies sections without changing the authority chain above.
