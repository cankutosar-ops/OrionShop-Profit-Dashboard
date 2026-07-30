import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";
import { contributionPercent } from "@/lib/reporting/section-utils";

export function evaluateRevenueRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const { revenue, netProfit } = input.profitability;

  if (revenue > 0 && netProfit <= 0) {
    out.push({
      id: "rec-revenue-without-profit",
      ruleId: "revenue.without-profit",
      category: "revenue",
      severity: "warning",
      title: "Revenue without profit",
      shortDescription: "Top-line activity is not converting into Net Profit.",
      businessExplanation:
        "Revenue is present while Net Profit is zero or negative. Scaling this Revenue profile increases marketplace volume without owner cash.",
      recommendedAction:
        "Do not increase ads until the largest cost line and loss-making products are addressed.",
      affectedMetrics: [
        {
          id: "revenue",
          label: "Revenue",
          value: revenue,
          format: "currency",
        },
        {
          id: "netProfit",
          label: "Net Profit",
          value: netProfit,
          format: "currency",
        },
      ],
    });
  }

  const brands = [...input.brands].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = brands.reduce((sum, b) => sum + b.revenue, 0);
  const totalProfit = brands.reduce((sum, b) => sum + b.finalNetProfit, 0);
  const topBrands = brands.slice(0, 2);

  for (const brand of topBrands) {
    if (brand.revenue <= 0) continue;
    const revShare = contributionPercent(brand.revenue, totalRevenue);
    const profitShare = contributionPercent(brand.finalNetProfit, totalProfit);
    const lossMaking = brand.finalNetProfit <= 0;
    const profitLag =
      totalProfit > 0 && profitShare < revShare * 0.5 && revShare >= 20;

    if (lossMaking || profitLag) {
      out.push({
        id: `rec-revenue-brand-gap-${brand.id}`,
        ruleId: "revenue.brand-gap",
        category: "revenue",
        severity: "warning",
        title: "Brand generates high revenue but weak profit",
        shortDescription: `${brand.name} ranks high on Revenue without matching profit contribution.`,
        businessExplanation: lossMaking
          ? `${brand.name} is among the top Revenue brands but Net Profit is ≤ 0 for this scope.`
          : `${brand.name} contributes ${revShare.toFixed(1)}% of brand Revenue but only ${profitShare.toFixed(1)}% of brand Net Profit.`,
        recommendedAction:
          "Review pricing and cost structure for this brand before allocating more inventory or marketing.",
        affectedMetrics: [
          {
            id: "brand",
            label: "Brand",
            value: brand.name,
            format: "text",
          },
          {
            id: "brandRevenue",
            label: "Brand Revenue",
            value: brand.revenue,
            format: "currency",
          },
          {
            id: "brandProfit",
            label: "Brand Net Profit",
            value: brand.finalNetProfit,
            format: "currency",
          },
          {
            id: "revenueShare",
            label: "Revenue Share %",
            value: revShare,
            format: "percent",
          },
        ],
      });
      break; // one brand-gap insight is enough
    }
  }

  return out;
}
