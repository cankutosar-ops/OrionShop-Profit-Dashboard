import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";

export function evaluateMarketplaceCostRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const { costs } = input;
  if (costs.lines.length === 0 || costs.revenueBase <= 0) return out;

  const largest = [...costs.lines].sort((a, b) => b.amount - a.amount)[0];
  if (largest && largest.percentOfRevenue >= 25) {
    const severity =
      largest.percentOfRevenue >= 45 ? "critical" : "warning";
    out.push({
      id: "rec-costs-largest",
      ruleId: "costs.largest-line",
      category: "marketplace-costs",
      severity,
      title: "Dominant marketplace cost",
      shortDescription: `${largest.label} is the largest cost line at ${largest.percentOfRevenue.toFixed(1)}% of Revenue.`,
      businessExplanation:
        "When a single marketplace cost exceeds a quarter of Revenue, it is the primary lever for margin recovery — not a secondary optimization.",
      recommendedAction:
        largest.id === "logistics"
          ? "Review warehouse allocation and shipping profile to reduce logistics pressure."
          : `Review ${largest.label} drivers before increasing volume.`,
      affectedMetrics: [
        {
          id: "costLine",
          label: largest.label,
          value: largest.amount,
          format: "currency",
        },
        {
          id: "costPct",
          label: "% of Revenue",
          value: largest.percentOfRevenue,
          format: "percent",
        },
        {
          id: "totalCosts",
          label: "Total Costs",
          value: costs.totalAmount,
          format: "currency",
        },
      ],
    });
  }

  const logistics = costs.lines.find((l) => l.id === "logistics");
  if (logistics && logistics.percentOfRevenue >= 35) {
    out.push({
      id: "rec-costs-logistics",
      ruleId: "costs.logistics-pressure",
      category: "marketplace-costs",
      severity: logistics.percentOfRevenue >= 50 ? "critical" : "warning",
      title: "Logistics cost pressure",
      shortDescription: `Logistics is ${logistics.percentOfRevenue.toFixed(1)}% of Revenue.`,
      businessExplanation:
        "Elevated logistics share compresses Net Margin regardless of top-line growth. Warehouse mix and return logistics are typical drivers.",
      recommendedAction:
        "Review warehouse allocation and return flows; align stock to warehouses that already sell efficiently.",
      affectedMetrics: [
        {
          id: "logistics",
          label: "Logistics",
          value: logistics.amount,
          format: "currency",
        },
        {
          id: "logisticsPct",
          label: "Logistics % of Revenue",
          value: logistics.percentOfRevenue,
          format: "percent",
        },
      ],
    });
  }

  return out;
}
