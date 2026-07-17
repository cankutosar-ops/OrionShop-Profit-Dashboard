import { sanitizeUserFacingError } from "@/lib/user-facing-errors";
import { cachedExternalRequest } from "@/lib/wb/wb-request-cache";
import { WbApiClient } from "@/lib/wildberries/api-client";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type { WbBalanceMetrics } from "@/types/database";

/**
 * Current WB wallet balance — point-in-time, not filtered by dashboard date range.
 * Matches Seller Portal main-page balance widget (for_withdraw).
 */
export async function getWbBalanceMetrics(
  marketplaceAccountId: string
): Promise<WbBalanceMetrics> {
  return cachedExternalRequest(`wb-balance:${marketplaceAccountId}`, async () => {
    try {
      const account = await getMarketplaceAccountForSync(marketplaceAccountId);
      if (account.marketplace !== "wildberries") {
        return {
          current: null,
          forWithdraw: null,
          currency: null,
          unavailableReason: "WB balance is available for Wildberries accounts only",
        };
      }

      const client = new WbApiClient(account.apiKey);
      const balance = await client.fetchAccountBalance();

      return {
        current: balance.current,
        forWithdraw: balance.for_withdraw,
        currency: balance.currency,
      };
    } catch (error) {
      return {
        current: null,
        forWithdraw: null,
        currency: null,
        unavailableReason: sanitizeUserFacingError(error),
      };
    }
  });
}
