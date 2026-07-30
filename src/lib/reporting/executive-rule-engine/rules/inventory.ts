import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import type { ExecutiveRecommendation } from "@/lib/reporting/executive-rule-engine/types";

export function evaluateInventoryRules(
  input: RuleEngineInput
): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  const inv = input.inventory;
  if (!inv || !inv.available) return out;

  if (inv.outOfStock > 0) {
    out.push({
      id: "rec-inventory-oos",
      ruleId: "inventory.out-of-stock",
      category: "inventory",
      severity: "warning",
      title: "Out-of-stock models detected",
      shortDescription: `${inv.outOfStock} model(s) have no available stock.`,
      businessExplanation:
        "Out-of-stock listings cannot convert demand. If any are historical sellers, the period is leaving revenue on the table.",
      recommendedAction:
        "Replenish or unpublish OOS models; prioritize SKUs that appear on product profit boards.",
      affectedMetrics: [
        {
          id: "outOfStock",
          label: "Out of Stock",
          value: inv.outOfStock,
          format: "number",
        },
        {
          id: "models",
          label: "Models",
          value: inv.modelCount,
          format: "number",
        },
      ],
    });
  }

  if (inv.lowStock > 0) {
    out.push({
      id: "rec-inventory-low",
      ruleId: "inventory.low-stock",
      category: "inventory",
      severity: "info",
      title: "Low-stock models need attention",
      shortDescription: `${inv.lowStock} model(s) are flagged Low Stock.`,
      businessExplanation:
        "Low stock is an early warning before stockouts interrupt sales velocity on active listings.",
      recommendedAction:
        "Schedule replenishment for low-stock SKUs that still generate orders or profit.",
      affectedMetrics: [
        {
          id: "lowStock",
          label: "Low Stock",
          value: inv.lowStock,
          format: "number",
        },
        {
          id: "healthy",
          label: "Healthy",
          value: inv.healthy,
          format: "number",
        },
      ],
    });
  }

  return out;
}
