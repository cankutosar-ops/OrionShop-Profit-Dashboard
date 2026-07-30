# Widgets

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

Widget

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [Widget Template](../templates/WIDGET_TEMPLATE.md)

---

Related Documents

- [Modules](../03-modules/README.md)
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

Define how widget documentation is organized. This folder holds documentation architecture only until widget docs are written in later sprints.

---

Scope

Structure, naming, and rules for `/docs/04-widgets`. No widget product documentation.

---

## What belongs here

1. One markdown file per UI widget, placed in a **category folder**.
2. Category `README.md` files that define what goes in that folder.
3. Links from widgets to modules, APIs, ADRs, and architecture — not copies of those docs.

## What does not belong here

1. Module-level product explanations (use `/docs/03-modules`).
2. System architecture (use `/docs/02-architecture`).
3. Business rules or KPI definitions (use `/docs/01-business`).
4. Invented widgets that do not exist in code.

## Category folders

| Folder | Belongs here |
|--------|----------------|
| `dashboard/` | Dashboard surface widgets |
| `finance/` | Finance / settlement / fees widgets |
| `inventory/` | Inventory and stock widgets |
| `reports/` | Report and export widgets |
| `pricing/` | Smart Pricing / pricing widgets |
| `shared/` | Reusable widgets used across modules |

## Naming

1. File: `WIDGET_<NAME>.md` (SCREAMING_SNAKE_CASE after prefix).
2. Example placeholder name only: `WIDGET_EXAMPLE.md` (do not create until the widget exists).
3. Copy [WIDGET_TEMPLATE.md](../templates/WIDGET_TEMPLATE.md).

## Relationship to modules

1. Each widget doc declares its parent module.
2. Module docs may list widgets; they must not duplicate widget internals.

## Scalability

1. Add a new category folder only when a clear domain cluster appears.
2. Prefer `shared/` over duplicating the same widget under multiple categories.
3. Keep one file per widget — split only if a widget becomes a multi-file subsystem (rare).
