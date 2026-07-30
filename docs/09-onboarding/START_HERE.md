# Start Here

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

Onboarding

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [Project Map](./PROJECT_MAP.md)

---

Related Documents

- [Documentation Lifecycle](../DOCUMENTATION_LIFECYCLE.md)
- [Cross Reference System](../CROSS_REFERENCE.md)
- [Quality Checklist](../QUALITY_CHECKLIST.md)

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

Teach AI assistants and humans **how to learn from this Knowledge Base** — navigation and reading order only. Not a product overview.

---

Scope

Knowledge Base navigation. No project-specific product facts.

---

## Rules for AI assistants

1. Treat `/docs` as the documentation system of record.
2. Prefer **Approved** / **Production** docs over **Draft** skeletons.
3. Draft skeletons with `TODO` are placeholders — do not invent content to fill them.
4. Follow links via [CROSS_REFERENCE.md](../CROSS_REFERENCE.md); do not assume undocumented relationships.
5. For decisions, use `/docs/06-decisions/INDEX.md` and ADR files — do not invent ADRs.
6. Before answering product questions, locate the owning layer (Business → Architecture → Modules → Widgets → APIs).
7. If a required document is still Draft/TODO, say what is missing instead of guessing.

## Canonical reading order

Learn the Knowledge Base in this sequence. Skip empty Draft bodies; still note that the slot exists.

```text
1. PROJECT (00-project)
   PROJECT_DNA → PROJECT_ROADMAP → CHANGELOG
        ↓
2. BUSINESS (01-business)
   BUSINESS_MODEL → ACCOUNTING_RULES → KPI_CATALOG → GLOSSARY
        ↓
3. ARCHITECTURE (02-architecture)
   SYSTEM_ARCHITECTURE → DATABASE → SYNC_ENGINE → HISTORICAL_DATA_WAREHOUSE → SECURITY
        ↓
4. MODULES (03-modules)
   Module README → individual module files as needed
        ↓
5. WIDGETS (04-widgets)
   Widgets README → category README → WIDGET_* files as needed
        ↓
6. APIs (05-api)
   API README → surface files as needed
        ↓
7. DECISIONS (06-decisions)
   INDEX → ADR-* files
        ↓
8. DEVELOPMENT (07-development)
   CODING_STANDARDS → ARCHITECTURE_RULES → AI_GUIDELINES
        ↓
9. RELEASE (08-release)
   PRODUCTION_CHECKLIST → DEPLOYMENT → MONITORING → BACKUP
```

## Orientation files (read first among standards)

1. [PROJECT_MAP.md](./PROJECT_MAP.md) — hierarchy map
2. [DOCUMENTATION_STANDARD.md](../DOCUMENTATION_STANDARD.md) — naming and authorship
3. [DOCUMENTATION_METADATA.md](../DOCUMENTATION_METADATA.md) — header fields
4. [DOCUMENTATION_LIFECYCLE.md](../DOCUMENTATION_LIFECYCLE.md) — status meanings
5. [QUALITY_CHECKLIST.md](../QUALITY_CHECKLIST.md) — completeness gate

## How to answer a question (generic algorithm)

1. Identify the question type: business / architecture / module / widget / API / decision / process.
2. Open the matching folder README.
3. Open the specific doc if it is not Draft-empty.
4. Follow Related ADRs / Modules / APIs links.
5. If Draft-only, report gap; do not fabricate.

## What not to do

1. Do not treat chat history as source of truth over Production docs.
2. Do not write product documentation into skeletons during navigation.
3. Do not skip ADR index when the topic is a historical choice.
4. Do not treat `/docs/99-legacy/` as the active Knowledge Base — use it only for provenance until content is promoted.
