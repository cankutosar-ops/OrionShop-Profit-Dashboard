import type { HealthLevel, OverallHealthLabel } from "./types";

/** Warning thresholds (days behind expected). Critical = warn + extra. */
export const FRESHNESS_WARN_DAYS = {
  orders: 2,
  sales: 2,
  finance: 7,
  inventory: 2,
} as const;

export const FRESHNESS_CRITICAL_DAYS = {
  orders: 5,
  sales: 5,
  finance: 14,
  inventory: 7,
} as const;

export function freshnessStatus(
  daysBehind: number | null,
  entity: keyof typeof FRESHNESS_WARN_DAYS,
  empty: boolean
): HealthLevel {
  if (empty) return "critical";
  if (daysBehind == null) return "warning";
  if (daysBehind > FRESHNESS_CRITICAL_DAYS[entity]) return "critical";
  if (daysBehind > FRESHNESS_WARN_DAYS[entity]) return "warning";
  return "healthy";
}

export function overallLabelFromScore(score: number): OverallHealthLabel {
  if (score >= 90) return "Healthy";
  if (score >= 60) return "Needs Attention";
  return "Critical";
}

/**
 * Deterministic 0–100 score from monitoring signals only.
 * Does not change sync or financial calculations.
 */
export function computeProductionHealthScore(input: {
  schemaPass: boolean;
  freshness: Array<{ status: HealthLevel }>;
  syncStatus: string | null;
  alertCriticalCount: number;
  alertWarningCount: number;
}): number {
  let score = 100;

  if (!input.schemaPass) score -= 40;

  for (const row of input.freshness) {
    if (row.status === "critical") score -= 15;
    else if (row.status === "warning") score -= 8;
  }

  const sync = (input.syncStatus ?? "").toLowerCase();
  if (sync === "failed") score -= 20;
  else if (sync === "partial" || sync === "warning") score -= 10;

  score -= Math.min(20, input.alertCriticalCount * 5);
  score -= Math.min(10, input.alertWarningCount * 2);

  return Math.max(0, Math.min(100, score));
}
