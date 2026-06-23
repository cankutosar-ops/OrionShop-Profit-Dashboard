/**
 * Mappers for transforming Wildberries API responses into database records.
 * Implement each mapper when the corresponding API endpoint is connected.
 */

import type { WbAd, WbFinance, WbOrder, WbSale } from "@/types/database";

export type WbApiOrder = Record<string, unknown>;
export type WbApiSale = Record<string, unknown>;
export type WbApiFinanceRecord = Record<string, unknown>;
export type WbApiAdCampaign = Record<string, unknown>;
export type WbApiProductCard = Record<string, unknown>;

export function mapApiOrderToDb(_apiOrder: WbApiOrder, _productId: string): Omit<WbOrder, "id"> {
  throw new Error("mapApiOrderToDb not implemented");
}

export function mapApiSaleToDb(_apiSale: WbApiSale, _productId: string): Omit<WbSale, "id"> {
  throw new Error("mapApiSaleToDb not implemented");
}

export function mapApiFinanceToDb(
  _apiRecord: WbApiFinanceRecord,
  _productId: string | null
): Omit<WbFinance, "id"> {
  throw new Error("mapApiFinanceToDb not implemented");
}

export function mapApiAdToDb(
  _apiAd: WbApiAdCampaign,
  _productId: string | null,
  _supplierArticle: string | null
): Omit<WbAd, "id"> {
  throw new Error("mapApiAdToDb not implemented");
}

export function mapApiProductToDb(_apiProduct: WbApiProductCard): {
  supplier_article: string;
  nm_id: number;
  name: string;
  barcode: string | null;
} {
  throw new Error("mapApiProductToDb not implemented");
}

export function mapFinanceOperationType(_apiType: string): WbFinance["operation_type"] {
  const typeMap: Record<string, WbFinance["operation_type"]> = {
    commission: "commission",
    logistics: "logistics",
    return_logistics: "return_logistics",
    storage: "storage",
    penalty: "penalty",
    other: "other",
  };
  return typeMap[_apiType] ?? "other";
}
