import type { WbAd } from "@/types/database";

export const WB_ADVERTISING_POLICY = "FINANCE_HOLDS_ONLY" as const;
export const WB_ADVERTISING_INFORMATIONAL_HINT =
  "WB campaign statistics. Informational only; billed advertising is deducted once through Finance Adjustments.";

/**
 * The approved WB-balance reporting basis uses billed Finance deductions.
 * Campaign use and invoice posting dates/amounts are different measures.
 * WB report deductions own realized advertising costs. Campaign statistics are
 * a different measurement/date basis, not an additional accounting expense.
 * Never add them to Finance holds, including for partial or empty Finance periods.
 * The policy applies to every WB account; no account-specific inference.
 */
export function resolveWbAdvertisingCost(ads: readonly Pick<WbAd, "spend">[]) {
  let campaignSpend = 0;
  for (const ad of ads) {
    const spend = Number(ad.spend);
    if (ad.spend == null || !Number.isFinite(spend)) {
      throw new Error("Invalid WB campaign spend");
    }
    campaignSpend += spend;
  }
  return { policy: WB_ADVERTISING_POLICY, campaignSpend, additionalProfitDeduction: 0 } as const;
}
