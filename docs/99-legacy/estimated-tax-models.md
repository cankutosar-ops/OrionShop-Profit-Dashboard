# Estimated Tax Models

The project intentionally uses **two different Estimated Tax models**. They answer different business questions and must not be collapsed into one formula.

---

## Historical Reporting (Financial Engine)

**Purpose:** Report what actually happened on completed sales.

```
Estimated Tax = Tax Rate × Σ(finishedPrice)
```

| | |
|---|---|
| **Source** | Sales API `finishedPrice` (net of returns; DB: `wb_sales.revenue`) |
| **Used by** | Dashboard, Commercial Performance, Product Analytics, Reports, Financial Engine, historical profitability |
| **Code** | `src/lib/financial-engine-tax.ts` → `calculateEstimatedTax` |
| **Wiring** | `customerPaid = buildNetFinishedPriceFromDb(sales)` into Commercial Performance |

**Not** calculated from: Revenue, Seller Payout, `ppvz_for_pay`, `priceWithDisc`, or `forPay`.

**Question answered:** *What tax was incurred on completed sales?*

---

## Smart Pricing

**Purpose:** Predict the selling price required for a target profit (forward simulation).

```
Tax Base = Sale Price − Marketplace Fee
Estimated Tax = Tax Rate × Tax Base
```

Flow:

```
Sale Price
→ Marketplace Fee
→ Tax
→ Logistics
→ Storage
→ Product Cost
→ Advertising
→ Net Profit
```

| | |
|---|---|
| **Used by** | Smart Pricing, Profit Simulator |
| **Code** | `src/lib/smart-pricing.ts` (`buildModelBUnitMetrics`, `solveRecommendedPrice`) |
| **Tax base** | `P × (1 − commission%)` — amount remaining after Marketplace Fee |

Smart Pricing must **not** use the historical Σ(finishedPrice) reporting formula.

**Question answered:** *What selling price is required to achieve the target profit?*

---

## Design decision

| | Historical Reporting | Smart Pricing |
|---|---|---|
| Nature | Accounting / reporting | Commercial pricing simulation |
| Tax base | Customer paid (`finishedPrice`) | Post–Marketplace Fee amount |
| Time orientation | Past (completed sales) | Future (recommended price) |

This difference is **intentional and expected**.

Do not unify the tax bases in future refactors. Shared helpers (e.g. `Tax% × base`) are fine; the **choice of base** must remain module-specific.

Cursor rule: `.cursor/rules/estimated-tax-dual-model.mdc`
