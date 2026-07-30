import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";
import { contributionPercent } from "@/lib/reporting/section-utils";

export function evaluateProductRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const { products, productProfitTotal } = input;

  const topProfit = products.topByNetProfit[0];
  if (topProfit && productProfitTotal > 0 && topProfit.value > 0) {
    const share = contributionPercent(topProfit.value, productProfitTotal);
    if (share >= 25) {
      out.push({
        id: "rec-products-concentration",
        ruleId: "products.profit-concentration",
        category: "products",
        severity: share >= 40 ? "warning" : "info",
        title: "One product concentrates profit",
        shortDescription: `${topProfit.modelCode} generates ${share.toFixed(1)}% of product Net Profit.`,
        businessExplanation:
          "Profit concentration means stockouts or listing issues on this SKU would materially damage period results.",
        recommendedAction:
          "Protect stock availability and listing quality for this SKU.",
        affectedMetrics: [
          {
            id: "sku",
            label: "SKU",
            value: topProfit.modelCode,
            format: "text",
          },
          {
            id: "netProfit",
            label: "Product Net Profit",
            value: topProfit.value,
            format: "currency",
          },
          {
            id: "contribution",
            label: "Contribution %",
            value: share,
            format: "percent",
          },
        ],
      });
    }
  }

  const worst = products.worstByNetProfit[0];
  if (worst && worst.value < 0) {
    out.push({
      id: "rec-products-loss",
      ruleId: "products.loss-maker",
      category: "products",
      severity: "warning",
      title: "Loss-making product",
      shortDescription: `${worst.modelCode} has the lowest Net Profit (${worst.value.toFixed(0)}).`,
      businessExplanation:
        "Negative Net Profit SKUs consume logistics and fee capacity without returning owner cash.",
      recommendedAction:
        "Raise price, cut spend, or exit this SKU — do not restock on autopilot.",
      affectedMetrics: [
        {
          id: "sku",
          label: "SKU",
          value: worst.modelCode,
          format: "text",
        },
        {
          id: "netProfit",
          label: "Net Profit",
          value: worst.value,
          format: "currency",
        },
        {
          id: "product",
          label: "Product",
          value: worst.productName,
          format: "text",
        },
      ],
    });
  }

  const highReturn = products.highestReturn[0];
  if (highReturn && highReturn.value >= 20) {
    out.push({
      id: "rec-products-high-return",
      ruleId: "products.high-return",
      category: "products",
      severity: highReturn.value >= 40 ? "critical" : "warning",
      title: "Product has elevated return rate",
      shortDescription: `${highReturn.modelCode} returns at ${highReturn.value.toFixed(1)}%.`,
      businessExplanation:
        "High return SKUs inflate logistics and cancel the benefit of unit velocity.",
      recommendedAction:
        "Review sizing, product quality, or listing content for this SKU before restocking.",
      affectedMetrics: [
        {
          id: "sku",
          label: "SKU",
          value: highReturn.modelCode,
          format: "text",
        },
        {
          id: "returnRate",
          label: "Return Rate %",
          value: highReturn.value,
          format: "percent",
        },
        {
          id: "product",
          label: "Product",
          value: highReturn.productName,
          format: "text",
        },
      ],
    });
  }

  return out;
}
