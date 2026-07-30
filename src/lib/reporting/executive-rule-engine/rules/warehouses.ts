import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";

export function evaluateWarehouseRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const { warehouses } = input;
  if (!warehouses.available || warehouses.rows.length === 0) return out;

  const top = warehouses.rows[0];
  if (top && top.contributionPercent >= 30) {
    out.push({
      id: "rec-warehouses-concentration",
      ruleId: "warehouses.concentration",
      category: "warehouses",
      severity: "info",
      title: "Warehouse sales are concentrated",
      shortDescription: `${top.warehouse} contributes ${top.contributionPercent.toFixed(1)}% of warehouse Revenue.`,
      businessExplanation:
        "Sales concentration means inventory depth should follow the warehouses that already convert demand.",
      recommendedAction:
        "Align stock depth to this warehouse; avoid overfilling low-contribution locations.",
      affectedMetrics: [
        {
          id: "warehouse",
          label: "Warehouse",
          value: top.warehouse,
          format: "text",
        },
        {
          id: "contribution",
          label: "Contribution %",
          value: top.contributionPercent,
          format: "percent",
        },
        {
          id: "revenue",
          label: "Warehouse Revenue",
          value: top.revenue,
          format: "currency",
        },
      ],
    });
  }

  const low = [...warehouses.rows]
    .filter((r) => r.contributionPercent > 0 && r.contributionPercent < 5)
    .sort((a, b) => a.contributionPercent - b.contributionPercent)[0];

  if (low) {
    out.push({
      id: "rec-warehouses-low",
      ruleId: "warehouses.low-contribution",
      category: "warehouses",
      severity: "info",
      title: "Low-contribution warehouse",
      shortDescription: `${low.warehouse} contributes only ${low.contributionPercent.toFixed(1)}% of warehouse Revenue.`,
      businessExplanation:
        "Warehouses with very small sales share may be holding inventory that would sell faster elsewhere.",
      recommendedAction:
        "Evaluate inventory distribution — move or stop replenishing stock that does not sell here.",
      affectedMetrics: [
        {
          id: "warehouse",
          label: "Warehouse",
          value: low.warehouse,
          format: "text",
        },
        {
          id: "contribution",
          label: "Contribution %",
          value: low.contributionPercent,
          format: "percent",
        },
        {
          id: "orders",
          label: "Orders",
          value: low.orders,
          format: "number",
        },
        {
          id: "revenue",
          label: "Revenue",
          value: low.revenue,
          format: "currency",
        },
      ],
    });
  }

  return out;
}
