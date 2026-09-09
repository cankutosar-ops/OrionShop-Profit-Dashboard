/**
 * Sprint 8.1 — Smart Pricing V2 dual-window mathematics (locked).
 *
 * Cost basis (fee / logistics / storage): preferred 60–90 days, Product→Category→Account.
 * ASP / market comparison: recent 14–30 days only (fixed at ASP_WINDOW_DAYS).
 * Dashboard reporting date range must never drive recommended price inputs.
 */

import type { CommissionWindowKey } from "@/lib/smart-pricing-types";
import { buildInclusiveDateRange } from "@/lib/utils";
import type { ScopedDateRange } from "@/types/database";

/** Preferred cost-history band (locked). */
export const SMART_PRICING_COST_WINDOW_MIN_DAYS = 60;
export const SMART_PRICING_COST_WINDOW_MAX_DAYS = 90;

/** Default cost window inside the preferred band. */
export const SMART_PRICING_COST_WINDOW_DEFAULT = "90" as const;

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

export type PreferredCostWindowKey = "60" | "90";

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
 * Map UI / legacy window keys into the locked 60–90 cost band.
 * - Explicit 60 / 90: honored
 * - 30 → 60, 180 → 90 (clamp into preferred band)
 * - range → adaptive: 60 when product sample is sufficient, else 90
 */
export function resolvePreferredCostWindow(params: {
  window: CommissionWindowKey;
  productUnits60: number;
  minProductSales: number;
}): PreferredCostWindowKey {
  const { window, productUnits60, minProductSales } = params;

  if (window === "60") return "60";
  if (window === "90") return "90";
  if (window === "30") return "60";
  if (window === "180") return "90";

  // "range" — adaptive inside 60–90 (never the dashboard reporting range)
  if (productUnits60 >= minProductSales) return "60";
  return "90";
}

/**
 * Filter key used when materializing byWindow["range"] aggregates.
 * Always materialize as 90; adaptive pick happens at settings apply time.
 */
export function materializeWindowKeyForFilter(
  window: CommissionWindowKey
): Exclude<CommissionWindowKey, "range"> {
  return window === "range" ? SMART_PRICING_COST_WINDOW_DEFAULT : window;
}
