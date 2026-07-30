/**
 * Executive Rule Engine V1 — types.
 * Deterministic, explainable recommendations. No AI / ML.
 */
export type InsightSeverity = "info" | "warning" | "critical";

export type RuleCategory =
  | "profitability"
  | "revenue"
  | "inventory"
  | "marketplace-costs"
  | "categories"
  | "products"
  | "warehouses";

export type AffectedMetric = {
  id: string;
  label: string;
  value: number | string | null;
  format?: "currency" | "percent" | "number" | "text";
};

/**
 * One fired recommendation — fully traceable to ReportDocument metrics.
 */
export type ExecutiveRecommendation = {
  id: string;
  ruleId: string;
  category: RuleCategory;
  severity: InsightSeverity;
  title: string;
  shortDescription: string;
  businessExplanation: string;
  recommendedAction: string;
  affectedMetrics: AffectedMetric[];
};

export type ExecutiveRuleDefinition = {
  id: string;
  category: RuleCategory;
  name: string;
  /** When the rule evaluates true. */
  trigger: string;
  /** Default severity (may be overridden dynamically). */
  defaultSeverity: InsightSeverity;
  /** What management question it answers. */
  purpose: string;
};

export type ExecutiveRuleEngineResult = {
  engineVersion: number;
  generatedAt: string;
  recommendations: ExecutiveRecommendation[];
  /** Catalog of rules that were evaluated (fired or not). */
  evaluatedRuleIds: string[];
  firedRuleIds: string[];
};

export const EXECUTIVE_RULE_ENGINE_VERSION = 1;

export const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};
