import { resolveOrdersValueFromSources } from "@/lib/orders-value-resolution";
import { cachedExternalRequest } from "@/lib/wb/wb-request-cache";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WbApiOrder } from "@/lib/wildberries/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type { ScopedDateRange, WbOrder } from "@/types/database";

/** Live WB Orders API fetch — cached per account+from for navigation bursts. */
export async function fetchWbOrdersApi(
  scope: ScopedDateRange
): Promise<WbApiOrder[] | undefined> {
  const cacheKey = `wb-orders-api:${scope.marketplaceAccountId}:${scope.from}`;
  return cachedExternalRequest(cacheKey, async () => {
    try {
      const account = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
      if (account.marketplace !== "wildberries") return undefined;
      const client = new WbApiClient(account.apiKey);
      return await client.fetchOrders(`${scope.from}T00:00:00`);
    } catch {
      return undefined;
    }
  });
}

export async function resolveOrdersValue(
  scope: ScopedDateRange,
  orders: WbOrder[],
  options?: {
    /** When present, use these orders and do not hit the WB API. */
    preloadedApiOrders?: WbApiOrder[] | undefined;
    skipApiFetch?: boolean;
  }
) {
  const apiOrders =
    options?.skipApiFetch || (options && "preloadedApiOrders" in options)
      ? options.preloadedApiOrders
      : await fetchWbOrdersApi(scope);

  return resolveOrdersValueFromSources({
    orders,
    apiOrders,
    scopeFrom: scope.from,
    scopeTo: scope.to,
  });
}
