# Accounting Rules

---

Status

Production

---

Owner

Product Owner

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

Business

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Glossary](./GLOSSARY.md)

---

Related Documents

- [KPI Catalog](./KPI_CATALOG.md)
- [Business Model](./BUSINESS_MODEL.md)
- [Decisions Index](../06-decisions/INDEX.md)
- [Architecture](../02-architecture/README.md)

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

On any change to financial meaning, model boundaries, or reporting interpretation

---

Source of Truth

This file

---

Purpose

Define the canonical accounting framework for every money-related calculation and report in the project. Identity and product philosophy live in Project DNA; vocabulary lives in the Glossary. This document owns accounting rules, financial boundaries, and reporting philosophy.

---

Scope

Accounting meaning and financial governance only. Does not specify formulas, interfaces, persistence, presentation units, or source-code structure.

---

## 1. Purpose

This document exists so that every surface that calculates or presents money shares one accounting framework.

Accounting consistency is critical because sellers use these numbers to judge profitability, replenishment, pricing, and spend. If Revenue, costs, or Estimated Tax mean different things in different places without an explicit model boundary, trust collapses — even when individual screens look plausible.

The framework ensures that:

- Business events receive a stable accounting interpretation.
- Historical reports remain defensible over time.
- Distinct business questions may use distinct models **only** when that difference is intentional and documented.
- Changes to financial meaning are deliberate, reviewed, and recorded.

All money calculations in the project must conform to this document. Where detail is missing, stop and extend this framework (and the Glossary) before inventing local meaning.

---

## 2. Accounting Philosophy

These rules extend Project DNA’s accounting-before-mathematics stance into an operational financial handbook. They do not replace Project DNA.

1. **Accounting reflects business reality.** Numbers describe what happened (or, when explicitly labeled, what is estimated or simulated) — not decorative approximations invented for visual convenience.

2. **Reports must be reproducible.** The same Company, Marketplace Account, Reporting Period, and settled rules must yield the same Commercial Performance and settlement readings whenever the underlying warehouse facts are unchanged.

3. **Calculations must be auditable.** A competent reader must be able to state what a figure includes, excludes, which model produced it, and whether it is observed, estimated, or simulated.

4. **Historical results must not drift without cause.** Once a period has been reported under settled rules, its published interpretation must not change unless source facts change or an intentional, documented rule change is applied with clear effective dating.

5. **One business event, one accounting interpretation within a model.** Inside a given financial model, the same event must not be classified two incompatible ways. Across models, differences are allowed only when they answer different questions (see Financial Models and Project DNA: different questions may require different models).

6. **Meaning before arithmetic.** Cost and revenue categories are defined by business role, not by whichever feed happens to be convenient.

7. **Labels must match meaning.** If a figure is Estimated Tax, Settlement Amount, or Net Sales, it must not silently behave like a different Glossary term.

8. **Multi-tenant isolation is an accounting boundary.** Financial results are always relative to Company and Marketplace Account scope. Mixing accounts without stating scope is a reporting error.

9. **Presentation does not create a second ledger.** Display stories may order cards for readability; they must not invent a parallel set of financial truths.

10. **Silence is preferable to false precision.** When a value is unavailable, out of scope, or not yet verified, say so. Do not fill gaps with invented accounting.

---

## 3. Financial Models

The project uses more than one financial model because sellers ask more than one kind of question. Models are complementary. They must not be silently unified.

### 3.1 Commercial Performance (Financial Engine)

**Purpose.** Report historical commercial profitability for a Reporting Period: the money-flow from sales activity through costs to Operating Profit and Net Profit.

**When to use.** Dashboard commercial reading, historical profitability, management reporting that claims commercial P&L, and any surface that answers: *What was commercial performance for this period?*

**Nature.** Observed marketplace and seller facts, plus Estimated Tax in its **historical reporting** sense.

**Must not be replaced by.** WB Settlement, Smart Pricing, or operational Product Analytics framings when the question is commercial historical profit.

### 3.2 WB Settlement (settlement framing)

**Purpose.** Present marketplace settlement / payout-oriented figures for reconciliation and cash-transfer understanding.

**When to use.** Settlement visibility, Settlement Reconciliation, and questions of the form: *What does settlement say we were paid or owed in settlement terms?*

**Nature.** Settlement-oriented observed amounts; Estimated Tax shown near settlement is informational and follows historical reporting meaning — it is not derived from settlement itself as a commercial P&L.

**Must not be treated as.** A substitute Commercial Performance statement. Settlement Profit is a distinct framing and must remain labeled as such.

### 3.3 Smart Pricing (simulation)

**Purpose.** Support forward pricing decisions by simulating unit economics toward a Target Margin (or equivalent pricing goal).

**When to use.** Only when the question is forward-looking: *What Sale Price is consistent with our target under stated assumptions?*

**Nature.** Simulation. Estimated Tax in this model uses the Smart Pricing base (sale after Marketplace Fee), which intentionally differs from historical reporting.

**Must not be used to.** Rewrite historical Commercial Performance, Net Profit, or period tax estimates.

### 3.4 Product Analytics (operational reading)

**Purpose.** Operational decision support at product and Model scope (costs, margins, logistics detail, advertising visibility).

**When to use.** Product-level investigation and operational P&L-style reading explicitly framed as decision support.

**Nature.** May reuse commercial categories and warehouse facts, but it is **not** a license to redefine Commercial Performance terms. Where Product Analytics uses a different cut of costs, it must remain explainable against this framework and the Glossary.

**Must not silently override.** Commercial Performance definitions of Revenue, Operating Profit, Net Profit, or Estimated Tax (historical).

### 3.5 Model coexistence rule

When two models disagree numerically, first ask whether they answer different questions. If they answer the same question differently, that is a defect. If they answer different questions, both may stand — provided labels, Glossary terms, and this framework make the boundary obvious.

Estimated Tax is the flagship example: one Glossary term, two intentional bases, two questions. Do not collapse them.

---

## 4. Revenue Recognition

### 4.1 What Revenue means

In this project, **Revenue** (Commercial Performance) is the seller’s marketplace payable amount for the Reporting Period — the commercial top line from which operating costs and historical Estimated Tax are reasoned toward profit.

Revenue is **not**:

- Gross Sales
- Net Sales
- Customer Paid
- Seller Payout
- Settlement Amount
- Inventory Value

Those terms have distinct Glossary meanings and must not be used as casual synonyms for Revenue.

### 4.2 Conceptual boundaries

1. **Recognition follows marketplace commercial reality for the period**, as captured in the Historical Data Warehouse for the scoped Marketplace Account — not a free-form seller wish.
2. **Sales presentation vs Revenue.** Gross Sales, Returned Sales, and Net Sales tell the merchandise sales story. Revenue tells the seller payable story. Both may appear in one narrative; they remain different concepts.
3. **Returns affect the sales story and related quantities.** They do not redefine Revenue into Customer Paid or Net Sales.
4. **Fees already reflected before Revenue.** Marketplace Fee and Acquiring are part of understanding the path to Revenue; they are not casually re-subtracted when computing Net Profit under Commercial Performance (see Cost Categories).
5. **Scope.** Revenue is always for an explicit Company, Marketplace Account, and Reporting Period.
6. **No double counting.** A single payable event must not inflate Revenue twice within the same model and period.

### 4.3 What this section does not do

This section does not prescribe calculation steps. It fixes meaning so mathematics and code have a single target.

---

## 5. Cost Categories

Cost categories classify **why** money left (or is reserved against) commercial results. Category membership is a business judgment governed here and named in the Glossary.

### 5.1 Product Cost

Cost of goods attributed to sold units for the period, derived from maintained Unit Cost. Represents seller merchandise cost, not marketplace logistics.

### 5.2 Marketplace Fee

The marketplace’s fee take in the commercial fee story. In Commercial Performance it is shown for understanding; it is not deducted again in Net Profit when already reflected before Revenue.

### 5.3 Logistics

Marketplace logistics costs for the period (forward movement of goods as classified in commercial reading). Return Logistics is a related but distinct subcategory when surfaces separate return logistics from general Logistics.

### 5.4 Storage

Marketplace storage costs for the period.

### 5.5 Acceptance

Marketplace acceptance (intake) operation costs for the period.

### 5.6 Penalties

Marketplace penalty amounts for the period.

### 5.7 Advertising

Advertising / marketing spend. In Commercial Performance, advertising is commonly included inside Adjustments when that is how finance adjustments for the period present it. In Product Analytics and some reports, Advertising may appear as its own analytical line. Both presentations must remain explainable: do not treat a second Advertising line as a second independent deduction of the same spend inside one model without stating the relationship.

### 5.8 Adjustments (Other Costs)

Marketplace financial adjustments for the period — the Commercial Performance bucket for advertising and other marketplace holds/deductions not classified as Fee, Logistics, Storage, Acceptance, or Penalties. Prefer Glossary term **Adjustments**. “Other Costs” / “Other Marketplace Costs” are aliases for this bucket in some operational views.

### 5.9 Acquiring

Payment acquiring fee shown for transparency. Already reflected before Revenue; not deducted again when computing Net Profit under Commercial Performance.

### 5.10 Estimated Tax (as a P&L charge)

Estimated Tax is not a marketplace invoice line in the same sense as Logistics; it is an **estimation principle** applied in P&L. In Commercial Performance it reduces Operating Profit to Net Profit using the historical reporting base (Customer Paid). In Smart Pricing it participates in simulation using the Smart Pricing base. See Estimation Principles.

### 5.11 Compensation and special reimbursements

Compensation and similar reimbursements are classified separately from Marketplace Fee. They must not be silently netted into Fee or Advertising without an explicit rule.

### 5.12 Category discipline

1. Do not invent parallel category names for the same meaning.
2. Do not move spend between categories to make a period “look better.”
3. If a new cost type appears, name it in the Glossary and place it here before wiring it into reports.
4. Informational lines (for example Marketplace Fee and Acquiring beside Net Profit) must stay informational unless this framework changes.

---

## 6. Historical Integrity

Historical integrity is the accounting expression of Project DNA’s “historical data is immutable in spirit.”

1. **Past periods are evidence.** A closed Reporting Period’s Commercial Performance is a record of interpretation under the rules then in force, applied to warehouse facts for that period.
2. **No casual rewrite.** Changing today’s live operational caches (for example Current Stock) must not silently revise yesterday’s published commercial results.
3. **Corrections are first-class.** When source facts are corrected (late sync, genuine marketplace correction), restating a period is allowed only as a deliberate correction, not as an unnoticed side effect.
4. **Rule changes are dated.** If accounting meaning changes, the change has an effective point; prior periods keep prior meaning unless a documented restatement policy says otherwise.
5. **Snapshots preserve reading.** Inventory Snapshot and verification captures exist so history can be inspected without depending on the marketplace’s present UI.
6. **Exports are accountable.** Spreadsheet and report exports for a period are expected to match on-screen Commercial Performance for the same scope and rules — not a private export arithmetic.

Immutable reporting means: **stable interpretation + stable facts ⇒ stable results**. It does not mean “never fix true errors”; it means fixes are visible and governed.

---

## 7. Time Principles

Time determines which facts belong in which reading.

### 7.1 Business Event Date

The date associated with the underlying commercial or inventory event (sale, return, order, stock observation, adjustment). Event dating decides which Reporting Period an observed fact belongs to for a given model.

### 7.2 Settlement Date

The dating relevant to settlement framing — when settlement recognizes or transfers amounts. Settlement Date may differ from Business Event Date. WB Settlement readings follow settlement time logic; Commercial Performance follows commercial event/period logic. Do not force them onto one clock without stating the bridge.

### 7.3 Reporting Period

The explicit start and end bounds (or Period Preset) for which a model is evaluated. Every financial claim must declare its Reporting Period (and Company / Marketplace Account).

### 7.4 Historical Snapshot

A point-in-time capture (for example Inventory Snapshot) used to read the past as it was recorded. Snapshot time is not the same as “whatever is live now.”

### 7.5 Live State

The current operational picture (Current Stock, latest sync posture). Live State supports operations; it is not a license to overwrite Historical Snapshot or closed-period commercial readings.

### 7.6 Time discipline

1. Do not mix Live State and Historical Snapshot in one unlabeled total.
2. Do not compare Settlement Date totals to Business Event Date totals as if they were identical.
3. When a metric is partial because the period is still open or sync Coverage is incomplete, say so.

---

## 8. Reporting Principles

### Consistency

Within one model, the same Glossary term means the same thing on Dashboard, Reports, Excel Export, and product tables. Across models, differences are allowed only when documented (Financial Models).

### Repeatability

Re-running a report for the same scope, facts, and rules must reproduce the same figures. Non-deterministic “helpful” rounding or silent fallbacks that change meaning are forbidden.

### Auditability

Readers must be able to reconstruct the path from warehouse facts and this framework to the published number — including whether Marketplace Fee or Acquiring were informational.

### Traceability

Material financial behavior must be traceable to this document, the Glossary, and (when consequential) an ADR. Informal chat decisions are not accounting authority.

### Explainability

Every primary KPI should answer: What is it? Why does it exist? What does it include? What does it exclude? Which model? Observed, estimated, or simulated?

These reporting principles align with Project DNA’s explainability and auditability philosophy without restating project identity.

---

## 9. Financial Boundaries

### 9.1 What the project does calculate

- Commercial Performance for scoped periods (including Gross Sales, Returned Sales, Net Sales, Revenue, cost categories, Operating Profit, Net Profit, and related operational counts such as Units Sold and Return Rate).
- Estimated Tax in historical reporting and in Smart Pricing simulation (distinct bases).
- WB Settlement and related settlement-oriented amounts for visibility and reconciliation.
- Product- and Model-level operational financial readings under Product Analytics, consistent with this framework’s category meanings.
- Inventory-related **non-P&L** quantities and values where in scope (Current Stock, Inventory Value when available) — clearly separated from commercial profit.
- Forward simulation outputs under Smart Pricing (recommended Sale Price and simulated unit economics).

### 9.2 What the project intentionally does NOT calculate

- Statutory financial statements under national GAAP/IFRS as a legal filing system.
- Official tax returns, tax advice, or certified accounting opinions.
- Marketplace-side correctness beyond what is available, synchronized, and verified.
- A single unified tax base for historical reporting and Smart Pricing.
- Guaranteed Inventory Value when monetary valuation is not available.
- Secret second ledgers inside presentation layers.
- Cross-account blended P&L without explicit multi-account scope rules.

### 9.3 Boundary rule

If a requested metric falls outside this section, either refuse it, label it clearly as out-of-framework, or extend this document through Change Management before shipping it as accounting truth.

---

## 10. Estimation Principles

Not every number is an observation. Accounting honesty requires labeling epistemic status.

### Observed values

Amounts taken from marketplace or seller facts as stored for the period (sales activity, finance-derived costs, settlement figures, stock counts). Observed values are still subject to Coverage and verification; “observed” does not mean “infallible.”

### Estimated values

Amounts produced by applying a stated estimation rule to observed bases. **Estimated Tax** is the primary example. Estimates must disclose that they are estimates and which model/base applies.

### Projected values

Near-term extensions of known patterns that are still tied to an explicit method and horizon. Projections are not historical Commercial Performance.

### Simulation

Counterfactual unit or scenario economics under assumed Sale Price, costs, and targets. **Smart Pricing** is simulation. Simulated Net Profit must never be presented as historical Net Profit.

### Forecast

Longer-horizon predictive capability (roadmap language). Until a forecast model is adopted into this framework, Forecast is not an accounting synonym for Commercial Performance or Estimated Tax.

### Estimation discipline

1. Never display an estimate with the visual authority of an observed settlement cash figure without labeling.
2. Never replace missing observed facts with silent estimates inside historical Revenue or cost categories.
3. Never reuse historical Estimated Tax bases inside Smart Pricing, or Smart Pricing bases inside historical Commercial Performance.
4. Tax Rate is an input; Estimated Tax is the resulting estimate — keep the Glossary distinction.

---

## 11. Validation Principles

Financial correctness is evaluated by reconciliation and verification philosophy — not by confidence alone.

### Reconciliation philosophy

1. **Same question, same answer.** Commercial Performance totals for a scope must agree across surfaces that claim that model.
2. **Different question, explained difference.** WB Settlement vs Commercial Performance differences are expected; they must be reconcilable in narrative (time basis, inclusions) without forcing numeric identity.
3. **Informational lines.** Marketplace Fee and Acquiring appearing beside Net Profit must not be double-counted in validation scripts as if Net Profit subtracted them again.
4. **Exports.** Excel Export and on-screen figures for the same model and scope must match within stated rounding policy.

### Source verification

1. Prefer warehouse facts as the Single Source of Truth (Data) for reporting validation.
2. Sync Verification and Coverage assess whether facts are complete enough to trust — they do not redefine accounting categories.
3. When Coverage is incomplete, financial claims for the affected period must be qualified.
4. Validation failures are product defects or data defects; they are not resolved by quietly changing category meaning.

### Correctness standard

A financial figure is acceptable only when its Glossary term, model, period, scope, and epistemic status (observed / estimated / simulated) are correct — and when it reconciles to the warehouse under this framework.

---

## 12. Change Management

Accounting rules may change only when business reality, marketplace structure, or product scope truly requires it — not for cosmetic UI convenience.

### When change is allowed

- A new cost category or model boundary is required and named.
- Marketplace commercial meaning changes in a way that makes the prior interpretation misleading.
- A documented defect shows the current rule falsifies business reality.
- Scope expansion (for example additional Marketplace types) needs explicit accounting extensions.

### Backwards compatibility expectations

1. Prefer additive clarification over silent redefinition.
2. If Net Profit, Revenue, or Estimated Tax historical meaning changes, treat it as a breaking accounting change.
3. Provide effective dating: which Reporting Periods use the old rule vs the new rule.
4. Restatement of published periods requires an explicit decision — default is no silent restatement.

### Documentation requirements before changing financial behavior

Before any change that affects money calculations or financial labels:

1. Update **this document** with the new rule and rationale.
2. Update the **Glossary** if terms, aliases, or boundaries change.
3. Record an **ADR** for consequential model or base changes (especially Estimated Tax bases or Revenue meaning).
4. Update KPI Catalog / Business Model when those documents define affected metrics.
5. State impact on historical integrity and whether restatement applies.
6. Only then implement mathematics and presentation.

No financial behavior change is complete while only code or UI has moved.

---

## How to apply this document

1. Identify the business question.
2. Select the Financial Model that owns that question.
3. Use Glossary terms exactly.
4. Apply category and revenue boundaries from this framework.
5. Label observed vs estimated vs simulated.
6. Validate against warehouse facts and reconciliation principles.
7. If blocked by a missing rule, extend this document — do not invent a local exception.

This file is the authoritative accounting reference for the Knowledge Base. Project DNA defines why the project exists; the Glossary defines what words mean; Accounting Rules define how money must be interpreted.
