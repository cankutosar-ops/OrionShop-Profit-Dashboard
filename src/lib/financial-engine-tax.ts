import { DEFAULT_TAX_PERCENT } from "@/lib/smart-pricing-constants";

/**
 * Tax% × base — shared arithmetic helper.
 *
 * Callers choose the base (intentional dual model):
 *
 * - Historical reporting: base = Σ Sales API finishedPrice
 * - Smart Pricing:        base = Sale − Marketplace Fee
 *
 * Do not “normalize” those bases into one. See docs/estimated-tax-models.md.
 */
export function calculateEstimatedTax(
  taxBase: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): number {
  if (!Number.isFinite(taxBase) || taxBase <= 0) {
    return 0;
  }
  if (!Number.isFinite(taxPercent) || taxPercent <= 0) return 0;
  return taxBase * (taxPercent / 100);
}