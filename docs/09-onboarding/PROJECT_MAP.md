# Project Map

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
- [Start Here](./START_HERE.md)

---

Related Documents

- [Documentation Metadata](../DOCUMENTATION_METADATA.md)
- [Decisions Index](../06-decisions/INDEX.md)

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

Visually describe the Knowledge Base hierarchy so humans and AI can locate the correct layer quickly.

---

Scope

Documentation map only. No product documentation.

---

## Hierarchy

```text
docs/
├── DOCUMENTATION_STANDARD.md
├── DOCUMENTATION_METADATA.md
├── DOCUMENTATION_LIFECYCLE.md
├── CROSS_REFERENCE.md
├── QUALITY_CHECKLIST.md
│
├── 00-project/                  # Project identity
│   ├── README.md
│   ├── PROJECT_DNA.md
│   ├── PROJECT_ROADMAP.md
│   └── CHANGELOG.md
│
├── 01-business/                 # Business meaning
│   ├── README.md
│   ├── BUSINESS_MODEL.md
│   ├── ACCOUNTING_RULES.md
│   ├── KPI_CATALOG.md
│   └── GLOSSARY.md
│
├── 02-architecture/             # Cross-cutting design
│   ├── README.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── APPLICATION_ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── SYNC_ENGINE.md
│   ├── HISTORICAL_DATA_WAREHOUSE.md
│   └── SECURITY.md
│
├── 03-modules/                  # Product modules
│   ├── README.md
│   ├── DASHBOARD.md
│   ├── FINANCIAL_ENGINE.md
│   ├── PRODUCT_ANALYTICS.md
│   ├── INVENTORY.md
│   ├── INVENTORY_HISTORY.md
│   ├── PURCHASES.md
│   ├── COST_MANAGEMENT.md
│   ├── SMART_PRICING.md
│   ├── REPORTS.md
│   ├── SETTINGS.md
│   └── AUTHENTICATION.md
│
├── 04-widgets/                  # UI widgets by category
│   ├── README.md
│   ├── dashboard/
│   │   └── README.md
│   ├── finance/
│   │   └── README.md
│   ├── inventory/
│   │   └── README.md
│   ├── reports/
│   │   └── README.md
│   ├── pricing/
│   │   └── README.md
│   └── shared/
│       └── README.md
│
├── 05-api/                      # API surfaces
│   ├── README.md
│   ├── WILDBERRIES_ANALYTICS_API.md
│   ├── WILDBERRIES_FINANCE_API.md
│   ├── WILDBERRIES_CONTENT_API.md
│   └── INTERNAL_API.md
│
├── 06-decisions/                # ADR system
│   ├── README.md
│   ├── INDEX.md
│   ├── ADR_TEMPLATE.md
│   └── ADR-NNN-….md             # (none yet)
│
├── 07-development/              # Engineering standards
│   ├── README.md
│   ├── CODING_STANDARDS.md
│   ├── ARCHITECTURE_RULES.md
│   └── AI_GUIDELINES.md
│
├── 08-release/                  # Production operations
│   ├── README.md
│   ├── PRODUCTION_CHECKLIST.md
│   ├── DEPLOYMENT.md
│   ├── MONITORING.md
│   └── BACKUP.md
│
├── 09-onboarding/               # Navigation
│   ├── README.md
│   ├── START_HERE.md
│   └── PROJECT_MAP.md
│
├── 99-legacy/                   # Historical (not active SoT)
│   ├── README.md
│   ├── project-log/
│   └── …prior sprint notes…
│
└── templates/                   # Copy-paste skeletons
    ├── README.md
    ├── WIDGET_TEMPLATE.md
    ├── MODULE_TEMPLATE.md
    ├── API_TEMPLATE.md
    └── DECISION_TEMPLATE.md
```

## Layer relationships

```text
Business  ──defines meaning──►  Modules / Widgets
Architecture ──defines structure──►  Modules / APIs / Sync
Decisions (ADR) ──constrain──►  Architecture / Modules / APIs
Development / Release ──govern──►  how work is done
Onboarding ──navigates──►  all layers
```

## How to extend

1. New module → add `03-modules/NEW_MODULE.md` from MODULE_TEMPLATE + update modules README index.
2. New widget → add `04-widgets/<category>/WIDGET_NAME.md` from WIDGET_TEMPLATE.
3. New ADR → follow `06-decisions/INDEX.md` numbering; register in INDEX.
4. Do not add unnumbered folders at `/docs` root without updating this map and DOCUMENTATION_STANDARD.
5. Root-level pointer stubs (e.g. `estimated-tax-models.md`, `DEV_LAN.md`) may exist only to preserve old links; they redirect into `99-legacy/` or the numbered KB. Do not grow product content in stubs.
