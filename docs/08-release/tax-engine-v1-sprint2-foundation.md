# Tax Engine V1 Sprint 2 foundation

This foundation implements the approved Sprint 1 structure without changing Financial Engine V4 or publishing a legally confirmed tax amount. The income provider returns `UNVERIFIED` and `null`; no existing WB amount is used as a fallback. Company tax profiles are separate from the legacy `companies.default_tax_percent` used by V4.

## Migration and rollout

Apply `20260924074324_tax_engine_v1_foundation.sql` only in a separately approved production change window. It adds `company_tax_profiles`, `company_expenses`, `company_expense_audit`, tenant-scoped read policies and service-role-only writes. Existing companies receive no profile. Local Supabase rehearsal succeeded; the local environment needed the pre-existing `20260731200000_company_workspace_11_2.sql` prerequisite first. The tax migration has **not** been applied to production by Sprint 2.

`company_tax_profiles` uses an exclusion constraint to prevent overlapping inclusive effective dates. A service-role-only, invoker-rights function atomically appends a future profile and closes the prior interval. New-company onboarding creates company and initial profile in one database transaction. Existing companies show `TAX_PROFILE_MISSING` until configured. Tax rates are 6% or 15% for standard USN objects, or an explicitly selected USN object plus custom rate. Regional legal eligibility remains an accounting decision.

`company_expenses` stores five business fields, category checkbox default, override provenance, evidence status, actor and timestamps. Delete is soft; the audit trigger records create/update/delete revisions. A checked expense remains `UNVERIFIED` until payment/document evidence can be approved in a later phase. The current tax summary therefore displays manual claims separately from confirmed deductions.

## Readiness and limitations

The marketplace view reads company-owned account facts only. WB Finance fee components and ads are classified `REVIEW`; settlement and compensation are excluded as tax expenses. Ambiguous Finance adjustments are shown for review but excluded from the business-expense total so they cannot silently duplicate advertising or other charges. Their true sign and payment evidence are not established by the current P&L mapper. Confirmed automatic deduction is zero. Product Cost is explicitly excluded as a direct tax deduction; paid-and-sold purchase-lot recognition is still `UNVERIFIED`.

The pure calculator accepts explicit integer-kopeck taxable income, eligible expenses, tax profile and annual context. It computes cumulative ordinary USN estimate, 1% annual minimum reference for income-minus-expenses, and selected-period difference between two cumulative estimates. The current service returns no tax number because the provider is unverified. The selected-period difference must never be labeled statutory payable tax.

The `/expenses` area links to the existing Purchases workflow and adds Operating Expenses CRUD and read-only Marketplace Expenses. `/tax` allows viewing and configuring effective-dated company profiles. Company and expense APIs authorize a company claim before using the server-side client; RLS also denies cross-company and anonymous reads. Browser bundles contain no service-role or marketplace credential values.

## Next source decisions

Sprint 3 must validate the WB gross customer-receipt field and tax-effective dates, including returns, discounts, delayed payment and VAT; add paid/sold purchase-lot evidence and allocation; and confirm each company's legal regime, regional eligibility and contribution treatment. Any replacement of V4 Final Net Profit remains Human Gate 3. The canonical [Sprint 1 architecture specification](../01-business/tax-engine-v1-business-architecture-spec.md) details those decisions.
