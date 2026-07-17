import type { DailyOrdersPurchasesPoint, OrdersPurchasesKpis, WbOrder, WbSale } from "@/types/database";

export type { DailyOrdersPurchasesPoint, OrdersPurchasesKpis };

function toDateKey(value: string): string {
  return value.slice(0, 10);
}

/** Active orders only — status must be exactly 'active'. */
function isActiveOrder(order: WbOrder): boolean {
  return order.status === "active";
}

function isCancelledOrder(order: WbOrder): boolean {
  return order.status === "cancelled";
}

function orderLineAmount(order: WbOrder): number {
  const unit =
    Number(order.price_with_disc ?? 0) > 0 ? Number(order.price_with_disc) : order.price;
  return unit * order.quantity;
}

export function buildOrdersPurchasesKpis(
  orders: WbOrder[],
  sales: WbSale[]
): OrdersPurchasesKpis {
  const activeOrders = orders.filter(isActiveOrder);
  const cancelledOrders = orders.filter(isCancelledOrder);

  const ordersValue = orders.reduce((sum, order) => sum + orderLineAmount(order), 0);
  const ordersValueCount = orders.reduce((sum, order) => sum + order.quantity, 0);

  const ordersCount = activeOrders.reduce((sum, order) => sum + order.quantity, 0);
  const ordersAmount = activeOrders.reduce((sum, order) => sum + orderLineAmount(order), 0);
  const cancelledOrdersCount = cancelledOrders.reduce((sum, order) => sum + order.quantity, 0);
  const cancelledOrdersAmount = cancelledOrders.reduce(
    (sum, order) => sum + orderLineAmount(order),
    0
  );

  const purchases = sales.filter((sale) => !sale.is_return);
  const returns = sales.filter((sale) => sale.is_return);

  const purchasesCount = purchases.reduce((sum, sale) => sum + sale.quantity, 0);
  const purchasesAmount = purchases.reduce((sum, sale) => sum + sale.revenue, 0);

  const unitsReturned = returns.reduce((sum, sale) => sum + sale.quantity, 0);
  const totalUnits = purchasesCount + unitsReturned;

  const conversionRate = ordersCount > 0 ? (purchasesCount / ordersCount) * 100 : 0;
  const returnRate = totalUnits > 0 ? (unitsReturned / totalUnits) * 100 : 0;

  const dailyMap = new Map<string, DailyOrdersPurchasesPoint>();

  for (const order of activeOrders) {
    const date = toDateKey(order.order_date);
    const point = dailyMap.get(date) ?? {
      date,
      ordersCount: 0,
      ordersAmount: 0,
      purchasesCount: 0,
      purchasesAmount: 0,
    };
    point.ordersCount += order.quantity;
    point.ordersAmount += orderLineAmount(order);
    dailyMap.set(date, point);
  }

  for (const sale of purchases) {
    const date = toDateKey(sale.sale_date);
    const point = dailyMap.get(date) ?? {
      date,
      ordersCount: 0,
      ordersAmount: 0,
      purchasesCount: 0,
      purchasesAmount: 0,
    };
    point.purchasesCount += sale.quantity;
    point.purchasesAmount += sale.revenue;
    dailyMap.set(date, point);
  }

  const dailyOrdersPurchases = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    ordersValue,
    ordersValueCount,
    ordersCount,
    ordersAmount,
    cancelledOrdersCount,
    cancelledOrdersAmount,
    purchasesCount,
    purchasesAmount,
    conversionRate,
    returnRate,
    dailyOrdersPurchases,
  };
}
