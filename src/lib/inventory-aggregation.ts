import {
  calculateAverageDailySales,
  calculateDaysOfStock,
} from "@/lib/inventory-intelligence";
import type {
  InventoryDisplayStatus,
  InventoryHistoryEntry,
  InventoryModelDetail,
  InventoryModelRow,
  InventorySkuRow,
  InventoryStockRow,
  InventoryStockTotals,
  InventoryWarehouseRow,
} from "@/lib/inventory-types";
import type { Product, WbSale } from "@/types/database";

export const LOW_STOCK_DAYS_THRESHOLD = 14;

export function classifyDisplayStatus(
  currentStock: number,
  daysLeft: number | null
): InventoryDisplayStatus {
  if (currentStock <= 0) return "Out of Stock";
  if (daysLeft !== null && daysLeft < LOW_STOCK_DAYS_THRESHOLD) return "Low Stock";
  return "Healthy";
}

export function buildStockTotals(
  currentStock: number,
  availableStock: number,
  reservedStock: number,
  purchases30Day: number,
  lastSync: string | null
): InventoryStockTotals {
  const dailySales = calculateAverageDailySales(purchases30Day);
  const daysLeft = calculateDaysOfStock(currentStock, dailySales);

  return {
    currentStock,
    availableStock,
    reservedStock,
    purchases30Day,
    dailySales,
    daysLeft,
    lastSync,
  };
}

export function sumInventoryRows(rows: InventoryStockRow[]): {
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  lastSync: string | null;
} {
  let currentStock = 0;
  let availableStock = 0;
  let reservedStock = 0;
  let lastSync: string | null = null;

  for (const row of rows) {
    currentStock += row.currentStock;
    availableStock += row.availableStock;
    reservedStock += row.reservedStock;
    if (row.syncedAt && (!lastSync || row.syncedAt > lastSync)) {
      lastSync = row.syncedAt;
    }
  }

  return { currentStock, availableStock, reservedStock, lastSync };
}

export function aggregateStockByProduct(
  rows: InventoryStockRow[]
): Map<string, ReturnType<typeof sumInventoryRows>> {
  const map = new Map<string, InventoryStockRow[]>();

  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push(row);
    map.set(row.productId, list);
  }

  return new Map(
    [...map.entries()].map(([productId, productRows]) => [
      productId,
      sumInventoryRows(productRows),
    ])
  );
}

export function aggregateStockBySize(rows: InventoryStockRow[]): Map<string, InventoryStockRow[]> {
  const map = new Map<string, InventoryStockRow[]>();

  for (const row of rows) {
    const size = row.techSize.trim() || "—";
    const list = map.get(size) ?? [];
    list.push(row);
    map.set(size, list);
  }

  return map;
}

export function aggregateStockByWarehouse(
  rows: InventoryStockRow[]
): Map<string, InventoryStockRow[]> {
  const map = new Map<string, InventoryStockRow[]>();

  for (const row of rows) {
    const warehouse = row.warehouse?.trim() || "—";
    const list = map.get(warehouse) ?? [];
    list.push(row);
    map.set(warehouse, list);
  }

  return map;
}

export function countPurchasesByProduct(sales: WbSale[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const sale of sales) {
    if (sale.is_return || !sale.product_id) continue;
    const productId = String(sale.product_id);
    map.set(productId, (map.get(productId) ?? 0) + sale.quantity);
  }

  return map;
}

export function countPurchasesByProductAndSize(sales: WbSale[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();

  for (const sale of sales) {
    if (sale.is_return || !sale.product_id) continue;
    const productId = String(sale.product_id);
    const size = sale.tech_size?.trim() || "—";
    const bySize = map.get(productId) ?? new Map<string, number>();
    bySize.set(size, (bySize.get(size) ?? 0) + sale.quantity);
    map.set(productId, bySize);
  }

  return map;
}

function compareSizes(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "ru");
}

export function buildSkuRows(
  productRows: InventoryStockRow[],
  purchasesBySize: Map<string, number>
): InventorySkuRow[] {
  const bySize = aggregateStockBySize(productRows);

  return [...bySize.entries()]
    .map(([size, rows]) => {
      const stock = sumInventoryRows(rows);
      const barcode = rows.find((row) => row.barcode)?.barcode ?? null;
      const purchases30Day = purchasesBySize.get(size) ?? 0;
      const totals = buildStockTotals(
        stock.currentStock,
        stock.availableStock,
        stock.reservedStock,
        purchases30Day,
        stock.lastSync
      );

      return {
        size,
        barcode,
        ...totals,
        status: classifyDisplayStatus(totals.currentStock, totals.daysLeft),
      };
    })
    .sort((a, b) => compareSizes(a.size, b.size));
}

export function buildWarehouseRows(productRows: InventoryStockRow[]): InventoryWarehouseRow[] {
  const byWarehouse = aggregateStockByWarehouse(productRows);

  return [...byWarehouse.entries()]
    .map(([warehouse, rows]) => {
      const stock = sumInventoryRows(rows);
      return {
        warehouse,
        currentStock: stock.currentStock,
        availableStock: stock.availableStock,
        reservedStock: stock.reservedStock,
      };
    })
    .sort((a, b) => b.currentStock - a.currentStock);
}

export function buildHistoryEntries(
  productRows: InventoryStockRow[],
  productSales: WbSale[],
  accountLastSync: string | null
): InventoryHistoryEntry[] {
  const entries: InventoryHistoryEntry[] = [];

  if (accountLastSync) {
    entries.push({
      id: "account-sync",
      type: "sync",
      label: "Account stock sync",
      detail: "Wildberries stock cache refreshed for marketplace account",
      occurredAt: accountLastSync,
    });
  }

  const syncTimes = new Set<string>();
  for (const row of productRows) {
    if (row.syncedAt) syncTimes.add(row.syncedAt);
  }

  for (const syncedAt of [...syncTimes].sort((a, b) => b.localeCompare(a)).slice(0, 5)) {
    const batchRows = productRows.filter((row) => row.syncedAt === syncedAt);
    const totalQty = batchRows.reduce((sum, row) => sum + row.currentStock, 0);
    entries.push({
      id: `sync-${syncedAt}`,
      type: "stock_update",
      label: "Stock cache update",
      detail: `${batchRows.length} warehouse lines updated`,
      occurredAt: syncedAt,
      quantity: totalQty,
    });
  }

  for (const sale of productSales
    .filter((row) => !row.is_return)
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
    .slice(0, 10)) {
    entries.push({
      id: `sale-${sale.id}`,
      type: "sale",
      label: "Purchase (outbound)",
      detail: `Size ${sale.tech_size?.trim() || "—"} · qty ${sale.quantity}`,
      occurredAt: sale.sale_date,
      quantity: sale.quantity,
    });
  }

  return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function buildModelRow(
  product: Product,
  stock: ReturnType<typeof sumInventoryRows>,
  purchases30Day: number
): InventoryModelRow {
  const totals = buildStockTotals(
    stock.currentStock,
    stock.availableStock,
    stock.reservedStock,
    purchases30Day,
    stock.lastSync
  );

  return {
    productId: String(product.id),
    supplierArticle: product.supplier_article,
    productName: product.name,
    currentStock: totals.currentStock,
    daysLeft: totals.daysLeft,
    status: classifyDisplayStatus(totals.currentStock, totals.daysLeft),
  };
}

export function buildModelDetail(
  product: Product,
  productRows: InventoryStockRow[],
  purchases30Day: number,
  purchasesBySize: Map<string, number>,
  productSales: WbSale[],
  accountLastSync: string | null
): InventoryModelDetail {
  const stock = sumInventoryRows(productRows);
  const overviewTotals = buildStockTotals(
    stock.currentStock,
    stock.availableStock,
    stock.reservedStock,
    purchases30Day,
    stock.lastSync
  );

  return {
    productId: String(product.id),
    supplierArticle: product.supplier_article,
    productName: product.name,
    overview: {
      ...overviewTotals,
      status: classifyDisplayStatus(overviewTotals.currentStock, overviewTotals.daysLeft),
    },
    skus: buildSkuRows(productRows, purchasesBySize),
    warehouses: buildWarehouseRows(productRows),
    history: buildHistoryEntries(productRows, productSales, accountLastSync),
  };
}

export function sortModelsByUrgency(models: InventoryModelRow[]): InventoryModelRow[] {
  const statusOrder: Record<InventoryDisplayStatus, number> = {
    "Out of Stock": 0,
    "Low Stock": 1,
    Healthy: 2,
  };

  return [...models].sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const daysA = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const daysB = b.daysLeft ?? Number.POSITIVE_INFINITY;
    if (daysA !== daysB) return daysA - daysB;

    return b.currentStock - a.currentStock;
  });
}
