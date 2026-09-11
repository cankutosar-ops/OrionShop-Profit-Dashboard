# Materialization — Representations & Indexes

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

- [Knowledge Object Representations](./KNOWLEDGE_OBJECT_REPRESENTATIONS.md)
- [Knowledge Article Template](./templates/KNOWLEDGE_ARTICLE_TEMPLATE.md)
- [Materialization Pipeline](./KNOWLEDGE_MATERIALIZATION_PIPELINE.md)

---

## Representation Generation

After Registry Registration, the pipeline **may** generate channel outputs.

| Output | Description |
|---|---|
| Markdown Article | 12.1 template filled from object |
| PDF | Export of article/object |
| Help Center | Operator-facing page |
| Product Tooltip | Short `description` (+ optional formula) |
| Documentation Portal | Browse card + deep page |
| API Documentation | Machine/OpenAPI-adjacent narrative where applicable |

### Rules

1. Representations are **outputs**, not sources of truth.
2. Generation must not add claims absent from the object / cited sources.
3. Required channels per object are declared in object `channels` (optional field); missing required channel ⇒ not Ready.
4. Optional channels may be deferred without blocking Ready if policy marks them optional.

```
Validated Object → Registry entry
                 → Representations (0..n)
                 → Indexes
                 → Ready
```

---

## Index Generation

Indexes are **generated projections** for future retrieval/browse. They are rebuilt from Ready objects.

### Required index dimensions (design)

| Index | Key | Value |
|---|---|---|
| By Module | `module` | list of Knowledge IDs |
| By Category | `category` | list of Knowledge IDs |
| By Owner | `owner` | list of Knowledge IDs |
| By Business Rule | business_rule source ref | list of Knowledge IDs |
| By ADR | ADR id | list of Knowledge IDs |
| By Tag | tag | list of Knowledge IDs |
| By Confidence | confidence | list of Knowledge IDs |
| By Relationship | (`type`, `target_id`) or adjacency | edge lists / neighbors |

### Index rules

| Rule | Description |
|---|---|
| `IDX-READY-ONLY` | Indexes include only Ready objects |
| `IDX-REBUILDABLE` | Indexes can be fully rebuilt from object store + registry |
| `IDX-NO-AUTHORITY` | Indexes never override Business Rules |
| `IDX-DETERMINISTIC` | Same Ready set → same index contents |

---

## Extensibility

New representation channels or index dimensions may be added without changing pipeline stage order — only Output stage configuration.
