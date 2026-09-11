# Knowledge Object — Relationship Graph

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

- [Knowledge Object Specification](./KNOWLEDGE_OBJECT_SPECIFICATION.md)
- [Knowledge Relationship Model (12.1 articles)](./KNOWLEDGE_RELATIONSHIP_MODEL.md)
- [Retrieval Strategy](./RETRIEVAL_STRATEGY.md)

---

## Principle

Knowledge is a **graph**, not a folder tree.

Nodes = Knowledge Objects (`id`)  
Edges = typed relationships

Folder paths under `docs/` are storage convenience only.

---

## Relationship Types

| type | Semantics | Typical direction |
|---|---|---|
| `depends_on` | Object requires target to be understood / valid | Revenue → Gross Sales |
| `used_by` | Inverse of depends_on (optional explicit inverse) | Gross Sales → Revenue |
| `implements` | Object (or its module) realizes the target rule/concept | Engine concept → Business Rule object |
| `implemented_by` | Concept is realized by target (module/object) | Revenue → Financial Engine object |
| `references` | Soft citation without dependency | FAQ → Definition |
| `extends` | Specialization / subtype | FBS Location → Warehouse Location |
| `related_to` | Peer association without hierarchy | Settlement ↔ Revenue |
| `verified_by` | Evidence object / verification report supports this object | Net Profit → verifier artifact object |
| `defined_by` | Normative definition source object | Net Profit → Accounting Rules object |
| `superseded_by` | This object is replaced by target | Old id → new id (rare; prefer lifecycle) |
| `supersedes` | Inverse of superseded_by | |
| `defined_by` / `implements` | Prefer `defined_by` for Tier 1 binding | |

Article-level relationship types from 12.1 map into these graph types when objects are materialized.

---

## Edge Schema

```text
RelationshipEdge {
  type: <enum above>
  target_id: Knowledge ID
  note?: string
  since_version?: string   # object version when edge added
}
```

Edges reference **Knowledge IDs**, not file paths. Paths may appear in `sources`, not as edge targets.

---

## Graph Rules

1. **No authority via folder depth** — only `type` + Authority model.
2. **Cycles** allowed for `related_to` / navigation; forbidden for `superseded_by` chains that loop.
3. **Calculation objects** should include ≥1 `defined_by` or `depends_on` toward a Business Rule object (or SourceRef business_rule until rule objects exist).
4. **`implemented_by` never upgrades confidence** by itself.
5. **`verified_by`** targets verification-oriented objects or SourceRefs; observational only.
6. When both A `depends_on` B and B `used_by` A exist, treat as one logical link (duplicates discouraged).

---

## Example Graph (Illustrative Shape Only)

```text
Revenue
  ├─ depends_on → Gross Sales
  ├─ defined_by → <Business Rule object>
  ├─ implemented_by → <Financial Engine object>
  └─ verified_by → <Verification Report object>

Gross Sales
  └─ used_by → Revenue
```

Exact node contents are authored in later content sprints.

---

## Extensibility

New edge types may be added via ADR if they do not create a path for Implementation to outrank Business Rules.
