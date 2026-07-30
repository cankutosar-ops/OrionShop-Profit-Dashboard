/**
 * Executive Recommendations section — output of the Executive Rule Engine.
 * Presentation wrapper only; rules live in executive-rule-engine/.
 */
import type { ReportSection } from "@/lib/reporting/types";
import type {
  ExecutiveRecommendation,
  ExecutiveRuleEngineResult,
} from "@/lib/reporting/executive-rule-engine";

export type MarketplaceExecutiveInsightsData = {
  engineVersion: number;
  generatedAt: string;
  recommendations: ExecutiveRecommendation[];
  evaluatedRuleIds: string[];
  firedRuleIds: string[];
};

export function buildMarketplaceExecutiveInsightsSection(
  result: ExecutiveRuleEngineResult
): ReportSection<MarketplaceExecutiveInsightsData> {
  return {
    id: "marketplace-executive-insights",
    kind: "marketplace-executive-insights",
    title: "Executive Recommendations",
    description:
      "Deterministic management recommendations from the Executive Rule Engine — not AI",
    data: {
      engineVersion: result.engineVersion,
      generatedAt: result.generatedAt,
      recommendations: result.recommendations,
      evaluatedRuleIds: result.evaluatedRuleIds,
      firedRuleIds: result.firedRuleIds,
    },
  };
}
