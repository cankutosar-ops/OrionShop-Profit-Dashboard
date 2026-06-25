import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import type {
  ProductAnalyticsSkuRow,
  ProductVariant,
  WbOrder,
  WbSale,
  WbStock,
} from "@/types/database";

export type VariantGroup = {
  variantKey: string;
  size: string;
  barcode: string | null;
};

function compareVariantSizes(a: VariantGroup, b: VariantGroup): number {
  const na = Number(a.size);
  const nb = Number(b.size);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.size.localeCompare(b.size, "ru");
}

/** Catalog sizes only — one row per tech_size from product_variants. Never emits "—". */
export function collectCatalogVariantGroups(variants: ProductVariant[]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();

  for (const variant of variants) {
    const size = variant.tech_size?.trim();
    if (!size) continue;

    const existing = map.get(size);
    if (!existing) {
      map.set(size, {
        variantKey: size,
        size,
        barcode: variant.barcode ?? null,
      });
      continue;
    }

    if (!existing.barcode && variant.barcode) {
      existing.barcode = variant.barcode;
    }
  }

  return Array.from(map.values()).sort(compareVariantSizes);
}

function filterOrdersSalesBySize<
  T extends { tech_size?: string | null },
>(rows: T[], size: string): T[] {
  return rows.filter((row) => row.tech_size?.trim() === size);
}

function getStockQuantityBySize(stockRows: WbStock[], techSize: string): number {
  return stockRows
    .filter((row) => (row.tech_size || "").trim() === techSize)
    .reduce((sum, row) => sum + row.quantity, 0);
}

/** SKU list for expanded rows — orders/purchases only when tech_size matches. */
export function buildSkuDisplayRows(
  groups: VariantGroup[],
  orders: WbOrder[],
  sales: WbSale[],
  stockRows: WbStock[]
): ProductAnalyticsSkuRow[] {
  return groups.map((group) => {
    const skuOrders = filterOrdersSalesBySize(orders, group.size);
    const skuSales = filterOrdersSalesBySize(sales, group.size);
    const funnel = buildProductFunnelMetrics(skuOrders, skuSales);

    return {
      variantKey: group.variantKey,
      size: group.size,
      barcode: group.barcode,
      currentStock: getStockQuantityBySize(stockRows, group.size),
      orders: funnel.orders,
      purchases: funnel.purchases,
    };
  });
}
