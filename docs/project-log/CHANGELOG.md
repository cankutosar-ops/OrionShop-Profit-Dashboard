# Project Change Log

Append-only. Newest sprint at the bottom.

Template for each completed sprint:

```
## Sprint X.XX

### Added
-

### Changed
-

### Fixed
-

### Business Decisions
-

### Architecture Decisions
-

### Notes
-
```

Keep each sprint ≤ ~15–20 lines. Decisions only — not source code.

---

## Sprint 6.30 — Commercial money-flow dashboard

### Added
- Commercial Performance KPI flow: Sales → Commission → Revenue → costs → Net Profit

### Changed
-

### Fixed
-

### Business Decisions
- Dashboard commercial layer is sale_date–oriented (Sales API), not Finance settlement-first

### Architecture Decisions
- Separate commercial presentation from Finance settlement (Model C / WB Settlement)

### Notes
- Foundation for the later Model B Revenue = forPay decision

---

## Sprint 6.31 — Model B Revenue = Sales API forPay

### Added
-

### Changed
- Model B Revenue defined as Sales API `forPay` (not Finance `ppvz_for_pay`)
- Net Profit = Revenue − Acquiring − Logistics − Storage − Penalties − Adjustments − Product Cost − Advertising
- Profitability Breakdown remains Finance/settlement (Model C) accounting

### Fixed
-

### Business Decisions
- Finance `ppvz_for_pay` is **not** the commercial Revenue baseline
- Acquiring is an independent KPI; deducted in Net Profit only, not from Revenue
- Commission available from Sales immediately; Acquiring follows Finance lag

### Architecture Decisions
- Model B engine owns commercial P&L; Model C / WB Settlement remain Finance-driven
- Dashboard Model B path does not depend on Finance for_pay for Revenue

### Notes
- Validation gate: Model B arithmetic and Revenue = forPay identity

---

## Sprint 6.32 — Single production Dashboard

### Added
-

### Changed
- Main `/` route is the production dashboard (former Profit V3 content)
- `/profit-v3` redirects to `/`
- Removed Model B / Model C toggle and experimental UI wording from the dashboard

### Fixed
-

### Business Decisions
- Users see one Dashboard: Commercial Performance, Profitability Breakdown, WB Settlement
- Model B / Model C naming is internal only

### Architecture Decisions
- UI cleanup only — calculation engines unchanged
- Commercial Performance is the default (and only) commercial KPI surface

### Notes
- Sidebar branding: Dashboard

---

## Sprint 6.33 — Account 2 sales readiness (acceptance)

### Added
-

### Changed
-

### Fixed
-

### Business Decisions
- Production readiness evaluated **per module**: Model B Commercial, Model C Accounting, WB Settlement
- Missing Finance `for_pay` is **not** a Model B blocker

### Architecture Decisions
- Account 2 weekly sales backfill (2026-01-01 → 2026-07-13) completed 28/28
- Model B commercial path ready; Model C / Settlement still gated on Finance for_pay coverage

### Notes
- Soft note: finance cost lines incomplete outside May–Jun for full-range Model B Net Profit costs

---

## Sprint 6.34 — Smart Pricing uses Model B

### Added
- Brand and Category filters (display-only; default All)
- Optional summary: Products in Stock, Missing Product Cost

### Changed
- Smart Pricing recommended price targets Model B Net Profit % of Sales
- Grid loads all products currently in stock (not sales-activity candidates)
- Missing Product Cost: red highlight, no recommended price

### Fixed
-

### Business Decisions
- Marketing % remains a user planning lever (% of price) — behaviour unchanged
- Stock availability is the Smart Pricing grid source

### Architecture Decisions
- Reuse existing Smart Pricing page and Adaptive Logistics (PRODUCT → CATEGORY → ACCOUNT)
- Wire verification through Model B unit economics; do not redesign UI

### Notes
- Acceptance: Adaptive Logistics, filters, monotonic target NP%, multi-account — PASS

---

## Sprint 6.34b — Settlement data availability notice

### Added
- Informational notice when selected period is after the latest WB realization report

### Changed
- WB Settlement and Profitability Breakdown hide zero/partial figures when settlement data is not yet available

### Fixed
-

### Business Decisions
- Realization lag is expected — not an application error
- Commercial Dashboard remains available while Accounting / Settlement wait for WB reports

### Architecture Decisions
- Availability from latest weekly realization `dateTo` (+ lookback); no silent partial settlement UI

### Notes
- Complements Finance for_pay gaps; message is informational only

---

## Sprint 6.35 — Project Log foundation

### Added
- `docs/project-log/README.md` — purpose and workflow
- `docs/project-log/CHANGELOG.md` — append-only sprint log

### Changed
-

### Fixed
-

### Business Decisions
- Project Log is the ongoing decision history; Project DNA comes later

### Architecture Decisions
- Append-only changelog; no full-doc regeneration per sprint
- Initial population = major milestones only (not every historical sprint)

### Notes
- Future rule: after each completed sprint, append one entry here
