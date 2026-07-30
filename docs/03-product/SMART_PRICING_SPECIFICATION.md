# Smart Pricing Specification

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

Smart Pricing

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
- [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md)
- [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md)

---

Related Documents

- [Cost Management Specification](./COST_MANAGEMENT_SPECIFICATION.md)
- [Inventory Intelligence Specification](./INVENTORY_INTELLIGENCE_SPECIFICATION.md)
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

On material change to pricing simulation scope, Target Margin behavior, or Estimated Tax model boundaries

---

Source of Truth

This file (product behavior for Smart Pricing). Vocabulary remains owned by the [Glossary](../01-business/GLOSSARY.md). Smart Pricing financial model and Estimated Tax simulation base remain owned by [Accounting Rules](../01-business/ACCOUNTING_RULES.md) §3.3 / §10. Historical Commercial Performance remains owned by [Financial Analysis Specification](./FINANCIAL_ANALYSIS_SPECIFICATION.md). Operational product diagnosis remains owned by [Product Analytics Specification](./PRODUCT_ANALYTICS_SPECIFICATION.md).

---

Purpose

Define the canonical product specification for Smart Pricing: forward-looking pricing decisions through margin protection, price simulation, sensitivity, recommended pricing, scenario analysis, and commercial optimization — without rewriting historical Commercial Performance.

---

Scope

Product behavior for Smart Pricing only. Does not specify UI layout, components, database design, APIs, services, formulas beyond Accounting Rules, or technical architecture.

---

## 1. Purpose

### Why Smart Pricing exists

Smart Pricing exists so the seller-operator can answer: **What Sale Price is consistent with our Target Margin under stated assumptions?** ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §3.3).

Historical modules explain what already happened. Smart Pricing is **simulation** — counterfactual unit economics toward a pricing goal. It uses the Smart Pricing Estimated Tax base (sale after Marketplace Fee), which intentionally differs from historical reporting Estimated Tax ([Glossary](../01-business/GLOSSARY.md); Project DNA dual-model stance).

It is Pricing Support ([Application Architecture](../02-architecture/APPLICATION_ARCHITECTURE.md)). It is not Financial Analysis, not Product Analytics history, and not a tax filing tool.

### Business value

1. Protects Target Margin when setting or revising Sale Price.
2. Makes fee, cost, logistics, advertising, and tax assumptions visible in a forward path.
3. Supports scenario and sensitivity thinking before price changes.
4. Keeps simulated Net Profit labeled as simulation — never historical Net Profit.
5. Hands off from Product Analytics / Financial Analysis investigation into actionable price options.

### Problems solved

1. **Margin leakage from price guesses** — Prices set without a target economics path.
2. **Model confusion** — Simulated results mistaken for period Commercial Performance.
3. **Tax base collapse** — Historical and Smart Pricing Estimated Tax bases silently unified.
4. **Cost blindness in pricing** — Unit Cost / fee assumptions ignored when recommending price.
5. **No scenario discipline** — “What if” changes without declared assumptions.

---

## 2. Business Questions

Every claim must be labeled **simulation / Smart Pricing**. Company, Marketplace Account, and assortment grain (typically Model / Supplier Article) must be explicit.

### Margin protection

- What Target Margin are we solving toward?
- Does a candidate Sale Price protect Operational / target margin goals under stated assumptions?
- Where does margin break if fee, cost, or logistics assumptions worsen?

### Price simulations

- What Sale Price is consistent with Target Margin under stated cost and marketplace assumptions?
- What simulated unit economics result from a candidate Sale Price?
- How does recommended Sale Price differ from current Sale Price?

### Sensitivity

- How sensitive is recommended price or simulated profit to Unit Cost changes?
- How sensitive is it to Marketplace Fee, Logistics, Advertising, or Tax Rate assumptions?
- Which assumption moves the outcome most?

### Competitive / commercial pricing posture

- Is the recommended Sale Price commercially plausible relative to current Sale Price posture?
- Should we hold, raise, or lower price given simulation and commercial diagnosis from Product Analytics?

### Recommended pricing

- What recommended Sale Price does the simulator produce for the scoped item?
- What Markup on Cost accompanies that recommendation?

### Scenario analysis

- What happens under alternate Target Margin or cost scenarios?
- What happens under alternate fee/logistics/advertising assumptions?
- Which scenario remains decision-grade given input quality?

### Commercial optimization

- Which items should be repriced first given weak Operational Margin (Product Analytics) and simulation upside?
- Where should we refuse a price cut because Target Margin cannot be protected?

### Explicitly not answered here

- What was historical Net Profit for the period? → **Financial Analysis**
- Which products are return-toxic historically? → **Product Analytics**
- What Unit Cost should be stewarded as truth? → **Cost Management**
- What stock should we buy? → **Inventory Intelligence** / **Purchasing**

---

## 3. Scope

### 3.1 Included

| Area | Product inclusion |
|------|-------------------|
| Smart Pricing simulation | Forward unit economics toward Target Margin |
| Sale Price inputs/outputs | Current Sale Price context; recommended Sale Price output |
| Target Margin | Pricing goal the simulator solves toward |
| Markup on Cost | Pricing metric in simulation context |
| Cost and marketplace assumptions | Unit Cost / Product Cost inputs; fee, logistics, storage, advertising assumptions as simulation inputs |
| Estimated Tax (Smart Pricing base) | Simulation tax using sale-after-Marketplace-Fee base only |
| Sensitivity / scenarios | Declared assumption variants |
| Margin protection reading | Whether candidate prices protect target |
| Trust of inputs | Disclose weak Unit Cost or missing assumptions |

### 3.2 Not included

| Outside | Owner |
|---------|--------|
| Historical Commercial Performance / period Net Profit authority | Financial Analysis |
| Operational historical product P&L | Product Analytics |
| Unit Cost stewardship system of record | Cost Management |
| Inventory replenishment | Inventory Intelligence |
| Settlement framing | Financial Analysis |
| Statutory tax advice | Out of framework |

### 3.3 Neighbor relationships

| Neighbor | Relationship |
|----------|--------------|
| **Financial Analysis** | Historical money authority; Smart Pricing must not rewrite it |
| **Product Analytics** | Common inbound handoff when operational margin is weak; history stays history |
| **Cost Management** | Provides Unit Cost quality for simulation inputs |
| **Inventory Intelligence** | May inform whether price changes interact with stock risk — adjacent only |
| **Reporting** | May include explicitly labeled simulation sections only |

---

## 4. KPIs

### Sale Price (current / candidate / recommended)

| Aspect | Definition |
|--------|------------|
| Business meaning | Selling price in pricing/simulation context; recommended price is Smart Pricing output |
| Management purpose | Act on a concrete price decision |
| Supported decisions | Hold / raise / lower price |
| Dependencies | Glossary Sale Price; not Customer Paid; not Revenue |

### Target Margin

| Aspect | Definition |
|--------|------------|
| Business meaning | Margin goal used when solving for recommended Sale Price |
| Management purpose | Encode pricing ambition |
| Supported decisions | Accept or revise pricing goals |
| Dependencies | Glossary Target Margin; ≠ Net Margin; ≠ unlabeled Operational Margin |

### Markup on Cost

| Aspect | Definition |
|--------|------------|
| Business meaning | Markup relative to product cost in Smart Pricing metrics |
| Management purpose | Cost-relative pricing lens |
| Supported decisions | Compare recommendation richness vs cost |
| Dependencies | Glossary Markup on Cost; Unit Cost inputs |

### Simulated unit economics (including simulated profit)

| Aspect | Definition |
|--------|------------|
| Business meaning | Counterfactual economics under stated Sale Price and assumptions — labeled simulation |
| Management purpose | See forward outcome of a price choice |
| Supported decisions | Choose among price scenarios |
| Dependencies | Accounting Rules §3.3 / §10; never historical Net Profit |

### Estimated Tax (Smart Pricing base)

| Aspect | Definition |
|--------|------------|
| Business meaning | Tax estimate inside simulator based on sale after Marketplace Fee |
| Management purpose | Include tax in forward path without using historical base |
| Supported decisions | Avoid understating tax in price solves |
| Dependencies | Glossary Estimated Tax dual contexts; Accounting Rules; ≠ historical Customer Paid base |

### Tax Rate

| Aspect | Definition |
|--------|------------|
| Business meaning | Percentage input — not the money amount |
| Management purpose | Control simulation tax sensitivity |
| Supported decisions | Scenario tax-rate stress |
| Dependencies | Glossary Tax Rate |

### Unit Cost / assumed marketplace cost lines

| Aspect | Definition |
|--------|------------|
| Business meaning | Simulation inputs for merchandise and marketplace cost assumptions |
| Management purpose | Ground the solve in stated economics |
| Supported decisions | Reject solves when cost inputs are untrusted |
| Dependencies | Cost Management for stewardship quality; Accounting category names |

---

## 5. Business Capabilities

### 5.1 Price solve toward Target Margin
**Why.** Sellers need a price consistent with a stated margin goal.  
**Provides.** Recommended Sale Price under declared assumptions.

### 5.2 Margin protection check
**Why.** Price cuts must not silently destroy target economics.  
**Provides.** Protection reading for candidate prices.

### 5.3 Scenario and sensitivity analysis
**Why.** Assumptions change.  
**Provides.** Declared variants for cost, fee, logistics, advertising, tax, and target.

### 5.4 Simulation labeling
**Why.** Trust collapses if simulation looks like history.  
**Provides.** Persistent simulation epistemology.

### 5.5 Dual-tax-base discipline
**Why.** Estimated Tax has two intentional bases.  
**Provides.** Smart Pricing base only inside this module’s solves.

### 5.6 Decision handoff
**Why.** Price decisions start from commercial diagnosis elsewhere.  
**Provides.** Clean inbound from Product Analytics / Financial Analysis and outbound to execution judgment (seller remains accountable).

---

## 6. Analysis Perspectives

| Perspective | Why |
|-------------|---------|
| Company / Marketplace / Marketplace Account | Scope and tenancy |
| Product / Model / Supplier Article | Primary pricing grain |
| SKU (when price differs by size) | Optional finer grain |
| Assumption set / scenario | Variant economics |
| Target Margin setting | Goal perspective |

Not primary: Warehouse performance network; Inventory Snapshot history; settlement calendars.

---

## 7. User Workflows

### 7.1 Daily price exception
Respond to a weak Operational Margin item → open Smart Pricing → solve/recommend → decide hold/raise/lower.

### 7.2 Weekly pricing review
Rank candidates from Product Analytics → run simulations → prioritize repricing list.

### 7.3 Monthly commercial optimization
Review Target Margin policy → scenario stress on cost/fee → align with Financial Analysis period reality without merging models.

### 7.4 Sensitivity stress
Vary Unit Cost / fee / tax → see recommendation movement → reject fragile prices.

### 7.5 Scenario planning
Compare alternate Target Margins → pick posture → document assumptions for seller accountability.

### 7.6 Input-quality exception
If Unit Cost missing/untrusted → stop confident recommendation → hand off Cost Management.

### 7.7 Decision making
Choose recommended vs current Sale Price → seller executes marketplace price change outside this module’s ownership of marketplace cabinets.

### 7.8 Investigation from history
Financial Analysis/Product Analytics finds margin pain → simulate forward fix → do not rewrite history.

---

## 8. Filters

| Filter | Business purpose |
|--------|------------------|
| Company / Marketplace / Marketplace Account | Tenancy and platform scope |
| Product / Model / Supplier Article / SKU | Pricing grain |
| Target Margin / scenario selection | Which goal/assumption set is active |
| Cost/fee assumption profile (when offered) | Declare simulation inputs |

Filters must not switch the module into historical Commercial Performance mode.

---

## 9. Drill-down Principles

1. Portfolio candidates → item solve → assumption detail.
2. Simulation label persists at every level.
3. Estimated Tax base remains Smart Pricing base — never silent historical base.
4. Target Margin ≠ Net Margin renaming.
5. Handoff to Cost Management when inputs fail quality.
6. No absorption of Inventory or Warehouse modules.
7. Returning to Financial Analysis restores historical model explicitly.

---

## 10. Dependencies

Depends on Foundation + Architecture stack listed in frontmatter; especially Accounting Rules §3.3; Financial Analysis; Product Analytics; Cost Management for Unit Cost quality; Historical Data Warehouse for factual inputs where used as assumptions anchors.

Cost Management specification may be authored after this document in the program; the logical dependency still holds.

---

## 11. Module-specific Business Rules

1. **Simulation only** — outputs are never historical Commercial Performance ([Accounting Rules](../01-business/ACCOUNTING_RULES.md) §3.3).
2. **Dual Estimated Tax bases** — Smart Pricing base only here; do not use historical Customer Paid base unlabeled.
3. **Target Margin ≠ Net Margin** — keep Glossary distinction.
4. **Sale Price ≠ Revenue ≠ Customer Paid.**
5. **No rewrite of period Net Profit** by publishing simulation beside history without labels.
6. **Assumption declaration** — scenarios without stated assumptions are defects.
7. **Unit Cost stewardship boundary** — Smart Pricing consumes; Cost Management owns.
8. **Seller accountability remains** — recommendations assist; they do not remove seller responsibility ([Business Model](../01-business/BUSINESS_MODEL.md)).
9. **Reporting** may show simulation only when explicitly framed.
10. **Trust** — weak inputs ⇒ weak confidence; no false precision.

---

## 12. Success Criteria

Management can protect margins, simulate prices, compare scenarios, recommend Sale Prices, and optimize commercially **without** confusing simulation with history or collapsing Estimated Tax bases.

Failure modes: unlabeled simulation; tax-base collapse; Target Margin synonym abuse; cost stewardship absorption; historical ledger rewrite.

---

## 13. Out of Scope

Implementation, UI, database, SQL, APIs, services, infrastructure, frontend/backend, statutory tax products, marketplace admin panels as owned surfaces.

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Production |
| Module | Smart Pricing |
| Last Updated | 2026-07-28 |
| Program step | STEP 4 of Product Specification Program |
