import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";

export function evaluateCategoryRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const cats = input.categories.categories;
  if (cats.length === 0) return out;

  const byReturn = [...cats].sort((a, b) => b.returnRate - a.returnRate)[0];
  if (byReturn && byReturn.returnRate >= 15) {
    out.push({
      id: "rec-categories-high-return",
      ruleId: "categories.high-return",
      category: "categories",
      severity: byReturn.returnRate >= 30 ? "critical" : "warning",
      title: "Category has highest return rate",
      shortDescription: `${byReturn.categoryName} leads returns at ${byReturn.returnRate.toFixed(1)}%.`,
      businessExplanation:
        "Elevated category returns destroy logistics efficiency and Net Margin even when Revenue looks healthy.",
      recommendedAction:
        "Review sizing, product quality, or listing accuracy for this category before restocking.",
      affectedMetrics: [
        {
          id: "category",
          label: "Category",
          value: byReturn.categoryName,
          format: "text",
        },
        {
          id: "returnRate",
          label: "Return Rate %",
          value: byReturn.returnRate,
          format: "percent",
        },
        {
          id: "revenue",
          label: "Category Revenue",
          value: byReturn.revenue,
          format: "currency",
        },
      ],
    });
  }

  const byRevenue = [...cats].sort((a, b) => b.revenue - a.revenue)[0];
  const byProfit = [...cats].sort((a, b) => b.netProfit - a.netProfit)[0];
  if (
    byRevenue &&
    byProfit &&
    byRevenue.categoryName !== byProfit.categoryName &&
    byRevenue.revenue > 0
  ) {
    out.push({
      id: "rec-categories-mismatch",
      ruleId: "categories.revenue-profit-mismatch",
      category: "categories",
      severity: "warning",
      title: "Category revenue leader is not the profit leader",
      shortDescription: `${byRevenue.categoryName} leads Revenue; ${byProfit.categoryName} leads Net Profit.`,
      businessExplanation:
        "Investing only where Revenue is highest can scale a weaker margin structure. Profit leadership is the better capital allocation signal.",
      recommendedAction:
        "Prefer assortment and ads toward the profit-leading category; audit cost structure on the revenue leader.",
      affectedMetrics: [
        {
          id: "revenueCategory",
          label: "Revenue Leader",
          value: byRevenue.categoryName,
          format: "text",
        },
        {
          id: "profitCategory",
          label: "Profit Leader",
          value: byProfit.categoryName,
          format: "text",
        },
        {
          id: "revenueLeaderProfit",
          label: "Revenue Leader Net Profit",
          value: byRevenue.netProfit,
          format: "currency",
        },
      ],
    });
  }

  const lowestMargin = input.categories.boards.lowestMargin[0];
  const lowestRow = cats.find((c) => c.categoryName === lowestMargin?.categoryName);
  if (lowestRow && lowestRow.revenue > 0 && lowestRow.marginPercent < 10) {
    out.push({
      id: "rec-categories-low-margin",
      ruleId: "categories.lowest-margin",
      category: "categories",
      severity: lowestRow.marginPercent < 0 ? "critical" : "warning",
      title: "Lowest margin category needs protection",
      shortDescription: `${lowestRow.categoryName} margin is ${lowestRow.marginPercent.toFixed(1)}%.`,
      businessExplanation:
        "The weakest-margin category is the first place fee or logistics shocks turn growth into losses.",
      recommendedAction:
        "Protect price or cut cost leakage in this category before increasing volume.",
      affectedMetrics: [
        {
          id: "category",
          label: "Category",
          value: lowestRow.categoryName,
          format: "text",
        },
        {
          id: "margin",
          label: "Margin %",
          value: lowestRow.marginPercent,
          format: "percent",
        },
        {
          id: "netProfit",
          label: "Net Profit",
          value: lowestRow.netProfit,
          format: "currency",
        },
      ],
    });
  }

  return out;
}
