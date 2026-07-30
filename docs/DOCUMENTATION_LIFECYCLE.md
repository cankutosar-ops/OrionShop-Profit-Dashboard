# Documentation Lifecycle

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

Standards

---

Dependencies

- [Documentation Standard](./DOCUMENTATION_STANDARD.md)
- [Documentation Metadata](./DOCUMENTATION_METADATA.md)
- [Quality Checklist](./QUALITY_CHECKLIST.md)

---

Related Documents

- [Start Here](./09-onboarding/START_HERE.md)

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

Define document lifecycle states and allowed transitions for the Knowledge Base.

---

Scope

Status field values and process. Does not contain product content.

---

## States

| Status | Meaning |
|--------|---------|
| Draft | Skeleton or work in progress; may contain `TODO` |
| Review | Content proposed; awaiting owner / peer review |
| Approved | Reviewed and accepted; not yet treated as production-critical |
| Production | Active source of truth for the topic; must stay accurate |
| Deprecated | Still readable but must not guide new work |
| Archived | Historical only; retained for audit, not day-to-day navigation |

## Transitions

```text
Draft ──► Review ──► Approved ──► Production
  │          │           │            │
  │          │           │            ├──► Deprecated ──► Archived
  │          │           └──► Deprecated ──► Archived
  │          └──► Draft (changes requested)
  └──► Archived (abandoned before approval)
```

| From | To | When |
|------|----|------|
| Draft | Review | Author believes content is complete enough for review |
| Review | Draft | Reviewer requests changes |
| Review | Approved | Reviewer / Owner accepts |
| Approved | Production | Topic is relied on operationally |
| Production | Deprecated | Superseded or no longer correct; replacement linked |
| Deprecated | Archived | No longer needed in active indexes |
| Any pre-Production | Archived | Explicitly abandoned |

## Rules

1. Only `Production` docs should be treated as binding for implementation without double-checking code.
2. Moving to `Review` or beyond requires the [Quality Checklist](./QUALITY_CHECKLIST.md) to be considered.
3. `Deprecated` and `Archived` docs must state the replacement link when one exists.
4. ADR lifecycle (Proposed / Accepted / …) is defined separately in [06-decisions/INDEX.md](./06-decisions/INDEX.md); map ADR Accepted ≈ Approved/Production for knowledge purposes.
5. Do not delete history casually — prefer Deprecated → Archived.

## Ownership

1. Owner field must be set before `Approved`.
2. Owner is accountable for Review Frequency and accuracy after Production.
