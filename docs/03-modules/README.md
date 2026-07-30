# Modules

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

Module

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)
- [Module Template](../templates/MODULE_TEMPLATE.md)

---

Related Documents

- [Architecture](../02-architecture/README.md)
- [Widgets](../04-widgets/README.md)
- [Business](../01-business/)

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

Define how product module documentation is organized under `/docs/03-modules`.

---

Scope

Documentation rules for modules. No module product content.

---

## Module purpose (documentation layer)

A **module** doc describes one product capability boundary (routes, responsibilities, data dependencies). It is not a dump of all UI widgets or all API fields.

## Documentation scope

| In scope | Out of scope |
|----------|----------------|
| Module identity and boundaries | Full widget internals (link widgets) |
| Responsibilities / non-responsibilities | Cross-cutting architecture deep-dives (link architecture) |
| Entry routes and primary code paths | Invented future features |
| Links to business rules, KPIs, ADRs, APIs | Duplicating ADR text |

## Relationship with widgets

1. Modules may list related widgets.
2. Widget files live under `/docs/04-widgets/<category>/`.
3. Widget docs own UI-unit detail; module docs own the capability boundary.

## Relationship with architecture docs

1. Shared database, sync, security, and warehouse design live in `/docs/02-architecture/`.
2. Module docs link architecture; they do not replace it.
3. Module-specific constraints that change system design become ADRs.

## Naming

1. One file per module: `SCREAMING_SNAKE_CASE.md` (already present as skeletons).
2. Fill content later using [MODULE_TEMPLATE.md](../templates/MODULE_TEMPLATE.md).

## Index of skeleton modules

| File | Status |
|------|--------|
| `DASHBOARD.md` | Draft skeleton |
| `FINANCIAL_ENGINE.md` | Draft skeleton |
| `PRODUCT_ANALYTICS.md` | Draft skeleton |
| `INVENTORY.md` | Draft skeleton |
| `INVENTORY_HISTORY.md` | Draft skeleton |
| `PURCHASES.md` | Draft skeleton |
| `COST_MANAGEMENT.md` | Draft skeleton |
| `SMART_PRICING.md` | Draft skeleton |
| `REPORTS.md` | Draft skeleton |
| `SETTINGS.md` | Draft skeleton |
| `AUTHENTICATION.md` | Draft skeleton |
