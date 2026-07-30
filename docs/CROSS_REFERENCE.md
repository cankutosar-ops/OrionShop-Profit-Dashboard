# Cross Reference System

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

---

Related Documents

- [Documentation Lifecycle](./DOCUMENTATION_LIFECYCLE.md)

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

Define how Knowledge Base documents link to each other so humans and AI assistants can navigate without duplicated content.

---

Scope

Linking syntax and required “Related …” sections. Examples are illustrative only — not product facts.

---

## Principles

1. Prefer relative Markdown links within `/docs`.
2. Link instead of copying long explanations.
3. Every filled document (beyond Draft skeleton) should declare its relationships explicitly.
4. Missing relationships use `—` or `TODO`, never invented targets.

## Required relationship sections

Near the end of a filled document (after body content), include these H2 sections when applicable. Omit a section only if Category makes it irrelevant (e.g. a pure standards doc may omit Related Reports).

### Related Modules

```markdown
## Related Modules

- [Dashboard](../03-modules/DASHBOARD.md)
- [Inventory](../03-modules/INVENTORY.md)
```

### Related Widgets

```markdown
## Related Widgets

- [Example Widget](../04-widgets/dashboard/WIDGET_EXAMPLE.md)
```

### Related ADRs

```markdown
## Related ADRs

- [ADR-001 Short Title](../06-decisions/ADR-001-SHORT-TITLE.md)
```

### Related APIs

```markdown
## Related APIs

- [Wildberries Analytics API](../05-api/WILDBERRIES_ANALYTICS_API.md)
- [Internal API](../05-api/INTERNAL_API.md)
```

### Related Database Tables

```markdown
## Related Database Tables

- `example_table` — see [Database](../02-architecture/DATABASE.md)
```

Use backticks for table names. Link architecture docs for schema detail.

### Related Business Rules

```markdown
## Related Business Rules

- [Accounting Rules](../01-business/ACCOUNTING_RULES.md) — section TODO
```

### Related KPIs

```markdown
## Related KPIs

- [KPI Catalog](../01-business/KPI_CATALOG.md) — KPI id TODO
```

### Related Reports

```markdown
## Related Reports

- [Reports module](../03-modules/REPORTS.md)
```

## Header vs body

| Location | Use for |
|----------|---------|
| Metadata header (`Related Documents` / `Related ADRs` / `Related Widgets`) | Quick navigation; keep short |
| Body “Related …” sections | Complete map for AI and reviewers |

Keep them consistent when both exist.

## Link path rules

1. From `03-modules/FOO.md` to architecture: `../02-architecture/DATABASE.md`
2. From `04-widgets/dashboard/WIDGET_X.md` to module: `../../03-modules/DASHBOARD.md`
3. From top-level standards to onboarding: `./09-onboarding/START_HERE.md`
4. Visible label should be human-readable; path must be correct relative to the file.

## Anti-patterns

1. Absolute machine paths (`C:\…`).
2. Broken or speculative links to documents that do not exist.
3. Duplicating ADR text inside modules instead of linking.
4. Linking only in prose without a Related section when the doc is Approved/Production.
