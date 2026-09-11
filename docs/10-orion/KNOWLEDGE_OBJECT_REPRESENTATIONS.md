# Knowledge Object — Representations & Ownership

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

- [Knowledge Object Model](./KNOWLEDGE_OBJECT_MODEL.md)
- [Knowledge Article Standard](./KNOWLEDGE_ARTICLE_STANDARD.md)
- [Ownership Model](./OWNERSHIP.md)

---

## Human Representation Model

```
Knowledge Object
        ↓
Knowledge Article   (12.1 canonical template)
        ↓
PDF / Help Center / Tooltips / Docs Portal / Orion / Future API
```

| Representation | Consumer | Generated from |
|---|---|---|
| Knowledge Article | Humans (markdown) | Object fields + prose blocks |
| PDF | Offline / audit | Article or object export |
| Help Center | Operators | Object + article |
| Product Tooltips | In-app UI | `description` + short formula |
| Documentation Portal | Browse/search | Object graph + articles |
| Orion answers | Q&A | Object + sources + confidence |
| Future API | Machines | Object JSON |

**Rule:** If representation and object disagree, **object wins**; fix the representation.

---

## Mapping: Object → Article

| Object field / block | Article section |
|---|---|
| Identity + classification metadata | Orion Metadata |
| Normative text / `defined_by` | Business Rule |
| `description` + narrative | Explanation |
| `formula` | Formula |
| `data_sources` | Data Sources |
| `sources` + edges | Dependencies |
| `exceptions` | Exceptions |
| `examples` | Examples |
| `relationships` | Related Knowledge |
| ADR SourceRefs | ADR References |
| verification SourceRefs | Verification |
| `confidence` | Confidence |

Articles may include editorial prose; they must not contradict object authority fields.

---

## Ownership Model (Objects)

Every object has a **single** `owner`.

| Domain examples | Typical `owner` / `business_owner` |
|---|---|
| Revenue, Net Profit, Marketplace Fee, Estimated Tax, Settlement | Financial Engine |
| Warehouse Location, Historical Backfill, Inventory Snapshot | Warehouse Platform |
| Company, Marketplace Account (platform meaning) | Administration or Platform Architecture (as registered) |
| Smart Pricing | Smart Pricing (`business_owner` notes FE dual-tax exception) |
| Reporting concepts | Reporting |
| Dashboard widget meaning | Dashboard (business meaning still FE for KPIs) |

**Business Rules always own calculations** — even when `owner` is Dashboard for a widget explanation object, `business_owner` remains Financial Engine for KPI math.

Aligns with [OWNERSHIP.md](./OWNERSHIP.md).

---

## Future Compatibility

Representations and channels may be added without redesigning the object:

- Help Center, Orion Chat, Product Tooltips
- Documentation Portal, API Documentation
- Video References, Release Notes
- Multi-language (`locale`, `localized_*`)
- Context-aware Orion (same objects; different retrieval filters)

See [ROADMAP.md](./ROADMAP.md).
