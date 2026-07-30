# Administration Specification

---

Status

Production

---

Owner

Product Owner

---

Audience

- Product Owner
- Developers
- AI Assistants

---

Module

Administration

---

Category

Product

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Glossary](../01-business/GLOSSARY.md)
- [Business Model](../01-business/BUSINESS_MODEL.md)
- [Accounting Rules](../01-business/ACCOUNTING_RULES.md)
- [System Architecture](../02-architecture/SYSTEM_ARCHITECTURE.md)
- [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md)
- [Sync Engine](../02-architecture/SYNC_ENGINE.md)
- [Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)
- [Domain Model](../02-architecture/DOMAIN_MODEL.md)
- [Data Model](../02-architecture/DATA_MODEL.md)
- [Reporting Architecture](../02-architecture/REPORTING_ARCHITECTURE.md)
- [Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md)
- [Operational Architecture](../02-architecture/OPERATIONAL_ARCHITECTURE.md)
- [Monitoring Specification](./MONITORING_SPECIFICATION.md)

---

Related Documents

- [Security](../02-architecture/SECURITY.md)
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)
- [Product Specifications Index](./README.md)
- [KPI Catalog](../01-business/KPI_CATALOG.md)
- [Modules](../03-modules/README.md)
- [Decisions Index](../06-decisions/INDEX.md)

---

Related ADRs

—

---

Related Widgets

—

---

Version

1.0.0

---

Last Updated

2026-07-28

---

Review Frequency

On material change to tenancy, permissions model, or administrative governance

---

Source of Truth

This file (product behavior for Administration). Multi-tenant commercial reality and identity terms remain owned by [Glossary](../01-business/GLOSSARY.md) / [Business Model](../01-business/BUSINESS_MODEL.md). Deep security controls remain owned by Security Architecture (currently Draft — must not be contradicted when elevated). Permission Model details may mature in future dedicated documentation without redefining this product boundary.

---

Purpose

Define the canonical product specification for Administration: platform administration of Companies, Marketplace Accounts, users, permissions, configuration, business settings, and platform governance.

---

Scope

Product behavior for Administration only. No implementation, UI layout, database, or API design.

---

## 1. Purpose

### Why Administration exists

Administration exists so the seller-operator (and authorized administrators) can **govern the platform boundary**: which Companies and Marketplace Accounts exist, how credentials enable Sync, who may access what, which business settings apply (for example Tax Rate inputs where stewarded), and how tenancy isolation is preserved under Multi-Tenant Commercial Reality.

Without Administration, analytics modules cannot trust scope, Sync cannot be authorized, and permissions become informal. Administration enables the platform; it does not become Financial Analysis or Monitoring.

### Business value

1. Enforces Company / Marketplace Account tenancy.  
2. Enables credential stewardship for Sync without making secrets business entities.  
3. Defines who can see and change what (permissions).  
4. Holds business settings that affect readings without rewriting Accounting Rules.  
5. Provides governance hooks for Account Lifecycle and platform policy.

### Problems solved

1. Blended multi-account P&L without explicit scope.  
2. Unowned API keys / credential chaos.  
3. Unclear user access.  
4. Settings changed without accountability.  
5. Confusion between Seller ID, Marketplace Account, and Company.

---

## 2. Business Questions

- Which Companies exist and who owns them operationally?
- Which Marketplace Accounts belong to which Company?
- Which Marketplace and Seller ID metadata apply?
- Who are the users and what permissions do they have?
- Which business settings (Tax Rate, preferences) are in force for a scope?
- Are credentials present/healthy enough for Sync (without exposing secrets as KPIs)?
- What administrative actions are required for onboarding or Account Lifecycle?
- How do we govern access for partners/advisors vs seller-operators?

### Not answered here

- Sync Verification math → Monitoring / Sync Engine  
- Net Profit meaning → Accounting Rules / Financial Analysis  
- Full Security Architecture controls → Security doc (Draft → future Production)  
- Detailed Permission Model matrices → future permission documentation refining this boundary  

---

## 3. Scope

### Included

Company administration; Marketplace Account administration; user administration; permissions/access governance (product-level); configuration and business settings stewardship; credential stewardship boundaries; platform governance and Account Lifecycle admin hooks; tenancy isolation enforcement as product behavior.

### Not included

Redefining Accounting Rules; owning Commercial Performance; replacing Monitoring; inventing implementation auth stacks; treating API Key as a Glossary business KPI; Security deep-dive beyond product boundary references.

### Relationship to Security and Permission Model

Administration **product** defines what must be governable. Security Architecture and a future Permission Model refine enforcement mechanisms and detailed matrices. Until those are Production, Administration must still preserve tenancy and least-privilege intent in business language without prescribing protocols.

---

## 4. KPIs

### Company / Marketplace Account inventory

| Aspect | Definition |
|--------|------------|
| Business meaning | Count and status of tenant entities under administration |
| Management purpose | Know the governed commercial map |
| Supported decisions | Onboard, archive, correct tenancy |
| Dependencies | Glossary Company / Marketplace Account |

### Credential readiness (non-secret)

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether an account has usable credential stewardship state for Sync — never the secret itself |
| Management purpose | Unblock Sync operations |
| Supported decisions | Rotate/update credentials via governed process |
| Dependencies | Glossary API Key concept; Integration secrecy principles |

### User access coverage

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether users have explicit permissions for required scopes |
| Management purpose | Prevent informal access |
| Supported decisions | Grant/revoke/adjust access |
| Dependencies | Future Permission Model refinement |

### Settings completeness

| Aspect | Definition |
|--------|------------|
| Business meaning | Whether required business settings (for example Tax Rate input) are present for scoped readings |
| Management purpose | Avoid silent default fiction |
| Supported decisions | Complete settings before decision-grade tax estimates |
| Dependencies | Glossary Tax Rate; Accounting estimation discipline |

### Governance action backlog

| Aspect | Definition |
|--------|------------|
| Business meaning | Outstanding admin tasks (onboarding, access reviews, credential renewals) |
| Management purpose | Keep platform governable |
| Supported decisions | Prioritize admin work |
| Dependencies | Account Lifecycle / Operational hooks |

---

## 5. Business Capabilities

1. **Company stewardship** — create/maintain Company boundary.  
2. **Marketplace Account stewardship** — attach selling identities to Companies.  
3. **User administration** — manage who participates.  
4. **Permissions governance** — who may view/act in which scope.  
5. **Business settings** — steward inputs like Tax Rate without redefining tax meaning.  
6. **Credential stewardship boundaries** — enable Sync safely; secrets are not report metrics.  
7. **Platform governance** — policies for onboarding, lifecycle, and access review.  
8. **Tenancy enforcement support** — ensure analytics scopes remain isolatable.

---

## 6. Analysis Perspectives

Company; Marketplace; Marketplace Account; User; Permission role/profile (business-level); Settings domain; Lifecycle stage of account.

---

## 7. User Workflows

Daily: credential/access exceptions.  
Weekly: access review for active accounts.  
Monthly: settings and tenancy audit; onboarding health.  
Onboarding: Company → Marketplace Account → credentials → settings → hand off to Sync/Monitoring.  
Exception: compromised credential posture → revoke/rotate → verify Monitoring readiness.  
Governance: permission changes recorded as administrative intent; consequential financial setting changes respect Accounting change management when they alter estimates.

---

## 8. Filters

Company; Marketplace; Marketplace Account; user; permission state; credential readiness; settings completeness; lifecycle stage.

---

## 9. Drill-down Principles

Company → Marketplace Accounts → users/permissions/settings/credentials (non-secret). Seller ID remains metadata, not the account itself. Tax Rate setting drill-down does not become Estimated Tax P&L. Admin drill-down never opens raw secrets as analytics.

---

## 10. Dependencies

Application Architecture Administration capability; Domain Model Company/Marketplace Account; Integration Architecture credential secrecy; Operational Architecture Account Lifecycle; Monitoring for readiness after admin changes; Security Architecture (Draft) as related enforcement owner.

---

## 11. Module-specific Business Rules

1. **Company owns Marketplace Accounts — never the reverse.**  
2. **Marketplace ≠ Marketplace Account ≠ Seller ID.**  
3. **API Key/credentials are not business KPIs;** readiness may be shown without exposing secrets ([Integration Architecture](../02-architecture/INTEGRATION_ARCHITECTURE.md)).  
4. **Tenancy isolation is an accounting boundary** as well as an admin boundary ([Accounting Rules](../01-business/ACCOUNTING_RULES.md)).  
5. **Settings do not redefine Accounting Rules** — they supply inputs (for example Tax Rate).  
6. **Permissions must be explicit** — informal shared access is a defect.  
7. **Administration does not invent Net Profit dialects.**  
8. **Security/Permission Model evolution** must refine, not contradict, these product boundaries.  
9. **Account Lifecycle admin hooks** distinguish initialization vs ongoing operations.  
10. **Consequential setting changes** that alter financial estimates follow change-management expectations.

---

## 12. Success Criteria

Administrators can govern Companies, Marketplace Accounts, users, permissions, settings, and credential readiness so every analytics module operates under explicit tenancy and access — without Administration becoming an analytics or security-protocol manual.

---

## 13. Out of Scope

Implementation, UI, database, SQL, APIs, services, infrastructure, frontend/backend, protocol-level security design (belongs in Security Architecture), exhaustive permission matrices (future Permission Model).

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Administration |
| Last Updated | 2026-07-28 |
| Program step | STEP 9 of Product Specification Program |
