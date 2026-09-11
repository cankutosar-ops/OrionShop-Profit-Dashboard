# Knowledge ID Specification

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

- [Knowledge Article Standard](./KNOWLEDGE_ARTICLE_STANDARD.md)
- [Ownership Model](./OWNERSHIP.md)

---

## Purpose

Every Orion Knowledge article has a **stable Knowledge ID**.

**IDs must never change** once published (`status` may leave `draft`).

---

## Format

```text
<PREFIX>-<NNN>
```

| Part | Rules |
|---|---|
| `PREFIX` | 2–5 uppercase letters from the prefix table |
| `-` | Literal hyphen |
| `NNN` | Zero-padded decimal, starting at `001`, monotonic per prefix |

### Examples

| ID | Domain |
|---|---|
| `FE-001` | Financial Engine |
| `WH-001` | Warehouse |
| `ADM-001` | Administration |
| `REP-001` | Reporting |
| `SP-001` | Smart Pricing |
| `ARCH-001` | Architecture / cross-cutting |
| `DASH-001` | Dashboard |
| `SEC-001` | Security |
| `BIZ-001` | Business / glossary / cross-KPI |

---

## Prefix Table

| Prefix | Domain | Knowledge owner |
|---|---|---|
| `FE` | Financial Engine | Financial Engine |
| `WH` | Warehouse Platform | Warehouse Platform |
| `ADM` | Administration | Administration |
| `REP` | Reporting | Reporting |
| `SP` | Smart Pricing | Smart Pricing |
| `DASH` | Dashboard | Dashboard |
| `SEC` | Security / Auth / Secrets | Security / Platform Architecture |
| `ARCH` | Platform architecture / Orion / boundaries | Platform Architecture |
| `BIZ` | Business model, glossary, shared KPI language | Product Owner (+ FE when calculation) |
| `SYNC` | Sync engine / verification (non-warehouse-specific) | Platform Architecture |
| `API` | API contract knowledge | Platform Architecture |
| `DATA` | Schema / data-model knowledge | Platform Architecture |

New prefixes require an ADR update to this table. Do not invent ad-hoc prefixes in content sprints.

---

## Allocation Rules

1. **Monotonic per prefix** — next ID = max existing `NNN` for that prefix + 1.
2. **Never reuse** a retired ID; mark article `deprecated` / `superseded` instead.
3. **Never renumber** to “fill gaps.”
4. **One article ↔ one primary ID** — secondary aliases are forbidden; use relationships.
5. **Draft IDs** may be reserved in a future registry index; once `status` ≠ `draft`, the ID is permanent.
6. Knowledge ID is **independent** of registry source `id` slugs (e.g. `fe.financial-engine`). Articles may *cite* registry sources; they do not replace them.

---

## Filename Convention (Future Content)

When articles are materialized as files:

```text
docs/10-orion/articles/<PREFIX>/<PREFIX>-<NNN>-<short-slug>.md
```

Example (not created in 12.1):

```text
docs/10-orion/articles/FE/FE-001-net-profit.md
```

The **ID inside metadata** is authoritative; the filename slug is cosmetic.

---

## Extensibility

- New domains → new prefix via ADR
- Multi-language variants share the **same Knowledge ID** and differ by `locale` metadata (see Metadata Model)
- Version bumps do **not** change the Knowledge ID
