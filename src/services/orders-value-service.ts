/**
 * Sprint 10.6 — Orders Value from warehouse DB only (wb_orders.price_with_disc).
 * No Marketplace HTTP.
 */

import { resolveOrdersValueFromSources } from "@/lib/orders-value-resolution";
import type { ScopedDateRange, WbOrder } from "@/types/database";

/**
 * @deprecated Live API removed — always resolves from DB orders.
 */
export async function fetchWbOrdersApi(
  _scope: ScopedDateRange
): Promise<undefined> {
  return undefined;
}

export async function resolveOrdersValue(
  scope: ScopedDateRange,
  orders: WbOrder[],
  options?: {
    /** Ignored — API path removed in Sprint 10.6. */
    preloadedApiOrders?: undefined;
    skipApiFetch?: boolean;
  }
) {
  void options;
  return resolveOrdersValueFromSources({
    orders,
    apiOrders: undefined,
    scopeFrom: scope.from,
    scopeTo: scope.to,
  });
}
