# Quality Checklist

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

---

Related Documents

- [Documentation Standard](./DOCUMENTATION_STANDARD.md)

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

Define the completeness gate for Knowledge Base documents. A document is not considered complete until the checklist items below are answered (or explicitly marked N/A with reason).

---

Scope

Quality criteria only. Does not contain product documentation.

---

## Completeness checklist

A document may move to **Review** / **Approved** / **Production** only when each item is addressed:

| # | Question | Pass criteria |
|---|----------|----------------|
| 1 | **What** | States what the subject is |
| 2 | **Why** | States why it exists or matters |
| 3 | **Who** | States audience and owner |
| 4 | **When** | States timing, cadence, or applicability window (or N/A) |
| 5 | **Where** | States location in product / codebase / KB (paths or routes) |
| 6 | **Dependencies** | Lists upstream docs/systems or `—` |
| 7 | **Edge Cases** | Notes non-happy-path behavior or N/A |
| 8 | **Limitations** | States known limits or N/A |
| 9 | **Future Improvements** | Optional backlog notes or `—` |
| 10 | **Source of Truth** | Declares authoritative source |
| 11 | **Related Decisions** | Links ADRs or `—` |

## Metadata gate

Header fields from [DOCUMENTATION_METADATA.md](./DOCUMENTATION_METADATA.md) are present and not left blank (use `TODO` / `TBD` / `—` only where allowed).

## Cross-reference gate

Required Related sections from [CROSS_REFERENCE.md](./CROSS_REFERENCE.md) exist for the document Category, or are explicitly N/A.

## Anti-patterns (fail)

1. Invented business rules or API behavior.
2. Broken links.
3. Duplicate of another Production doc without linking.
4. Status `Production` with unresolved `TODO` in critical sections.

## Usage

1. Authors self-check before requesting Review.
2. Reviewers verify the checklist.
3. AI assistants should refuse to treat Draft skeletons as product truth.
