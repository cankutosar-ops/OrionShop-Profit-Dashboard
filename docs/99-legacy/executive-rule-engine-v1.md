# Executive Rule Engine V1

Deterministic management recommendations for Marketplace Intelligence.

**Not AI. Not ML. Not NLG.**

Architecture:

```
ReportContext
  → Marketplace section builders (existing metrics)
  → Executive Rule Engine
  → ReportDocument.sections[executive recommendations]
  → Marketplace Intelligence Workspace
```

Rules consume assembled section metrics only. They do not recalculate Financial Engine formulas.

Engine version: `1` (`EXECUTIVE_RULE_ENGINE_VERSION`)

---

## Insight structure

Each fired recommendation includes:

| Field | Meaning |
|-------|---------|
| `severity` | `info` · `warning` · `critical` |
| `title` | Short management headline |
| `shortDescription` | One-line outcome |
| `businessExplanation` | Why this matters |
| `recommendedAction` | What to do next |
| `affectedMetrics` | Traceable ReportDocument metrics |
| `ruleId` | Auditable catalog id |

---

## Rule catalog

### Profitability

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `profit.net-negative` | Net Profit &lt; 0 | critical | Fix largest cost + loss SKUs before ads |
| `profit.margin-critical` | Net Margin % &lt; 0 and Revenue &gt; 0 | critical | Freeze growth; fix weak categories |
| `profit.margin-weak` | 0 ≤ Net Margin % &lt; 5 and Revenue &gt; 0 | warning | Review pricing floors + largest cost % |

### Revenue

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `revenue.without-profit` | Revenue &gt; 0 and Net Profit ≤ 0 | warning | Do not scale ads until costs/SKUs fixed |
| `revenue.brand-gap` | Top Revenue brand is loss-making or profit share ≪ revenue share | warning | Review brand pricing/cost structure |

### Inventory

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `inventory.out-of-stock` | Out of Stock count &gt; 0 | warning | Replenish or unpublish |
| `inventory.low-stock` | Low Stock count &gt; 0 | info | Schedule replenishment |

### Marketplace Costs

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `costs.largest-line` | Largest cost line ≥ 25% of Revenue | warning (critical if ≥ 45%) | Attack dominant cost lever |
| `costs.logistics-pressure` | Logistics ≥ 35% of Revenue | warning (critical if ≥ 50%) | Review warehouse allocation |

### Categories

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `categories.high-return` | Top category Return Rate ≥ 15% | warning (critical if ≥ 30%) | Review sizing/quality/listing |
| `categories.revenue-profit-mismatch` | Revenue leader ≠ profit leader | warning | Invest toward profit leader |
| `categories.lowest-margin` | Lowest-margin category Margin &lt; 10% | warning (critical if &lt; 0) | Protect price / cut leakage |

### Products

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `products.profit-concentration` | Top SKU ≥ 25% of product Net Profit | info (warning if ≥ 40%) | Protect stock |
| `products.loss-maker` | Worst SKU Net Profit &lt; 0 | warning | Raise price / cut spend / exit |
| `products.high-return` | Top Return Rate SKU ≥ 20% | warning (critical if ≥ 40%) | Fix listing/quality |

### Warehouses

| Rule ID | Trigger | Default severity | Action theme |
|---------|---------|------------------|--------------|
| `warehouses.concentration` | Top warehouse ≥ 30% contribution | info | Align stock depth |
| `warehouses.low-contribution` | Warehouse contribution in (0%, 5%) | info | Evaluate inventory distribution |

---

## Example outputs (illustrative)

**Critical — Net Profit negative**

- Explanation: Commercial Performance does not cover costs for the scope.
- Action: Prioritize largest marketplace cost line and loss-making SKUs.
- Metrics: Net Profit, Revenue, Net Margin %

**Warning — Logistics cost pressure**

- Explanation: Logistics share compresses margin regardless of top-line growth.
- Action: Review warehouse allocation and return flows.
- Metrics: Logistics ₽, Logistics % of Revenue

**Info — Product profit concentration**

- Explanation: Stockouts on this SKU would materially damage period profit.
- Action: Protect stock availability.
- Metrics: SKU, Product Net Profit, Contribution %

---

## Workspace

Marketplace Intelligence → **Executive Recommendations** (section 1).

Cards show severity, explanation, recommended action, affected KPIs, and `ruleId` for audit.

---

## Out of scope (V1)

- Prior-period “profit dropped more than 15%” (no prior period in ReportDocument yet)
- AI / LLM / confidence scores
- New Financial Engine formulas
- Favorites / Cart / Sales Funnel
