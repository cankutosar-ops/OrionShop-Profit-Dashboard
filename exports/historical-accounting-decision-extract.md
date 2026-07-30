# Historical Accounting Decision Extract

Source transcript: `1dd611f4-327e-4e7a-8a32-2f079c1ba742`

This file extracts the Sprint 6.31 business decision, the research verdicts that rejected Sales−MarketplaceFees / early Model B, and why Sprint 6.30’s Revenue = Finance `ppvz_for_pay` was superseded.

---

## Decision snapshot (compiled)

### Model B final formulas (from Sprint 6.31 user spec)

```text
Revenue Flow:
  Sales (priceWithDisc)
    → Commission (priceWithDisc − Sales API forPay)
    → Revenue (Sales API forPay)   # NOT Finance ppvz_for_pay
    → Logistics → Storage → Penalties → Adjustments
    → Product Cost → Advertising → Net Profit

Net Profit =
  Revenue
  − Acquiring
  − Logistics
  − Storage
  − Penalties
  − Adjustments
  − Product Cost
  − Advertising

Acquiring: independent KPI (Finance acquiring_fee);
  NOT deducted from the Revenue widget; deducted ONLY inside Net Profit.
Date axis: sale_date
```

### Why Sprint 6.30 Revenue = Finance `ppvz_for_pay` was superseded

Sprint **6.30** defined Model B Revenue as **Finance `ppvz_for_pay`** (commercial revenue baseline after commission/acquiring in the money-flow UI).

Sprint **6.31** superseded that choice: Revenue **MUST** use **Sales API `forPay`**, **NOT** Finance `ppvz_for_pay`.

Rationale recorded later in the same thread (CHANGELOG 6.30 / 6.31):

> Finance `ppvz_for_pay` is not a reliable commercial Revenue baseline (settlement lag / incomplete coverage). The commercial layer uses `sale_date` + Sales API `forPay`; Model C / WB Settlement remain Finance-driven. Acquiring stays in Model B Net Profit; acceptance stays on Settlement.

Supporting excerpt from later reconciliation notes in the transcript:

```text
**İlk sapma Adım 0’da:** aynı aralıkta Operating Profit Sales API `salesForPay` ile, WB Settlement Finance `netForPay` ile başlıyor. Bu bilinçli mimari ayrım; sessiz formül hatası değil.

Tam ara adımlar + blame: [accounting-reconciliation-regression-audit](C:\Users\User\.cursor\projects\c-Projects-OrionShop-Profit-Dashboard\canvases\accounting-reconciliation-regression-audit.canvas.tsx)

### Aynı aralık (account 1 · 2026-06-23 → 2026-07-22)

| | Settlement | Operating Profit (Model B) |
|---|---:|---:|
| **Başlangıç** | netForPay **239 628.51** | salesForPay **393 651.48** |
| − acquiring | — | 14 821.46 |
| − logistics / storage / penalties / adj | 134 371.94 / 5 237.04 / 0 / 48 500 | aynı |
| − acceptance | 0 | — |
| Ara sonuç | **Settlement 51 519.53** | sellerPayout 190 721.04 |
| − productCost / ads | (Settlement KPI’da yok) | 170 300 / 0 |
| **Sonuç** | **51 519.53** | **OP 20 421.04** |

**İlk diverge:** `netForPay − salesForPay = −154 022.97 ₽`

### Git: ne değişti, hangi commit, neden?

1. **Hangi hesap değişti**  
   Ticari kâr **Sales API `forPay`** üzerine kuruldu (Model B Operating Profit). Settlement **Finance `netForPay`** üzerinde kaldı. Tek settlement-first P&L yerine iki paralel motor.

2. **Hangi commit**  
   `752d834493180be3530238369adbdcdc7cbd9152`  
   *Sprint 6.36.2: Model B profitability…* (2026-07-17)  
   Blame: `profit-engine-model-b.ts`, `wb-settl
```

### Model D research conclusion

For **true business Net Profit** aligned to WB weekly settlement:

```text
WB Operational Result
  = netForPay − logistics − storage − penalties − deductions − acceptance

Net Profit
  = WB Operational Result − Product Cost − Advertising
```

**Model C** is exact for the WB marketplace/operational layer (Δ = 0.00 vs Excel «Итого к оплате»). **Model D** extends C with seller-internal costs. **Models A and B** (catalog/`priceWithDisc` or `finishedPrice` minus abs marketplace fees) are **disproved** for WB-reconcilable Net Profit.

### Rejection of Sales − MarketplaceFees

Hypothesis 1 / early Model B form `Sales (priceWithDisc) − Marketplace Fees − …` is **not mathematically valid** as a WB-aligned profit engine:

- Wrong revenue layer (`priceWithDisc` ≠ realized commercial/settlement revenue)
- Double-counts marketplace fees already embedded in `netForPay`
- Overstated WB Operational by ~+513k ₽ in the Jun 15–Jul 5 proof window

See full Hypothesis 1 and Model B evaluation extracts below.

---

## 1. User — Sprint 6.31 — Final Dashboard Architecture

*(transcript line ~2452)*

# Sprint 6.31 — Final Dashboard Architecture (Business Decision)

This is a BUSINESS DECISION.

Do NOT redesign Wildberries accounting.

Do NOT modify Model C accounting.

Do NOT modify the WB Settlement page.

Implement the dashboard architecture exactly as described below.

---

# Objective

The system will contain three different financial views, each answering a different business question.

These three views must remain independent.

---

# 1. Model B (Main Dashboard)

Model B becomes the PRIMARY dashboard.

Purpose:

Commercial product profitability.

This dashboard is used for:

- pricing decisions
- Smart Pricing
- product profitability
- business performance

Date axis:

sale_date

---

Revenue Flow

Sales (priceWithDisc)

↓

Commission
(priceWithDisc − Sales API forPay)

↓

Revenue
(Sales API forPay)

↓

Logistics

↓

Storage

↓

Penalties

↓

Adjustments

↓

Product Cost

↓

Advertising

↓

Net Profit

---

Revenue

Revenue MUST use:

Sales API forPay

NOT

Finance ppvz_for_pay

---

Acquiring

Acquiring remains an independent KPI widget.

Source:

Finance acquiring_fee

Display:

- Amount
- % of Sales

Acquiring is NOT deducted from the Revenue widget.

It is deducted ONLY inside Net Profit.

---

Net Profit

Formula

Revenue

− Acquiring

− Logistics

− Storage

− Penalties

− Adjustments

− Product Cost

− Advertising

This becomes the commercial profitability calculation.

---

# 2. Profitability Breakdown

Replace the current Model B breakdown.

Instead, display the existing Model C Profitability Breakdown component in this area.

Use the existing layout exactly as shown.

Do NOT redesign the table.

Do NOT modify Model C accounting.

Purpose:

This section represents the accounting profitability and cash-flow profitability calculated from Finance data.

It must include:

- Revenue
- Product Cost
- Marketplace Fees
- Logistics
- Storage
- Advertising
- Account Adjustments
- Net Profit

using the existing Model C calculation engine.

This section allows the user to understand:

"How much money did I actually earn this period after all accounting costs?"

---

# 3. WB Settlement Page

Do NOT modify anything.

WB Settlement remains an independent screen.

Purpose:

Understand Wildberries settlement.

Show:

- WB settlement
- seller entitlement
- realization accounting
- reconciliation with Wildberries

No UI or accounting changes.

---

# Final Architecture

Model B

Purpose:

Commercial profitability.

Used for:

- Smart Pricing
- product decisions
- pricing strategy

Revenue:

Sales API forPay

Date axis:

sale_date

---

Profitability Breakdown

Purpose:

Accounting profitability.

Uses:

Existing Model C calculations.

Finance-driven.

No logic changes.

---

WB Settlement

Purpose:

Wildberries settlement reconciliation.

No changes.

---

# Validation

Provide:

1.

Verify Model B Revenue now uses Sales API forPay.

2.

Verify Acquiring is displayed as a separate KPI widget and is deducted only inside Net Profit.

3.

Verify Net Profit starts from Revenue (Sales API forPay).

4.

Verify the embedded Profitability Breakdown uses the existing Model C calculation without modification.

5.

Verify the WB Settlement page remains unchanged.

Do not redesign the UI.

Do not modify Model C accounting.

Implement exactly this business architecture.


---

## 2. Assistant — Sprint 6.31 is implemented

*(transcript line ~2465)*

Sprint 6.31 is implemented. Summary of the three-view architecture:

## Changes

### Model B (Commercial — `sale_date`)
- **Revenue** = Sales API `forPay` (`buildNetForPayFromDb`) — engine sets `revenue = salesForPay`
- **Net Profit** = Revenue − Acquiring − Logistics − Storage − Penalties − Adjustments − Product Cost − Advertising
- **Widget order:** Sales → Commission → Revenue → Logistics → Storage → Penalties → Adjustments → Product Cost → **Advertising** → **Acquiring** (standalone) → Net Profit
- Acquiring is shown separately and is **not** subtracted from the Revenue widget

### Profitability Breakdown
- Always renders **Model C** accounting breakdown (`buildModelCBreakdownLines`) — independent of the Model B/C KPI switcher
- Model C engine untouched

### WB Settlement
- No changes

---

## Validation (Account 1, 2026-06-08 → 2026-07-05)

| Check | Result |
|---|---|
| 1. Revenue = Sales API forPay | **PASS** — 444,144.75 ₽ = 444,144.75 ₽ |
| 2. Acquiring separate KPI, deducted only in Net Profit | **PASS** — Revenue 444,144.75 ₽; Acquiring 3,829.86 ₽ separate |
| 3. Net Profit starts from Revenue (forPay) | **PASS** — arithmetic diff 0.0000 |
| 4. Breakdown uses Model C engine unchanged | **PASS** — Model C netForPay 60,750.05 ₽ (finance axis, separate view) |
| 5. WB Settlement page | **Unchanged** |

Re-run: `npx tsx scripts/verify-model-b-profit.mjs 1 2026-06-08 2026-07-05`


---

## 3. Assistant — Model B (Commercial Profit) — Accounting Evaluation

*(transcript line ~1298; formula judged not mathematically valid)*

# Model B (Commercial Profit) — Accounting Evaluation

You've defined Model B as a **commercial-layer** profit model. Below is a formal evaluation against Wildberries accounting math from the prior investigation (Account 1, Jun 15–Jul 5 2026, Finance API + Weekly Excel).

---

## Model B as specified

```text
Net Profit
  = Sales (priceWithDisc)
  − Marketplace Fees
      (Commission + Acquiring + PPVZ Reward + PPVZ VW + Other + Adjustments)
  − Logistics
  − Storage
  − Product Cost
  − Advertising
```

**Business question:** Starting from commercial sales value, after marketplace and seller costs, how much true business profit remains?

That question is **economically meaningful**. The formula as written is **not mathematically valid** as a Wildberries-aligned profit engine.

---

## Verdict

| Criterion | Result |
|-----------|--------|
| Business question | Valid |
| Formula mathematically consistent with WB ledger | **No** |
| Avoids double counting | **No** |
| Produces WB-reconcilable Net Profit | **No** |
| Suitable as Profit Engine V3 foundation | **No** |

**Model B in this form is disproved** — same conclusion as the earlier Hypothesis 1 / Model B audit.

---

## Proof (same proof window)

### Step 1 — Components

| Component | Amount (₽) | Source |
|-----------|----------:|--------|
| Σ priceWithDisc (Sales API, completed sales) | 1,095,679 | Sales API |
| Marketplace Fees (dashboard definition, abs) | 171,029 | wb_finance categories |
| Logistics | 222,434 | wb_finance |
| Storage | 8,425 | wb_finance |
| Product Cost | 0 | proof window |
| Advertising | excluded | — |

### Step 2 — Model B result

```text
1,095,679 − 171,029 − 222,434 − 8,425 − 0 − 0
= 693,791 ₽   (before PC/ads)
```

Earlier full-window calc with penalties/deductions in ops gave **618,751 ₽** — same order of magnitude.

### Step 3 — WB truth (Model D / settlement path)

```text
netForPay − logistics − storage − penalties − deductions
= 411,046 − 222,434 − 8,425 − 40 − 75,000
= 105,148 ₽   (= Excel «Итого к оплате», exact)
```

### Step 4 — Error

```text
Model B − WB Operational = +513,000 to +588,000 ₽ overstatement
```

Model B does **not** answer “true business profit” in WB accounting terms — it overstates by ~5× in the proof window.

---

## Why Model B fails (three independent errors)

### Error 1 — Wrong revenue layer

`priceWithDisc` is **catalog/list price after seller discount**, not realized commercial revenue.

```text
priceWithDisc (sale rows)     = 884,402 ₽
retail_amount (realized)      = 536,582 ₽   (gross sales)
net retail (after returns)    = 387,330 ₽   (= Excel «Продажа»)

Gap: priceWithDisc overstates realized retail by ~2.3× (net) or ~1.6× (gross)
```

Cause: `priceWithDisc` excludes SPP/platform discount and (in Sales API aggregation) return netting behavior differs from finance.

**Economic meaning:**

| Field | Layer |
|-------|-------|
| priceWithDisc | Stage 1 — seller list/catalog |
| finishedPrice / retail_amount | Buyer realized payment |
| netForPay | Seller settlement after platform fees |

Model B uses **Stage 1** as revenue but **Stage 3–4** costs — mixed layers.

---

### Error 2 — Marketplace Fees double-count

Dashboard Marketplace Fees:

```text
abs(COMMISSION + ACQUIRING + PPVZ_REWARD + PPVZ_VW + OTHER + ADJUSTMENT)
= 171,029 ₽ (all finance rows, abs)
```

WB settlement embeds fees **inside** `netForPay` via **signed** adjustments:

```text
retailNet − netForPay = −23,716 ₽  (signed settlement effect)
```

Subtracting abs(MF) **after** using a price that already reflects marketplace economics double-counts platform charges. Dashboard over-deducts fees by ~**194,743 ₽** vs signed truth in this window.

Also: MF includes rows on **non-sale documents** (logistics rebill rows carry ppvz_vw) — not tied to the `priceWithDisc` numerator.

---

### Error 3 — Numerator/denominator mismatch

Model B mixes:

- **Numerator:** Sales API `priceWithDisc` (commercial API, gross completed sales)
- **Denominator costs:** Finance API `wb_finance` (settlement ledger, all operation types)

These APIs have **different row sets, date keys, and aggregation rules**. Even with perfect formulas, the sources don't form a closed ledger equation.

Evidence:

| priceWithDisc source | Net amount |
|---------------------|----------:|
| Sales API (gross completed) | 1,095,679 |
| Sales API (net of returns) | 830,839 |
| Finance API (Продажа − Возврат) | 649,922 |

Three definitions of “Sales” — Model B doesn't specify which, and none equals WB «Продажа» (387,330).

---

## What's missing from Model B

Compared to WB weekly settlement and a complete P&L:

| Cost | In Model B? | WB treatment |
|------|-------------|--------------|
| Penalties | **No** | Deducted after netForPay |
| Deductions (удержания) | Partially in Adjustments | After netForPay |
| Return Logistics | **No** | Separate cost line |
| Acceptance | Inside Other MF | After netForPay |
| Returns (goods reversal) | Unclear | Netted at forPay level |

Omitting penalties/deductions alone adds up to **75,040 ₽** error in the proof window.

---

## Does the business question have a valid answer?

**Yes — but not with this formula.**

The question *“commercial sales minus all costs = true profit”* requires:

1. **One consistent ledger** for revenue and costs
2. **Realized commercial revenue**, not catalog list price
3. **Signed fee logic**, not abs(MF) on all finance rows
4. **Return netting** at the same layer as revenue

---

## If you wanted a valid “Commercial Profit” model (Model B′)

Not implementation — accounting definition only:

```text
Commercial Revenue  = Σ retail_amount(Продажа) − Σ retail_amount(Возврат)
                    = net realized buyer-side retail (387,330 ₽ in proof window)

Commercial COGS     = Product Cost

Marketplace charges = signed settlement adjustments on sale/return rows ONLY
                    (commission + acquiring + vw_nds — NOT abs all rows, NOT ppvz_vw when ≈ commission)

Fulfillment         = logistics + storage + penalties + deductions + acceptance

Net Commercial Profit
  = Commercial Revenue
  − Marketplace charges (signed, sale/return rows)
  − Fulfillment
  − Product Cost
  − Advertising
```

Even Model B′ **does not equal** WB «Итого к оплате» minus PC — because commercial revenue (retail) ≠ settlement base (netForPay). In the proof window:

```text
netForPay (411,046) > net retail (387,330) by +23,716
```

Returns reverse at different signed fee structure. **Commercial profit and settlement profit are related but not identical metrics.**

---

## Model comparison

| Model | Starting point | Matches WB Итого? | True business profit? |
|-------|---------------|-------------------|----------------------|
| **B (your spec)** | priceWithDisc − abs(MF) − ops − PC − ads | **No (+513k)** | **No** |
| **C** | netForPay − ops | **Yes (exact)** | Partial (no PC/ads) |
| **D** | C − PC − ads | **Yes** | **Yes** |
| **B′ (revised commercial)** | retail_amount − signed fees − ops − PC − ads | No (different metric) | Valid commercial KPI, not settlement |

---

## Accounting waterfall — where Model B sits (incorrectly)

```text
priceWithDisc ──────────────────── Model B starts here ✗ (Stage 1 catalog)
    ↓ SPP / platform discount
retail_amount / finishedPrice ──── Correct commercial revenue layer
    ↓ signed: commission, acquiring, vw_nds
netForPay ──────────────────────── Settlement / Model C–D start ✓
    ↓ logistics, storage, penalties, deductions
WB Operational (Итого) ──────────── 105,148 ₽
    ↓ Product Cost, Advertising
Net Profit ──────────────────────── Model D ✓
```

Model B jumps from **Stage 1** and subtracts **Stage 3–4 costs computed with abs()** — that crosses layers and double-counts.

---

## Final answer to your purpose statement

> Starting from commercial sales value (priceWithDisc), after all marketplace costs and seller costs, how much true business profit remains?

**With `priceWithDisc` as defined today: the question cannot be answered correctly.** The formula overstates profit by hundreds of thousands of rubles because:

1. `priceWithDisc` is not realized commercial sales value
2. Marketplace Fees as currently defined double-count settlement charges
3. Revenue and cost come from incompatible API layers

**For true business Net Profit:** use **Model D** (`netForPay → WB Operational → minus PC/ads`).

**For commercial/unit economics KPI:** use **`retail_amount` or `finishedPrice`** as revenue, with **signed sale-row fees only** — a separate metric from settlement, not a substitute for Model D.


---

## 4. Assistant — Profit Engine V3 — Final Accounting Research Report

*(transcript line ~1291; executive summary + Model A/B/C/D verdicts + related rejection proof)*

### Executive Summary

Wildberries uses a **layered ledger**, not a single revenue-minus-costs equation. Marketplace fees are **embedded inside `netForPay`** before logistics and other weekly charges. Any Profit Engine that starts from `priceWithDisc` or `finishedPrice` and subtracts marketplace fees again **double-counts** and diverges from WB accounting by hundreds of thousands of rubles.

The mathematically correct foundation for **true business Net Profit** is **Model D** (two-engine architecture):

```text
WB Operational Result
  = netForPay − logistics − storage − penalties − deductions − acceptance

Net Profit
  = WB Operational Result − Product Cost − Advertising
```

**Model C** is the correct sub-formula for the WB marketplace layer. **Models A and B are disproved.**

---


### Model A / B / C / D verdicts (Part 6)

## Part 6 — Candidate Model Evaluation

**Proof window:** Jun 15–Jul 5 (report-aligned). Product Cost = 0, Advertising excluded from WB layer.

| Model | Formula | Result | vs Excel Итого | Verdict |
|-------|---------|-------:|---------------:|---------|
| **A** | finishedPrice − abs(MF) − ops | 175,567.49 | +70,419.91 | **INVALID** — wrong revenue + double fee |
| **B** | priceWithDisc − abs(MF) − ops | 618,751.28 | +513,603.70 | **INVALID** — catalog layer + double fee |
| **C** | netForPay − ops | **105,147.58** | **0.00** | **VALID** for WB Operational Result |
| **D** | C − Product Cost − Advertising | 105,147.58* | N/A (seller-internal) | **VALID** for true Net Profit |

\*PC = 0 in Account 1 proof window.

### Model D (winning architecture)

```text
┌─────────────────────────────────────────────────────────┐
│  SETTLEMENT ENGINE (matches WB weekly report)           │
├─────────────────────────────────────────────────────────┤
│  netForPay  = Σ forPay(Продажа) − Σ forPay(Возврат)      │
│  WB Op      = netForPay − logistics − storage           │
│               − penalties − deductions − acceptance     │
│  (= Excel «Итого к оплате»)                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  PROFIT ENGINE (seller true profitability)              │
├─────────────────────────────────────────────────────────┤
│  Net Profit = WB Op − Product Cost − Advertising        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  UNIT ECONOMICS (optional, separate KPI layer)          │
├─────────────────────────────────────────────────────────┤
│  Commercial revenue: finishedPrice or retail_amount     │
│  Margin indicators: vs Product Cost per unit            │
│  (NOT substituted for netForPay in profit calculation)  │
└─────────────────────────────────────────────────────────┘
```

---


### Q8 — Which Profit Model is mathematically correct?

- **Model C** — correct for **WB Operational Result** (marketplace operating layer).
- **Model D** — correct for **true business Net Profit** (= Model C − Product Cost − Advertising).
- **Models A and B — disproved.**


### Hypothesis 1 — Sales − MarketplaceFees (DISPROVED)

### Hypothesis 1 — DISPROVED

```text
Net Profit = priceWithDisc − WB Platform Costs − Logistics − Storage − Penalty − Deduction − Acceptance − Product Cost − Advertising
```

**Counter-proof (Jun 15–Jul 11 window, using Dashboard-style abs marketplace fee):**

| Component | Amount |
|-----------|-------:|
| Σ priceWithDisc (Sales API, completed) | 1,095,678.91 |
| abs(MF) = abs(comm + acq + vw + reward) | −171,029.08 |
| Operational (L+S+P+D) | −305,898.55 |
| **H1 result (before PC/ads)** | **618,751.28** |
| Excel Итого (WB truth) | **105,147.58** |
| **Error** | **+513,603.70** |

**Three independent failure modes:**

1. **Wrong revenue layer:** `priceWithDisc` (1,095,679) ≠ net realized retail (387,330) — gap **+708,349** from catalog/list vs realized economics and missing return netting in numerator.
2. **Wrong fee layer:** abs(MF) (171,029) ≠ signed settlement adjustments embedded in netForPay (−23,716 net) — fees already inside netForPay; abs() also counts fees on non-sale rows.
3. **No return netting:** Sales API priceWithDisc sums gross purchases; WB netForPay nets returns at signed forPay.

**Verdict: Hypothesis 1 is mathematically invalid.**

---


### Conclusion (Model D)

The Profit Engine must **not** reconstruct profitability from catalog prices minus decomposed fees. Wildberries already nets marketplace charges into `netForPay`. The mathematically proven path to true business Net Profit is:

```text
Net Profit = netForPay − logistics − storage − penalties − deductions − acceptance − Product Cost − Advertising
```

This equals WB «Итого к оплате» minus seller-internal costs, matches all audited weekly reports exactly, introduces no double counting, and correctly separates Settlement Engine economics from seller profitability.

**Models A and B fail by +70k and +514k respectively in the proof window.**  
**Model C is exact (Δ = 0.00 vs Excel).**  
**Model D extends C with seller-internal costs for true Net Profit.**


---

## Appendix — Sprint 6.30 user spec (superseded Revenue source)

*(transcript line ~2372; included for contrast with 6.31)*

# Sprint 6.30 — Model B Dashboard Redesign (Business Decision)

This is a BUSINESS DECISION.

Do NOT redesign the accounting model.

Do NOT change the proven money flow.

Implement the dashboard exactly as specified.

---

# Objective

Model B must become a Commercial Performance Dashboard.

The dashboard must explain how commercial sales become real business profit.

Use the proven accounting flow.

---

# Money Flow

Sales (priceWithDisc)

↓

Commission

↓

Acquiring

↓

Revenue (Finance ppvz_for_pay)

↓

Logistics

↓

Storage

↓

Penalties

↓

Adjustments

↓

Product Cost

↓

Net Profit

---

# Widget Order

1. Sales
2. Commission
3. Acquiring
4. Revenue
5. Logistics
6. Storage
7. Penalties
8. Adjustments
9. Product Cost
10. Net Profit

---

# Widget Rules

## Sales

Source

priceWithDisc

Display

- Amount
- Units Sold

Do NOT display percentage.

---

## Commission

Formula

priceWithDisc − Sales API forPay

Display

- Amount
- % of Sales

Tooltip

Wildberries marketplace sales commission.

---

## Acquiring

Source

Finance acquiring_fee

Display

- Amount
- % of Sales

Tooltip

Payment processing fee.

---

## Revenue

Source

Finance ppvz_for_pay

Title

Revenue

Display

- Amount
- % of Sales

Tooltip

Commercial revenue payable to the seller after marketplace commission and acquiring.

This becomes the commercial revenue baseline.

---

## Logistics

Display

- Amount
- % of Sales

---

## Storage

Display

- Amount
- % of Sales

---

## Penalties

Display

- Amount
- % of Sales

---

## Adjustments

Display

- Amount
- % of Sales

Monthly operational adjustments allocated to the selected reporting period.

---

## Product Cost

Display

- Amount
- % of Sales

---

## Net Profit

Formula

Revenue

− Logistics

− Storage

− Penalties

− Adjustments

− Product Cost

− Other existing operational costs

Display

- Amount
- % of Sales

---

# Profitability Breakdown

Replace the current Profitability Breakdown.

Reuse the existing Model C Profitability Breakdown component.

Do not redesign the component.

Only replace the displayed component.

---

# Dashboard Visual Rules

Sales

Existing theme color.

Commission

Orange.

Acquiring

Purple.

Revenue

Blue.

Logistics

Amber.

Storage

Gray.

Penalties

Red.

Adjustments

Dark Orange.

Product Cost

Neutral Gray.

Net Profit

Green if positive.

Red if negative.

Gray if zero.

Make the Net Profit widget approximately 25% larger than all other KPI cards.

Reason:

Net Profit is the primary business KPI and should receive the highest visual emphasis.

Do not resize any other KPI cards.

Do not modify the layout.

---

# Validation

Provide

1.

Old dashboard

↓

New dashboard

2.

Widget totals.

3.

One transaction walkthrough.

4.

Verify percentages.

5.

Verify Revenue uses Finance ppvz_for_pay.

6.

Verify Net Profit uses Revenue as its starting point.

Do not modify Model C calculations.

Do not redesign accounting.

Implement only this business decision.
