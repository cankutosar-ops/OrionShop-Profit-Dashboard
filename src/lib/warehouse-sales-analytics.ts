/**
 * Warehouse Sales Analytics — pure aggregation over completed wb_sales rows.
 * Single source of truth: wb_sales.warehouse (NULL warehouses ignored).
 * Order Share uses Orders (row count), never Units.
 */

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
  units: number;
  revenue: number;
};

export type WarehouseSalesRow = {
  warehouse: string;
  orders: number;
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
 * Normalize warehouse key for grouping.
 * Returns null when warehouse is SQL NULL / missing (ignored entirely).
 * Returns "" for blank/whitespace names (optional UI "hide empty" filter).
 */
export function normalizeWarehouseKey(warehouse: string | null | undefined): string | null {
  if (warehouse == null) return null;
  return warehouse.trim();
}

export function isEmptyWarehouseName(warehouse: string): boolean {
  return warehouse.trim() === "";
}

/** Commercial revenue per sale row: sum of price_with_disc × quantity. */
export function salePriceWithDiscAmount(sale: Pick<WarehouseSaleInput, "price_with_disc" | "quantity">): number {
  const price = Number(sale.price_with_disc);
  const qty = Number(sale.quantity);
  const unit = Number.isFinite(price) ? Math.abs(price) : 0;
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 0;
  return unit * quantity;
}

type Acc = { orders: number; units: number; revenue: number };

function emptyAcc(): Acc {
  return { orders: 0, units: 0, revenue: 0 };
}

function addSale(acc: Acc, sale: WarehouseSaleInput): void {
  acc.orders += 1;
  acc.units += Number(sale.quantity) || 0;
  acc.revenue += salePriceWithDiscAmount(sale);
}

/**
 * Group completed sales by warehouse. Ignores NULL warehouses.
 * Default sort: Revenue DESC.
 */
export function aggregateWarehouseSales(sales: WarehouseSaleInput[]): {
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
} {
  const byWarehouse = new Map<string, Acc>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const key = normalizeWarehouseKey(sale.warehouse);
    if (key == null) continue;

    let acc = byWarehouse.get(key);
    if (!acc) {
      acc = emptyAcc();
      byWarehouse.set(key, acc);
    }
    addSale(acc, sale);
  }

  const totals: WarehouseSalesTotals = emptyAcc();
  for (const acc of byWarehouse.values()) {
    totals.orders += acc.orders;
    totals.units += acc.units;
    totals.revenue += acc.revenue;
  }

  const rows: WarehouseSalesRow[] = [...byWarehouse.entries()].map(([warehouse, acc]) => ({
    warehouse,
    orders: acc.orders,
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
 */
export function aggregateWarehouseProductSales(
  sales: WarehouseSaleInput[],
  warehouse: string,
  productLookup: Map<string, { sku: string; productName: string }>
): WarehouseProductSalesRow[] {
  const target = normalizeWarehouseKey(warehouse);
  if (target == null) return [];

  const byProduct = new Map<string, Acc & { nmId: number | null }>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const key = normalizeWarehouseKey(sale.warehouse);
    if (key !== target) continue;

    const productId = sale.product_id ? String(sale.product_id) : "";
    if (!productId) continue;

    let acc = byProduct.get(productId);
    if (!acc) {
      acc = { ...emptyAcc(), nmId: sale.nm_id ?? null };
      byProduct.set(productId, acc);
    }
    addSale(acc, sale);
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
