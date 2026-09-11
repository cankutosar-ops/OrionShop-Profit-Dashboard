# ADR-013 — Orion Knowledge Materialization Framework

---

Status

Accepted

---

Owner

Platform Architecture

---

Module

Orion

---

Category

Decision

---

Dependencies

- [ADR-012 Orion Knowledge Foundation](./ADR-012-orion-knowledge-foundation.md)
- [Knowledge Article Standard](../10-orion/KNOWLEDGE_ARTICLE_STANDARD.md)

---

## Context

Sprint 12.0 defined Orion’s hierarchy, registry, retrieval, and confidence model. Before writing knowledge content, the platform needs a **single canonical article format**, stable IDs, metadata, and relationship rules.

## Decision

Adopt the Orion Knowledge Materialization Framework:

1. Stable Knowledge IDs (`FE-001`, `WH-001`, `ADM-001`, …) that never change once published.
2. Required metadata: id, title, module, category, owner, business owner, technical owner, version, status, confidence, last updated, tags.
3. Canonical article sections in fixed order (Business Rule → Explanation → Formula → Data Sources → Dependencies → Exceptions → Examples → Related Knowledge → ADR References → Verification → Confidence).
4. Relationship chain: Business Rules → Architecture Decisions → Related Documents → Implementation → Verification Reports.

## Consequences

- Future content sprints copy one template only.
- Articles remain compatible with 12.0 confidence/citation contracts.
- No application code changes in 12.1.
- No knowledge body content authored in 12.1.

## References

- `docs/10-orion/KNOWLEDGE_ARTICLE_STANDARD.md`
- `docs/10-orion/templates/KNOWLEDGE_ARTICLE_TEMPLATE.md`
