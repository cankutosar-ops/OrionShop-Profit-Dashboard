import { buildStockKey } from "@/services/stock-service";
import type { InventoryStockRow } from "@/lib/inventory-types";
import type { WbApiStockRow } from "@/lib/wildberries/types";
import type { Product, ProductVariant, WbStock } from "@/types/database";

export function buildInventoryRowKey(input: {
  nmId?: number | null;
  productId?: string;
  techSize: string;
  barcode: string | null;
  warehouse: string | null;
}): string {
  const idPart = input.nmId != null ? `nm:${input.nmId}` : `pid:${input.productId ?? ""}`;
  return `${idPart}|${buildStockKey(input.techSize, input.barcode)}|${input.warehouse ?? ""}`;
}

/**
 * Map Wildberries Statistics API stock row to inventory DTO.
 * Field semantics per WB docs: quantity = for sale, quantityFull = total at warehouse.
 */
export function mapApiStockRowToInventory(
  row: WbApiStockRow,
  context: {
    productId: string;
    marketplaceAccountId: string;
    syncedAt?: string | null;
  }
): InventoryStockRow {
  const availableStock = Number(row.quantity ?? 0);
  const currentStock = Number(row.quantityFull ?? row.quantity ?? 0);
  const inWay =
    Number(row.inWayToClient ?? 0) + Number(row.inWayFromClient ?? 0);
  const reservedStock =
    inWay > 0 ? inWay : Math.max(0, currentStock - availableStock);

  return {
    productId: context.productId,
    marketplaceAccountId: context.marketplaceAccountId,
    techSize: (row.techSize ?? "").trim(),
    barcode: row.barcode?.trim() || null,
    warehouse: row.warehouseName?.trim() || null,
    availableStock,
    currentStock,
    reservedStock,
    syncedAt: context.syncedAt ?? null,
    nmId: row.nmId ?? null,
    supplierArticle: row.supplierArticle?.trim() || null,
  };
}

/** Map cached wb_stock row — all stock fields read from DB (no live API). */
export function mapDbStockRowToInventory(
  row: WbStock,
  context: {
    nmId?: number | null;
    supplierArticle?: string | null;
  } = {}
): InventoryStockRow {
  const availableStock = Number(row.quantity ?? 0);
  const currentStock = Number(row.quantity_full ?? row.quantity ?? 0);
  const inWay = Number(row.in_way_to_client ?? 0) + Number(row.in_way_from_client ?? 0);
  const reservedStock = inWay > 0 ? inWay : Math.max(0, currentStock - availableStock);

  return {
    productId: String(row.product_id),
    marketplaceAccountId: String(row.marketplace_account_id),
    techSize: (row.tech_size ?? "").trim(),
    barcode: row.barcode?.trim() || null,
    warehouse: row.warehouse?.trim() || null,
    availableStock,
    currentStock,
    reservedStock,
    syncedAt: row.last_synced_at ?? null,
    nmId: context.nmId ?? null,
    supplierArticle: context.supplierArticle ?? null,
  };
}

export function mapWbStockRowKey(row: {
  product_id: string;
  tech_size: string;
  barcode: string | null;
  warehouse: string | null;
}): string {
  return buildInventoryRowKey({
    productId: String(row.product_id),
    techSize: row.tech_size ?? "",
    barcode: row.barcode,
    warehouse: row.warehouse,
  });
}

export function mapApiStockRowKey(
  row: WbApiStockRow,
  productId: string
): string {
  return buildInventoryRowKey({
    productId,
    techSize: row.techSize ?? "",
    barcode: row.barcode?.trim() || null,
    warehouse: row.warehouseName?.trim() || null,
  });
}

export function aggregateInventoryBySkuKey(rows: InventoryStockRow[]): InventoryStockRow[] {
  const byKey = new Map<string, InventoryStockRow>();

  for (const row of rows) {
    const key = buildInventoryRowKey({
      productId: row.productId,
      techSize: row.techSize,
      barcode: row.barcode,
      warehouse: row.warehouse,
    });
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    existing.availableStock += row.availableStock;
    existing.currentStock += row.currentStock;
    existing.reservedStock += row.reservedStock;
  }

  return Array.from(byKey.values());
}

export function indexProductsById(products: Product[]): Map<string, Product> {
  return new Map(products.map((product) => [String(product.id), product]));
}

export function indexVariantsByProduct(variants: ProductVariant[]): Map<string, ProductVariant[]> {
  const map = new Map<string, ProductVariant[]>();
  for (const variant of variants) {
    const productId = String(variant.product_id);
    const list = map.get(productId) ?? [];
    list.push(variant);
    map.set(productId, list);
  }
  return map;
}

export function buildVariantKeys(variants: ProductVariant[]): Set<string> {
  const keys = new Set<string>();
  for (const variant of variants) {
    const size = variant.tech_size?.trim();
    if (!size) continue;
    keys.add(buildStockKey(size, variant.barcode));
  }
  return keys;
}
