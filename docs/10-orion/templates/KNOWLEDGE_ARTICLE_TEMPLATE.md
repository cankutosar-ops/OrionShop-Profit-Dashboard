# Knowledge Article Template

Copy to `docs/10-orion/articles/<PREFIX>/<ID>-<short-slug>.md` in a **content** sprint.

Do **not** invent product facts. Leave placeholders until verified against Tier 1 sources.

This file is the **canonical structure**. Every Orion Knowledge article must follow it exactly (section order and headings).

---

## Orion Metadata

id

TODO — e.g. FE-001

---

title

TODO

---

module

TODO — e.g. Financial Engine

---

category

TODO — definition | calculation | architecture | data | process | policy | comparison | faq

---

owner

TODO

---

business owner

TODO

---

technical owner

TODO

---

version

0.1.0

---

status

draft

---

confidence

TODO — Verified | Derived | Implementation | Unknown

---

last updated

TODO — YYYY-MM-DD

---

tags

TODO — comma-separated, e.g. net-profit, commercial-performance

---

## Business Rule

State the normative rule in plain language.

If this article is not rule-bearing, write: `N/A — see Related Knowledge / ADR References.`

Cite Tier 1 sources by path or registry id.

TODO

---

## Explanation

Explain the rule for operators and developers without adding unsourced claims.

TODO

---

## Formula

If the topic has a formula, write it explicitly.

If none: `N/A`

```text
TODO
```

Formulas must match cited Business Rules / Financial Engine docs. Orion articles do not invent math.

---

## Data Sources

List datasets, tables, APIs, or KPI inputs the topic depends on (descriptive).

| Source | Role |
|---|---|
| TODO | TODO |

If none: `N/A`

---

## Dependencies

### Business Rules

- TODO — path or registry id

### Architecture Decisions

- TODO — ADR id or `N/A`

### Related Documents

- TODO — Tier 2 docs or `N/A`

### Implementation

- TODO — code paths (Tier 3) or `N/A`

Label clearly: implementation illustrates; it does not override Business Rules.

---

## Exceptions

Document dual models, known exclusions, or scoped caveats (e.g. Estimated Tax reporting vs Smart Pricing).

If none: `None.`

TODO

---

## Examples

Concrete, non-secret examples. Prefer illustrative numbers labeled as examples — not live production extracts unless from an approved verification report.

If none: `N/A`

TODO

---

## Related Knowledge

List other Knowledge IDs only:

- TODO — e.g. FE-002

If none: `None.`

---

## ADR References

- TODO — e.g. ADR-012 or `N/A`

---

## Verification

How this knowledge was / can be checked (verify scripts, sprint PASS reports, dual-read checks).

| Evidence | Result |
|---|---|
| TODO | TODO |

If none yet: `Pending — do not set confidence to Verified without evidence or Tier 1 citation.`

---

## Confidence

Restate the article confidence and one-line justification.

**Confidence:** TODO

**Why this level:** TODO

---

## Change Log

| Version | Date | Note |
|---|---|---|
| 0.1.0 | TODO | Draft from template |
