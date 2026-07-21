import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

/** Shared KPI number presentation — identical rules across modules. */
export function formatKpiCurrency(value: number, currency = "RUB"): string {
  return formatCurrency(value, currency);
}

export function formatKpiCount(value: number): string {
  return formatNumber(value);
}

export function formatKpiPercent(value: number, decimals = 1): string {
  return formatPercent(value, decimals);
}

export type MetricTrendInput = {
  /** Percent change vs comparison period. Omit / null → no trend shown. */
  percentChange: number | null | undefined;
  /** Short context label, e.g. "vs prior period". */
  label?: string;
};

export type MetricTrendDisplay = {
  direction: "up" | "down" | "stable";
  /** Signed percent for display math. */
  value: number;
  label: string;
  symbol: "▲" | "▼" | "■";
};

/**
 * Build an honest trend only when comparison data exists.
 * Never invent values — returns null when percentChange is missing/non-finite.
 */
export function buildMetricTrend(
  input: MetricTrendInput
): MetricTrendDisplay | null {
  const raw = input.percentChange;
  if (raw == null || !Number.isFinite(raw)) return null;

  const value = Math.round(raw * 10) / 10;
  const label = input.label ?? "vs prior period";

  if (Math.abs(value) < 0.05) {
    return { direction: "stable", value: 0, label, symbol: "■" };
  }

  if (value > 0) {
    return { direction: "up", value, label, symbol: "▲" };
  }

  return { direction: "down", value, label, symbol: "▼" };
}

/** Percent change helper from two known totals (presentation only). */
export function percentChange(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (prior === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - prior) / Math.abs(prior)) * 100;
}

/** Inclusive prior window of equal length, immediately before `from` (UTC dates). */
export function priorInclusiveRange(
  from: string,
  to: string
): { from: string; to: string } | null {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return null;
  }
  const dayMs = 86_400_000;
  const days = Math.round((toMs - fromMs) / dayMs) + 1;
  const priorToMs = fromMs - dayMs;
  const priorFromMs = priorToMs - (days - 1) * dayMs;
  return {
    from: new Date(priorFromMs).toISOString().slice(0, 10),
    to: new Date(priorToMs).toISOString().slice(0, 10),
  };
}