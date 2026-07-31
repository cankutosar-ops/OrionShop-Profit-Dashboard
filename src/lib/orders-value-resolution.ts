import { isWithinDateRange, toDateString } from "@/lib/wildberries/mappers";
import type { WbApiOrder } from "@/lib/wildberries/types";
import type { WbOrder } from "@/types/database";

export type OrdersValueDataSource = "db" | "orders_api";

export type OrdersValueResolution = {
  ordersValue: number;
  dataSource: OrdersValueDataSource;
};

function sumPriceWithDiscFromDb(orders: WbOrder[]): number {
  return orders.reduce((sum, order) => {
    const unit = Number(order.price_with_disc ?? 0) > 0 ? order.price_with_disc : order.price;
    return sum + unit * order.quantity;
  }, 0);
}

/**
 * Wildberries Portal Orders Value: sum priceWithDisc on orders whose lastChangeDate
 * falls in the reporting window (includes cancelled and status updates).
 */
export function buildOrdersValueFromApiOrders(
  apiOrders: WbApiOrder[],
  scopeFrom: string,
  scopeTo: string
): number {
  let sum = 0;
  for (const order of apiOrders) {
    if (!isWithinDateRange(toDateString(order.lastChangeDate), scopeFrom, scopeTo)) continue;
    sum += order.priceWithDisc ?? 0;
  }
  return sum;
}

export function buildOrdersValueFromDbByLastChange(
  orders: WbOrder[],
  scopeFrom: string,
  scopeTo: string
): number {
  const inRange = orders.filter((order) =>
    order.last_change_date
      ? isWithinDateRange(order.last_change_date, scopeFrom, scopeTo)
      : isWithinDateRange(order.order_date, scopeFrom, scopeTo)
  );
  return sumPriceWithDiscFromDb(inRange);
}

export function ordersValueNeedsApiFallback(orders: WbOrder[]): boolean {
  if (orders.length === 0) return false;
  const hasStoredDisc = orders.some((order) => Number(order.price_with_disc) > 0);
  const hasLastChange = orders.some((order) => Boolean(order.last_change_date));
  return !hasStoredDisc || !hasLastChange;
}

export function resolveOrdersValueFromSources(params: {
  orders: WbOrder[];
  apiOrders?: WbApiOrder[];
  scopeFrom: string;
  scopeTo: string;
}): OrdersValueResolution {
  // Sprint 10.6 — Warehouse DB is the only Orders Value source.
  // Ignore apiOrders even if passed (legacy callers).
  void params.apiOrders;

  if (params.orders.length === 0) {
    return { ordersValue: 0, dataSource: "db" };
  }

  return {
    ordersValue: buildOrdersValueFromDbByLastChange(
      params.orders,
      params.scopeFrom,
      params.scopeTo
    ),
    dataSource: "db",
  };
}
