import { mapApiProductVariants } from "@/lib/wildberries/mappers";
import type { WbApiProductCard } from "@/lib/wildberries/types";
import type { ProductVariant, WbOrder, WbSale } from "@/types/database";

export function buildBarcodeToTechSizeMap(variants: ProductVariant[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const variant of variants) {
    if (!variant.barcode) continue;
    const size = variant.tech_size?.trim();
    if (size) map.set(variant.barcode, size);
  }
  return map;
}

export function enrichRowsWithTechSize<
  T extends { tech_size?: string | null; barcode?: string | null },
>(rows: T[], barcodeToSize: Map<string, string>): T[] {
  if (!barcodeToSize.size) return rows;

  return rows.map((row) => {
    if (row.tech_size?.trim()) return row;
    const barcode = row.barcode?.trim();
    if (!barcode) return row;
    const size = barcodeToSize.get(barcode);
    if (!size) return row;
    return { ...row, tech_size: size };
  });
}

export function hasRowSizeData(
  rows: Array<{ tech_size?: string | null; barcode?: string | null }>
): boolean {
  return rows.some((row) => Boolean(row.tech_size?.trim() || row.barcode?.trim()));
}

export function toProductVariantsFromApi(
  card: WbApiProductCard,
  productId: string
): ProductVariant[] {
  const now = new Date().toISOString();
  return mapApiProductVariants(card, productId).map((variant, index) => ({
    id: `api-${productId}-${index}`,
    marketplace_account_id: "",
    product_id: productId,
    nm_id: variant.nm_id,
    tech_size: variant.tech_size,
    barcode: variant.barcode,
    created_at: now,
  }));
}

export function dedupeVariantsBySize(variants: ProductVariant[]): ProductVariant[] {
  const bySize = new Map<string, ProductVariant>();
  for (const variant of variants) {
    const size = variant.tech_size?.trim() || "—";
    const existing = bySize.get(size);
    if (!existing) {
      bySize.set(size, { ...variant, tech_size: size === "—" ? "" : variant.tech_size });
      continue;
    }
    if (!existing.barcode && variant.barcode) {
      existing.barcode = variant.barcode;
    }
  }
  return Array.from(bySize.values());
}

export type SizedOrder = WbOrder;
export type SizedSale = WbSale;
