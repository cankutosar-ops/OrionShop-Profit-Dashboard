import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";

export function evaluateProfitabilityRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const { revenue, netProfit, marginPercent } = input.profitability;

  if (netProfit < 0) {
    out.push({
      id: "rec-profit-net-negative",
      ruleId: "profit.net-negative",
      category: "profitability",
      severity: "critical",
      title: "Net Profit is negative",
      shortDescription: "The selected period is loss-making after marketplace costs.",
      businessExplanation:
        "Net Profit below zero means Commercial Performance does not cover product cost, marketplace fees, logistics, and estimated tax for this Report Scope.",
      recommendedAction:
        "Prioritize the largest marketplace cost line and loss-making SKUs before increasing ad spend or expanding assortment.",
      affectedMetrics: [
        {
          id: "netProfit",
          label: "Net Profit",
          value: netProfit,
          format: "currency",
        },
        {
          id: "revenue",
          label: "Revenue",
          value: revenue,
          format: "currency",
        },
        {
          id: "margin",
          label: "Net Margin %",
          value: marginPercent,
          format: "percent",
        },
      ],
    });
  }

  if (revenue > 0 && marginPercent < 0) {
    out.push({
      id: "rec-profit-margin-critical",
      ruleId: "profit.margin-critical",
      category: "profitability",
      severity: "critical",
      title: "Net Margin is negative",
      shortDescription: "Every ruble of Revenue currently destroys margin.",
      businessExplanation:
        "Negative Net Margin confirms unit economics are underwater for the selected scope — growth would amplify losses.",
      recommendedAction:
        "Freeze growth experiments; fix fee, logistics, and pricing on the worst margin categories first.",
      affectedMetrics: [
        {
          id: "margin",
          label: "Net Margin %",
          value: marginPercent,
          format: "percent",
        },
        {
          id: "revenue",
          label: "Revenue",
          value: revenue,
          format: "currency",
        },
      ],
    });
  } else if (revenue > 0 && marginPercent >= 0 && marginPercent < 5) {
    out.push({
      id: "rec-profit-margin-weak",
      ruleId: "profit.margin-weak",
      category: "profitability",
      severity: "warning",
      title: "Net Margin is weak",
      shortDescription: "Margin is under 5% — little buffer against cost shocks.",
      businessExplanation:
        "A thin Net Margin leaves no room for logistics spikes, returns, or fee changes without turning the period negative.",
      recommendedAction:
        "Review pricing floors and the largest cost % of Revenue before scaling volume.",
      affectedMetrics: [
        {
          id: "margin",
          label: "Net Margin %",
          value: marginPercent,
          format: "percent",
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

  return out;
}
