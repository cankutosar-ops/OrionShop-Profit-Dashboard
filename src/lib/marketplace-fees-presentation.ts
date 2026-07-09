import type { MarketplaceFeesPresentation } from "@/lib/finance-rollup";
import { buildMarketplaceFeesPresentationFromFinance } from "@/lib/finance-rollup";
import { parseWbSourceSuffix } from "@/lib/finance-category";

export type { MarketplaceFeesPresentation };

/** @deprecated Use parseWbSourceSuffix from finance-category. */
export { parseWbSourceSuffix };

/**
 * Dashboard Marketplace Fees presentation — delegates to shared finance rollup.
 * Does not alter net profit.
 */
export function buildMarketplaceFeesPresentation(
  finance: Parameters<typeof buildMarketplaceFeesPresentationFromFinance>[0],
  commission: number
): MarketplaceFeesPresentation {
  return buildMarketplaceFeesPresentationFromFinance(finance, commission);
}
