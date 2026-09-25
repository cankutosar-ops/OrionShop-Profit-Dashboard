/**
 * Smart Pricing forward inputs use a recent adaptive cost window.
 *
 * Cost basis (fee / logistics / storage): 30/60/90 days, Product→Category→Account.
 * ASP / market comparison: recent 14–30 days only (fixed at ASP_WINDOW_DAYS).
 * Dashboard reporting date range must never drive recommended price inputs.
 */

import type { CommissionWindowKey } from "@/lib/smart-pricing-types";
import { buildInclusiveDateRange } from "@/lib/utils";
import type { ScopedDateRange } from "@/types/database";

/** Supported adaptive cost-history band. */
export const SMART_PRICING_COST_WINDOW_MIN_DAYS = 30;
export const SMART_PRICING_COST_WINDOW_MAX_DAYS = 90;

/** Adaptive 30/60/90-day cost source; explicit replay windows remain available. */
export const SMART_PRICING_COST_WINDOW_DEFAULT = "range" as const;

/**
 * ASP / live market comparison window (locked: 14–30 days).
 * Uses the upper bound of the recent band for a stable short-horizon ASP.
 */
export const SMART_PRICING_ASP_WINDOW_DAYS = 30;

/**
 * Max history fetched for Smart Pricing (covers UI replay windows up to 180).
 * Independent of the dashboard date picker.
 */
export const SMART_PRICING_DATA_LOOKBACK_DAYS = 180;

export type PreferredCostWindowKey = "30" | "60" | "90";

/**
 * Build the tenant-scoped data range used for Smart Pricing fetches.
 * Keeps company / account / brand from the page scope; replaces from/to
 * with a fixed lookback ending today.
 */
export function buildSmartPricingDataScope(scope: ScopedDateRange): ScopedDateRange {
  const { from, to } = buildInclusiveDateRange(SMART_PRICING_DATA_LOOKBACK_DAYS);
  return {
    ...scope,
    from,
    to,
  };
}

/** Inclusive start date for an N-day window ending on `to` (YYYY-MM-DD). */
export function lookbackDateFrom(to: string, days: number): string {
  const end = new Date(`${to}T12:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return start.toISOString().slice(0, 10);
}

export function aspWindowDateFrom(scopeTo: string): string {
  return lookbackDateFrom(scopeTo, SMART_PRICING_ASP_WINDOW_DAYS);
}

/**
 * Legacy helper retained for replay compatibility. The runtime adaptive
 * source/window selection is implemented in smart-pricing-settings.
 */
export function resolvePreferredCostWindow(params: {
  window: CommissionWindowKey;
  productUnits60: number;
  minProductSales: number;
}): PreferredCostWindowKey {
  const { window, productUnits60, minProductSales } = params;

  if (window === "60") return "60";
  if (window === "90") return "90";
  if (window === "30") return "30";
  if (window === "180") return "90";

  // Legacy helper; the full source-and-window decision lives in settings.
  if (productUnits60 >= minProductSales) return "60";
  return "90";
}

/**
 * Filter key used when materializing byWindow["range"] aggregates.
 * Materialize the replay alias as 90; adaptive pick happens at settings apply time.
 */
export function materializeWindowKeyForFilter(
  window: CommissionWindowKey
): Exclude<CommissionWindowKey, "range"> {
  return window === "range" ? "90" : window;
}
