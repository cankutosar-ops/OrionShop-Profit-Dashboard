# Shared Widgets

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

- [Widgets root](../README.md)
- [Widget Template](../../templates/WIDGET_TEMPLATE.md)

---

Related Documents

- [Modules](../../03-modules/README.md)

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

Define what widget documentation may live in `04-widgets/shared/`.

---

Scope

Folder rules only. No widget documentation content.

---

## What belongs in this folder

Widget docs for reusable UI units used by more than one module or surface.

## Documentation rules

1. One file per widget: `WIDGET_<NAME>.md`.
2. Copy `/docs/templates/WIDGET_TEMPLATE.md`.
3. List consuming modules under Related Modules in the widget file (when written).
4. If a widget is only used in one domain, prefer that domain folder instead of `shared/`.
5. Do not invent widgets.

## Naming conventions

- `WIDGET_<NAME>.md`
- SCREAMING_SNAKE_CASE after `WIDGET_`
