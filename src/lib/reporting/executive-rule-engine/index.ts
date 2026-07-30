/**
 * Executive Rule Engine V1 — run all rule groups.
 * Consumes ReportDocument section metrics only. No AI / new FE math.
 */
import { EXECUTIVE_RULE_CATALOG } from "@/lib/reporting/executive-rule-engine/catalog";
import type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
import { evaluateCategoryRules } from "@/lib/reporting/executive-rule-engine/rules/categories";
import { evaluateInventoryRules } from "@/lib/reporting/executive-rule-engine/rules/inventory";
import { evaluateMarketplaceCostRules } from "@/lib/reporting/executive-rule-engine/rules/marketplace-costs";
import { evaluateProductRules } from "@/lib/reporting/executive-rule-engine/rules/products";
import { evaluateProfitabilityRules } from "@/lib/reporting/executive-rule-engine/rules/profitability";
import { evaluateRevenueRules } from "@/lib/reporting/executive-rule-engine/rules/revenue";
import { evaluateWarehouseRules } from "@/lib/reporting/executive-rule-engine/rules/warehouses";
import {
  EXECUTIVE_RULE_ENGINE_VERSION,
  SEVERITY_ORDER,
  type ExecutiveRecommendation,
  type ExecutiveRuleEngineResult,
} from "@/lib/reporting/executive-rule-engine/types";

function sortRecommendations(
  rows: ExecutiveRecommendation[]
): ExecutiveRecommendation[] {
  return [...rows].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });
}

export function runExecutiveRuleEngine(
  input: RuleEngineInput
): ExecutiveRuleEngineResult {
  const recommendations = sortRecommendations([
    ...evaluateProfitabilityRules(input),
    ...evaluateRevenueRules(input),
    ...evaluateInventoryRules(input),
    ...evaluateMarketplaceCostRules(input),
    ...evaluateCategoryRules(input),
    ...evaluateProductRules(input),
    ...evaluateWarehouseRules(input),
  ]);

  const firedRuleIds = [...new Set(recommendations.map((r) => r.ruleId))];

  return {
    engineVersion: EXECUTIVE_RULE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    recommendations,
    evaluatedRuleIds: EXECUTIVE_RULE_CATALOG.map((r) => r.id),
    firedRuleIds,
  };
}

export {
  EXECUTIVE_RULE_CATALOG,
  getRuleDefinition,
} from "@/lib/reporting/executive-rule-engine/catalog";
export type { RuleEngineInput } from "@/lib/reporting/executive-rule-engine/input";
export type {
  AffectedMetric,
  ExecutiveRecommendation,
  ExecutiveRuleDefinition,
  ExecutiveRuleEngineResult,
  InsightSeverity,
  RuleCategory,
} from "@/lib/reporting/executive-rule-engine/types";
export { EXECUTIVE_RULE_ENGINE_VERSION } from "@/lib/reporting/executive-rule-engine/types";
