/**
 * Warehouse Sales Analytics — dual business stages:
 * - Orders / Orders Amount: wb_orders (customer demand), warehouse from order; NULL → "Unknown Warehouse"
 * - Units / Revenue: completed wb_sales (buyouts); same warehouse grouping
 * Order Share = warehouse orders ÷ total orders
 * Revenue Share = warehouse revenue ÷ total revenue
 */

export const UNKNOWN_WAREHOUSE_LABEL = "Unknown Warehouse";

export type WarehouseOrderInput = {
  warehouse?: string | null;
  quantity?: number | null;
  price_with_disc?: number | null;
  price?: number | null;
};

export type WarehouseSaleInput = {
  warehouse?: string | null;
  quantity: number;
  price_with_disc?: number | null;
  is_return: boolean;
  product_id?: string | null;
  nm_id?: number | null;
};

export type WarehouseSalesTotals = {
  orders: number;
  ordersAmount: number;
  units: number;
  revenue: number;
};

export type WarehouseSalesRow = {
  warehouse: string;
  orders: number;
  ordersAmount: number;
  units: number;
  revenue: number;
  orderSharePercent: number;
  revenueSharePercent: number;
};

export type WarehouseProductSalesRow = {
  productId: string;
  sku: string;
  productName: string;
  nmId: number | null;
  orders: number;
  units: number;
  revenue: number;
};

/** Completed sale = not a return. Permanent rule shared with sales-metrics. */
export function isCompletedWarehouseSale(sale: Pick<WarehouseSaleInput, "is_return">): boolean {
  return !sale.is_return;
}

/**
 * Normalize warehouse key for grouping (Inventory Intelligence / legacy).
 * Returns null when warehouse is SQL NULL / missing (caller may skip).
 * Returns "" for blank/whitespace names.
 */
export function normalizeWarehouseKey(warehouse: string | null | undefined): string | null {
  if (warehouse == null) return null;
  return warehouse.trim();
}

/**
 * Warehouse Sales group key: NULL / blank → "Unknown Warehouse" (never drop the row).
 */
export function resolveWarehouseGroupKey(warehouse: string | null | undefined): string {
  if (warehouse == null) return UNKNOWN_WAREHOUSE_LABEL;
  const trimmed = warehouse.trim();
  return trimmed === "" ? UNKNOWN_WAREHOUSE_LABEL : trimmed;
}

export function isEmptyWarehouseName(warehouse: string): boolean {
  return warehouse.trim() === "";
}

/**
 * Canonical order line commercial value (Orders Value / Orders Amount).
 * Prefer price_with_disc when present; else list price. Times quantity.
 */
export function orderLineAmount(
  order: Pick<WarehouseOrderInput, "price_with_disc" | "price" | "quantity">
): number {
  const disc = Number(order.price_with_disc ?? 0);
  const list = Number(order.price ?? 0);
  const unit = disc > 0 ? disc : Number.isFinite(list) ? list : 0;
  const qty = Number(order.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
  return (Number.isFinite(unit) ? Math.abs(unit) : 0) * quantity;
}

/** Commercial Sales per sale row: sum of price_with_disc × quantity. */
export function salePriceWithDiscAmount(sale: Pick<WarehouseSaleInput, "price_with_disc" | "quantity">): number {
  const price = Number(sale.price_with_disc);
  const qty = Number(sale.quantity);
  const unit = Number.isFinite(price) ? Math.abs(price) : 0;
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 0;
  return unit * quantity;
}

type Acc = { orders: number; ordersAmount: number; units: number; revenue: number };

function emptyAcc(): Acc {
  return { orders: 0, ordersAmount: 0, units: 0, revenue: 0 };
}

/**
 * Merge order counts/amounts (wb_orders) with units/revenue (completed wb_sales) by warehouse.
 * Default sort: Revenue DESC, then warehouse name.
 */
export function aggregateWarehouseSales(input: {
  orders: WarehouseOrderInput[];
  sales: WarehouseSaleInput[];
}): {
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
} {
  const byWarehouse = new Map<string, Acc>();

  const ensure = (key: string): Acc => {
    let acc = byWarehouse.get(key);
    if (!acc) {
      acc = emptyAcc();
      byWarehouse.set(key, acc);
    }
    return acc;
  };

  for (const order of input.orders) {
    const acc = ensure(resolveWarehouseGroupKey(order.warehouse));
    acc.orders += 1;
    acc.ordersAmount += orderLineAmount(order);
  }

  for (const sale of input.sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const acc = ensure(resolveWarehouseGroupKey(sale.warehouse));
    acc.units += Number(sale.quantity) || 0;
    acc.revenue += salePriceWithDiscAmount(sale);
  }

  const totals: WarehouseSalesTotals = emptyAcc();
  for (const acc of byWarehouse.values()) {
    totals.orders += acc.orders;
    totals.ordersAmount += acc.ordersAmount;
    totals.units += acc.units;
    totals.revenue += acc.revenue;
  }

  const rows: WarehouseSalesRow[] = [...byWarehouse.entries()].map(([warehouse, acc]) => ({
    warehouse,
    orders: acc.orders,
    ordersAmount: acc.ordersAmount,
    units: acc.units,
    revenue: acc.revenue,
    orderSharePercent: totals.orders > 0 ? (acc.orders / totals.orders) * 100 : 0,
    revenueSharePercent: totals.revenue > 0 ? (acc.revenue / totals.revenue) * 100 : 0,
  }));

  rows.sort((a, b) => b.revenue - a.revenue || a.warehouse.localeCompare(b.warehouse));

  return { rows, totals };
}

/**
 * Product breakdown for one warehouse (completed sales only).
 * SKU / name resolved via productLookup; falls back to nm_id / product_id.
 * `orders` here = completed sale row count within the warehouse (product drill-down).
 */
export function aggregateWarehouseProductSales(
  sales: WarehouseSaleInput[],
  warehouse: string,
  productLookup: Map<string, { sku: string; productName: string }>
): WarehouseProductSalesRow[] {
  const targetKey = resolveWarehouseGroupKey(warehouse);

  const byProduct = new Map<string, Acc & { nmId: number | null }>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const key = resolveWarehouseGroupKey(sale.warehouse);
    if (key !== targetKey) continue;

    const productId = sale.product_id ? String(sale.product_id) : "";
    if (!productId) continue;

    let acc = byProduct.get(productId);
    if (!acc) {
      acc = { ...emptyAcc(), nmId: sale.nm_id ?? null };
      byProduct.set(productId, acc);
    }
    acc.orders += 1;
    acc.units += Number(sale.quantity) || 0;
    acc.revenue += salePriceWithDiscAmount(sale);
    if (acc.nmId == null && sale.nm_id != null) acc.nmId = sale.nm_id;
  }

  const rows: WarehouseProductSalesRow[] = [...byProduct.entries()].map(([productId, acc]) => {
    const meta = productLookup.get(productId);
    return {
      productId,
      sku: meta?.sku || (acc.nmId != null ? String(acc.nmId) : productId),
      productName: meta?.productName || "Unknown product",
      nmId: acc.nmId,
      orders: acc.orders,
      units: acc.units,
      revenue: acc.revenue,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue || a.sku.localeCompare(b.sku));
  return rows;
}

/** Sum of rounded one-decimal shares (for validation; may be 99.9–100.1). */
export function sumRoundedShares(percents: number[], decimals = 1): number {
  const factor = 10 ** decimals;
  let sum = 0;
  for (const value of percents) {
    sum += Math.round(value * factor);
  }
  return sum / factor;
}
