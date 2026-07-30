/**
 * Auditable catalog of Executive Rule Engine V1 rules.
 * Documentation source of truth — keep in sync with rule implementations.
 */
import type { ExecutiveRuleDefinition } from "@/lib/reporting/executive-rule-engine/types";

export const EXECUTIVE_RULE_CATALOG: ExecutiveRuleDefinition[] = [
  {
    id: "profit.net-negative",
    category: "profitability",
    name: "Net Profit is negative",
    trigger: "Net Profit < 0 for the selected Report Scope",
    defaultSeverity: "critical",
    purpose: "Flag when the period destroys cash after marketplace costs and tax.",
  },
  {
    id: "profit.margin-critical",
    category: "profitability",
    name: "Net Margin is negative",
    trigger: "Net Margin % < 0 and Revenue > 0",
    defaultSeverity: "critical",
    purpose: "Surface margin collapse even when absolute loss is small.",
  },
  {
    id: "profit.margin-weak",
    category: "profitability",
    name: "Net Margin is weak",
    trigger: "0 ≤ Net Margin % < 5 and Revenue > 0",
    defaultSeverity: "warning",
    purpose: "Warn before the business slips into loss territory.",
  },
  {
    id: "revenue.without-profit",
    category: "revenue",
    name: "Revenue without profit",
    trigger: "Revenue > 0 and Net Profit ≤ 0",
    defaultSeverity: "warning",
    purpose: "Stop treating top-line growth as success when profit is absent.",
  },
  {
    id: "revenue.brand-gap",
    category: "revenue",
    name: "Brand revenue vs profit gap",
    trigger:
      "A brand is among the top 2 by Revenue but has Net Profit ≤ 0, or its profit share is < 50% of its revenue share",
    defaultSeverity: "warning",
    purpose: "Find brands that look strong on Revenue but weak on profit.",
  },
  {
    id: "inventory.out-of-stock",
    category: "inventory",
    name: "Out-of-stock models",
    trigger: "Out of Stock model count > 0",
    defaultSeverity: "warning",
    purpose: "Recover lost sales from empty listings.",
  },
  {
    id: "inventory.low-stock",
    category: "inventory",
    name: "Low-stock models",
    trigger: "Low Stock model count > 0",
    defaultSeverity: "info",
    purpose: "Replenish before stockouts hit bestsellers.",
  },
  {
    id: "costs.largest-line",
    category: "marketplace-costs",
    name: "Dominant marketplace cost",
    trigger: "Largest cost line ≥ 25% of Revenue",
    defaultSeverity: "warning",
    purpose: "Point to the primary cost lever for margin recovery.",
  },
  {
    id: "costs.logistics-pressure",
    category: "marketplace-costs",
    name: "Logistics cost pressure",
    trigger: "Logistics % of Revenue ≥ 35%",
    defaultSeverity: "warning",
    purpose: "Highlight logistics as a structural margin drag.",
  },
  {
    id: "categories.high-return",
    category: "categories",
    name: "Highest return category",
    trigger: "Top category Return Rate ≥ 15%",
    defaultSeverity: "warning",
    purpose: "Reduce returns where quality/sizing/listing issues concentrate.",
  },
  {
    id: "categories.revenue-profit-mismatch",
    category: "categories",
    name: "Category revenue ≠ profit leader",
    trigger: "Highest Revenue category ≠ highest Net Profit category",
    defaultSeverity: "warning",
    purpose: "Avoid investing in revenue-only categories.",
  },
  {
    id: "categories.lowest-margin",
    category: "categories",
    name: "Lowest margin category",
    trigger: "Lowest-margin category with Revenue > 0 has Margin < 10%",
    defaultSeverity: "warning",
    purpose: "Protect or reprice weak-margin categories before scaling.",
  },
  {
    id: "products.profit-concentration",
    category: "products",
    name: "Product profit concentration",
    trigger: "Top product Contribution % ≥ 25% of total product Net Profit",
    defaultSeverity: "info",
    purpose: "Protect stock on the profit engine SKU.",
  },
  {
    id: "products.loss-maker",
    category: "products",
    name: "Loss-making product",
    trigger: "Worst product Net Profit < 0",
    defaultSeverity: "warning",
    purpose: "Decide raise price / cut spend / exit for loss SKUs.",
  },
  {
    id: "products.high-return",
    category: "products",
    name: "Highest return product",
    trigger: "Top product by Return Rate ≥ 20% and has Units Sold or Returned > 0",
    defaultSeverity: "warning",
    purpose: "Fix listing/quality on return-heavy SKUs.",
  },
  {
    id: "warehouses.low-contribution",
    category: "warehouses",
    name: "Low-contribution warehouse",
    trigger: "A warehouse contributes > 0% and < 5% of warehouse Revenue",
    defaultSeverity: "info",
    purpose: "Evaluate whether inventory is stranded in low-sales warehouses.",
  },
  {
    id: "warehouses.concentration",
    category: "warehouses",
    name: "Warehouse sales concentration",
    trigger: "Top warehouse Contribution % ≥ 30%",
    defaultSeverity: "info",
    purpose: "Align stock depth to the warehouse that actually sells.",
  },
];

export function getRuleDefinition(
  ruleId: string
): ExecutiveRuleDefinition | undefined {
  return EXECUTIVE_RULE_CATALOG.find((r) => r.id === ruleId);
}
