# Legacy Documentation

---

Status

Deprecated

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

Legacy

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [Documentation Lifecycle](../DOCUMENTATION_LIFECYCLE.md)

---

Related Documents

- [Project Map](../09-onboarding/PROJECT_MAP.md)

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

Knowledge Base folders `00-project` … `09-onboarding` (not this folder)

---

Purpose

Quarantine pre–Knowledge Base documents that used mixed naming (kebab-case, Title-ish, sprint suffixes). Content is historical evidence — not the active documentation architecture.

---

Scope

Folder rules for legacy materials. Do not add new product docs here.

---

## Rules

1. **Do not treat files here as Production Knowledge Base** unless explicitly promoted into numbered folders with the metadata header and quality checklist.
2. **Do not invent** missing Knowledge Base content from legacy files without review.
3. **Naming exception:** filenames in this folder may remain kebab-case / historical names. New KB docs must use `SCREAMING_SNAKE_CASE.md`.
4. Prefer migrating durable facts into `00-project` … `09-onboarding` in later sprints, then archive or delete duplicates.
5. AI assistants: prefer Draft/Approved KB skeletons and standards over this folder when both exist.

## Contents (inventory)

| Path | Notes |
|------|-------|
| `*.md` at this folder root | Sprint notes, RCAs, architecture drafts, checklists |
| `project-log/` | Historical changelog materials |

## Promotion path

1. Choose target folder (`01-business`, `02-architecture`, etc.).
2. Create/update a `SCREAMING_SNAKE_CASE.md` from the correct template.
3. Copy only verified facts; mark status Draft → Review → Approved.
4. Link Related Documents back to the legacy source if useful for provenance.
5. Leave the legacy file here until promotion is Accepted, then mark Obsolete in a note or remove after sign-off.
