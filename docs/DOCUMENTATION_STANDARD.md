# Documentation Standard

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

- [Documentation Lifecycle](./DOCUMENTATION_LIFECYCLE.md)
- [Documentation Metadata](./DOCUMENTATION_METADATA.md)
- [Cross Reference System](./CROSS_REFERENCE.md)
- [Quality Checklist](./QUALITY_CHECKLIST.md)

---

Related Documents

- [Start Here](./09-onboarding/START_HERE.md)
- [Project Map](./09-onboarding/PROJECT_MAP.md)

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

Define naming, structure, linking, metadata, and authorship rules for the Knowledge Base. This is a standard only — not product documentation.

---

Scope

All files under `/docs` Knowledge Base folders (`00-project` … `09-onboarding`), `/docs/templates`, and top-level Knowledge Base standards in `/docs`.

---

## Single source of truth

1. The Knowledge Base under `/docs` is the project’s documentation system of record.
2. Code comments may point to Knowledge Base paths; they must not replace them.
3. Conflicting informal notes elsewhere must be reconciled into the Knowledge Base or marked obsolete.

## Heading hierarchy

1. One H1 (`#`) — document title only.
2. H2 (`##`) — major sections.
3. H3 (`###`) — subsections under an H2.
4. Do not skip levels.
5. Prefer stable section titles suitable as anchors.

## Naming convention (mandatory)

**One convention for Knowledge Base documents: `SCREAMING_SNAKE_CASE.md`.**

| Kind | Pattern | Example |
|------|---------|---------|
| Standard / guide | `SCREAMING_SNAKE_CASE.md` | `DOCUMENTATION_STANDARD.md` |
| Module / architecture / business | `SCREAMING_SNAKE_CASE.md` | `SYSTEM_ARCHITECTURE.md` |
| Widget | `WIDGET_<NAME>.md` inside a category folder | `04-widgets/dashboard/WIDGET_NET_SALES.md` |
| ADR | `ADR-<NNN>-<SHORT_SLUG>.md` | `ADR-001-ESTIMATED-TAX-DUAL-MODEL.md` |
| Template | `*_TEMPLATE.md` under `/docs/templates` or ADR folder | `WIDGET_TEMPLATE.md` |
| Folder index | `README.md` or `INDEX.md` | `06-decisions/INDEX.md` |

Rules:

1. Use ASCII letters, digits, and underscores only in filenames (except ADR hyphens).
2. Do not use spaces, Title Case, or kebab-case for Knowledge Base document names.
3. Numbered folders (`00-project` … `09-onboarding`) define reading order; do not rename casually.
4. `99-legacy/` may retain historical kebab-case names; it is not part of the active Knowledge Base naming surface. See [99-legacy/README.md](./99-legacy/README.md).

## Folder roles (summary)

| Folder | Role |
|--------|------|
| `00-project` | Project identity, roadmap, changelog |
| `01-business` | Business model, accounting, KPIs, glossary |
| `02-architecture` | Cross-cutting system design |
| `03-modules` | Product modules |
| `04-widgets` | UI widgets by category |
| `05-api` | External / internal API surfaces |
| `06-decisions` | ADR index and records |
| `07-development` | Coding and AI contribution rules |
| `08-release` | Deploy, monitor, backup, production |
| `09-onboarding` | Navigation for humans and AI |
| `99-legacy` | Pre-KB / historical notes (not active SoT) |
| `templates` | Copy-paste skeletons |

## Document header

Every Knowledge Base document uses the metadata block defined in [DOCUMENTATION_METADATA.md](./DOCUMENTATION_METADATA.md).

Templates under `/docs/templates/` use the same block so copies inherit the standard.

## Markdown rules

1. Plain Markdown: headings, lists, tables, fenced code, links.
2. Fenced code blocks include a language tag when showing code or SQL.
3. Tables for catalogs, comparisons, and maps.
4. Short paragraphs; lists for procedures.
5. No secrets, tokens, or credentials.
6. Do not invent product knowledge — mark gaps as `TODO` or `TBD`.
7. Prefer relative links for Knowledge Base cross-references.

## Cross references

Follow [CROSS_REFERENCE.md](./CROSS_REFERENCE.md).

## Decisions (ADR)

Follow [06-decisions/INDEX.md](./06-decisions/INDEX.md) and [ADR_TEMPLATE.md](./06-decisions/ADR_TEMPLATE.md).

## Widgets

Follow [04-widgets/README.md](./04-widgets/README.md) and category folder READMEs.

## Modules

Follow [03-modules/README.md](./03-modules/README.md) and [MODULE_TEMPLATE.md](./templates/MODULE_TEMPLATE.md).

## Architecture

Follow [02-architecture/README.md](./02-architecture/README.md).

## Glossary

1. Canonical terms live in `01-business/GLOSSARY.md`.
2. One primary term per concept; list aliases.
3. Do not invent definitions — record approved terms only.

## Lifecycle and quality

1. Document status transitions: [DOCUMENTATION_LIFECYCLE.md](./DOCUMENTATION_LIFECYCLE.md).
2. Completeness gate: [QUALITY_CHECKLIST.md](./QUALITY_CHECKLIST.md).

## What this standard does not include

- Product feature explanations
- Business rule content
- Filled widget / module / API bodies

Those belong in later documentation sprints.
