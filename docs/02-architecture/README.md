# Architecture

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

Architecture

---

Dependencies

- [Documentation Standard](../DOCUMENTATION_STANDARD.md)

---

Related Documents

- [Modules](../03-modules/README.md)
- [Business](../01-business/)
- [Decisions](../06-decisions/INDEX.md)
- [Widgets](../04-widgets/README.md)

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

Define what belongs in `/docs/02-architecture` and how it relates to other Knowledge Base layers. Canonical blueprint: [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) (Production).

---

Scope

Architecture documentation rules and index. Product architecture content lives in the Production documents linked below.

---

## Canonical architecture

[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) is the authoritative system architecture blueprint. Subsystem docs refine it; they must not contradict it.

## Canonical data platform

[HISTORICAL_DATA_WAREHOUSE.md](./HISTORICAL_DATA_WAREHOUSE.md) is the authoritative Historical Data Warehouse architecture (Production). Sync and database docs refine mechanisms; they must preserve its principles.

## Canonical synchronization

[SYNC_ENGINE.md](./SYNC_ENGINE.md) is the authoritative synchronization architecture (Production). It defines intake philosophy for the warehouse; it does not define accounting meaning or report composition.

## Canonical application architecture

[APPLICATION_ARCHITECTURE.md](./APPLICATION_ARCHITECTURE.md) is the authoritative Application Layer capability blueprint (Production). Module docs refine depth; they must not contradict it.

## Canonical domain model

[DOMAIN_MODEL.md](./DOMAIN_MODEL.md) is the authoritative Domain Model (Production). It defines business entities, identities, relationships, and domain rules. Glossary owns term definitions; Accounting Rules own money interpretation; this document owns entity shape and ownership in business language.

## Canonical data model

[DATA_MODEL.md](./DATA_MODEL.md) is the authoritative logical Data Model (Production). It bridges Domain Model entities and the physical database: data categories, persistence vs derivation, history vs live state, ownership, and read models — without schemas or SQL.

## Canonical reporting architecture

[REPORTING_ARCHITECTURE.md](./REPORTING_ARCHITECTURE.md) is the authoritative Reporting Architecture (Production). It defines how read models become analytical and management views: composition, KPI consistency, time honesty, auditability, and the rule that Reports never own data.

## Canonical integration architecture

[INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) is the authoritative Integration Architecture (Production). It defines how external systems attach as adapters: ownership transfer, sync decoupling, failure/trust posture, and extension without changing Domain or Reporting meaning.

## Canonical operational architecture

[OPERATIONAL_ARCHITECTURE.md](./OPERATIONAL_ARCHITECTURE.md) is the authoritative Operational Architecture (Production). It defines how the platform operates as a living system: onboarding, sync modes, verification-before-publication, trust states, audit workflow, and documentation-led change management — not DevOps or infrastructure.

## What belongs here

1. Cross-cutting system design (components, data flow, sync, warehouse, security).
2. Database overview and conventions (not per-row business semantics).
3. Diagrams and maps that span multiple modules.

## What does not belong here

1. Screen-by-screen UI or widget behavior → `/docs/04-widgets`, `/docs/03-modules`.
2. Accounting rules and KPI definitions → `/docs/01-business`.
3. One-off decision narratives → `/docs/06-decisions` (ADRs), with links from architecture.
4. Endpoint field dictionaries → `/docs/05-api`.
5. Invented future architecture presented as shipped.

## Relationship with Modules

1. Architecture describes shared foundations.
2. Modules describe product boundaries that consume those foundations.
3. Prefer links over copying.

## Relationship with Business

1. Business docs define meaning (money, KPIs, glossary).
2. Architecture docs define structure and technical constraints.
3. When a business rule forces a technical shape, record an ADR and link both sides.

## Relationship with Decision Records

1. Significant trade-offs become ADRs.
2. Architecture docs summarize the current accepted state and link ADRs.
3. Do not silently change Production architecture without an ADR when the change is consequential.

## Relationship with Widgets

1. Widgets are UI documentation, not architecture.
2. Architecture may mention presentation layers generically; widget files own specifics.

## Architecture documents

| File | Intent | Status |
|------|--------|--------|
| `SYSTEM_ARCHITECTURE.md` | End-to-end system blueprint | Production |
| `APPLICATION_ARCHITECTURE.md` | Application Layer capability blueprint | Production |
| `HISTORICAL_DATA_WAREHOUSE.md` | Data platform / warehouse architecture | Production |
| `SYNC_ENGINE.md` | Synchronization architecture | Production |
| `DATABASE.md` | Schema / data architecture | Draft skeleton |
| `SECURITY.md` | AuthN/Z, secrets, tenancy | Draft skeleton |
