# Architecture Decisions Index

---

Status

Draft

---

Owner

TBD

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

—

---

Category

Decision

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [ADR Template](./ADR_TEMPLATE.md)
- [Decision Template](../templates/DECISION_TEMPLATE.md)

---

Related Documents

- [Architecture](../02-architecture/README.md)

---

Related ADRs

—

---

Related Widgets

—

---

Version

0.2.0

---

Last Updated

TODO

---

Review Frequency

TODO

---

Source of Truth

This file

---

Purpose

Define the ADR process, numbering, categories, and lifecycle. This index lists decision records when they exist — it does not contain product decisions yet.

---

Scope

ADR system architecture only. No real ADR body content in this sprint.

---

## Numbering convention

1. Format: `ADR-<NNN>-<SHORT_SLUG>.md`
2. `<NNN>` is a zero-padded integer: `001`, `002`, …
3. `<SHORT_SLUG>` is `SCREAMING-SNAKE` or hyphenated uppercase tokens describing the topic.
4. Example pattern only: `ADR-001-EXAMPLE-TOPIC.md`
5. Numbers are assigned monotonically; do not reuse numbers.
6. Next number = highest existing `NNN` + 1 (start at `001` when none exist).

## Reserved categories

Use one primary category tag inside each ADR metadata table:

| Category | Use for |
|----------|---------|
| `architecture` | System structure, boundaries, data flow |
| `data` | Schema, persistence, warehouse |
| `sync` | Ingestion, backfill, reconciliation |
| `business-rule` | Accounting / KPI interpretation that constrains code |
| `security` | Auth, secrets, tenancy |
| `api` | External/internal API contracts |
| `ux` | Interaction patterns that constrain implementation |
| `process` | Engineering or release process decisions |
| `other` | Does not fit above (explain why) |

## Lifecycle

| Status | Meaning |
|--------|---------|
| Proposed | Under discussion |
| Accepted | Approved for implementation / current truth |
| Deprecated | No longer preferred; still readable |
| Superseded | Replaced by another ADR (link required) |
| Rejected | Considered and not adopted |

### Transitions

```text
Proposed ──► Accepted
Proposed ──► Rejected
Accepted ──► Deprecated
Accepted ──► Superseded (new ADR)
Deprecated ──► Superseded (optional clarification)
```

Rules:

1. Superseded ADRs must link `Superseded by`.
2. New ADR that replaces an old one must link `Supersedes`.
3. Do not edit Accepted ADRs to change the decision — write a new ADR.

## How to create an ADR

1. Copy `ADR_TEMPLATE.md`.
2. Name file per numbering convention.
3. Set Status to `Proposed`.
4. Add a row to the registry below when the file exists.
5. Move Status to `Accepted` only after decision.

## Registry

| ADR | Title | Category | Status |
|-----|-------|----------|--------|
| [ADR-012](./ADR-012-orion-knowledge-foundation.md) | Orion Knowledge Foundation | architecture | Accepted |
| [ADR-013](./ADR-013-orion-knowledge-materialization.md) | Orion Knowledge Materialization Framework | architecture | Accepted |
| [ADR-014](./ADR-014-orion-knowledge-object-model.md) | Orion Knowledge Object Model | architecture | Accepted |
| [ADR-015](./ADR-015-orion-knowledge-materialization-pipeline.md) | Orion Knowledge Materialization Pipeline | architecture | Accepted |
| [ADR-016](./ADR-016-finance-reports-v1-incremental-sync.md) | Finance Reports/V1 Incremental Sync | sync | Accepted |

## Templates

- Architecture Decision Record: [ADR_TEMPLATE.md](./ADR_TEMPLATE.md)
- General decision (non-architecture): [DECISION_TEMPLATE.md](../templates/DECISION_TEMPLATE.md)
