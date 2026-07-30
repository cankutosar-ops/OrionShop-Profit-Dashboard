# Documentation Metadata

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
- [Documentation Lifecycle](./DOCUMENTATION_LIFECYCLE.md)

---

Related Documents

- [Cross Reference System](./CROSS_REFERENCE.md)

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

Define the mandatory metadata header for every Knowledge Base document. Fields are designed only — not populated with product facts.

---

Scope

All Knowledge Base markdown documents and templates.

---

## Required header block

Use this exact field order after the H1 title. Separate sections with a horizontal rule (`---`).

```markdown
# <Document Title>

---

Status

<Draft | Review | Approved | Production | Deprecated | Archived>

---

Owner

<TBD | role or name>

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

<module key | — >

---

Category

<Project | Business | Architecture | Module | Widget | API | Decision | Development | Release | Onboarding | Standards | Template>

---

Dependencies

- <link or —>

---

Related Documents

- <link or —>

---

Related ADRs

- <link or —>

---

Related Widgets

- <link or —>

---

Version

<semver or 0.1.0>

---

Last Updated

<YYYY-MM-DD | TODO>

---

Review Frequency

<e.g. Quarterly | On change | TODO>

---

Source of Truth

<This file | path | system of record>

---

Purpose

<one short paragraph or TODO>

---

Scope

<what this doc covers / excludes or TODO>

---
```

## Field definitions

| Field | Meaning | Empty value |
|-------|---------|-------------|
| Status | Lifecycle state (see Documentation Lifecycle) | `Draft` |
| Owner | Accountable human or role | `TBD` |
| Audience | Who the doc is written for | Keep the three bullets unless scoped narrower |
| Module | Owning product module key (e.g. `inventory`) | `—` if cross-cutting |
| Category | Knowledge Base layer / doc type | Required |
| Dependencies | Docs or systems that must exist first | `—` |
| Related Documents | Peer docs (non-ADR) | `—` |
| Related ADRs | Decision records | `—` |
| Related Widgets | Widget docs | `—` |
| Version | Document version, not app version | `0.1.0` when Draft |
| Last Updated | Calendar date of last substantive edit | `TODO` until first real edit |
| Review Frequency | How often to re-validate | `TODO` until approved |
| Source of Truth | Where the authoritative statement lives | Prefer `This file` or an explicit path |
| Purpose | Why the document exists | `TODO` until filled |
| Scope | Boundaries | `TODO` until filled |

## Rules

1. Do not omit required fields — use `TODO`, `TBD`, or `—`.
2. Do not invent product values to “look complete.”
3. Templates must include the full block so copies stay consistent.
4. Indexes (`README.md`, `INDEX.md`) use the same block.
5. Cross-reference body sections (Related Modules, Related APIs, etc.) follow [CROSS_REFERENCE.md](./CROSS_REFERENCE.md) in addition to this header.
