import type { WbOrder, WbSale } from "@/types/database";

export type ProductFunnelMetrics = {
  orders: number;
  purchases: number;
  conversionPercent: number;
  cancelled: number;
  cancellationPercent: number;
};

function isCancelledOrder(order: WbOrder): boolean {
  return order.status === "cancelled";
}

export function buildProductFunnelMetrics(
  orders: WbOrder[],
  sales: WbSale[]
): ProductFunnelMetrics {
  const purchases = sales.filter((sale) => !sale.is_return);

  const orderCount = orders.reduce((sum, order) => sum + order.quantity, 0);
  const cancelledCount = orders
    .filter(isCancelledOrder)
    .reduce((sum, order) => sum + order.quantity, 0);
  const purchaseCount = purchases.reduce((sum, sale) => sum + sale.quantity, 0);
  const conversionPercent = orderCount > 0 ? (purchaseCount / orderCount) * 100 : 0;
  const cancellationPercent = orderCount > 0 ? (cancelledCount / orderCount) * 100 : 0;

  return {
    orders: orderCount,
    purchases: purchaseCount,
    conversionPercent,
    cancelled: cancelledCount,
    cancellationPercent,
  };
}

/** V3 table row inclusion: any funnel or revenue activity in period. */
export function isProductAnalyticsV3Candidate(product: {
  orders: number;
  purchases: number;
  revenue: number;
}): boolean {
  return product.orders > 0 || product.purchases > 0 || product.revenue > 0;
}
