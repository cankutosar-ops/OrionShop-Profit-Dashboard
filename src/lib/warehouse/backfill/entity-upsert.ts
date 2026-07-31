/**
 * Sprint 10.2 — Idempotent entity upsert port (marketplace-agnostic).
 */

import type {
  MarketplaceFinanceLineDto,
  MarketplaceOrderDto,
  MarketplacePriceDto,
  MarketplaceProductDto,
  MarketplaceSaleDto,
  MarketplaceStockDto,
} from "@/lib/warehouse/adapters/marketplace-adapter";
import type { WarehouseScope } from "@/lib/warehouse/types";
import type { HistoricalBackfillEntity } from "@/lib/warehouse/backfill/constants";

export type WarehouseEntityUpsertResult = {
  upserted: number;
  inserted: number;
  updated: number;
  skipped: number;
};

export interface WarehouseEntityUpsertPort {
  upsertProducts(
    scope: WarehouseScope,
    items: MarketplaceProductDto[]
  ): Promise<WarehouseEntityUpsertResult>;

  upsertOrders(
    scope: WarehouseScope,
    items: MarketplaceOrderDto[]
  ): Promise<WarehouseEntityUpsertResult>;

  upsertSales(
    scope: WarehouseScope,
    items: MarketplaceSaleDto[]
  ): Promise<WarehouseEntityUpsertResult>;

  upsertFinance(
    scope: WarehouseScope,
    items: MarketplaceFinanceLineDto[]
  ): Promise<WarehouseEntityUpsertResult>;

  upsertStocks(
    scope: WarehouseScope,
    items: MarketplaceStockDto[]
  ): Promise<WarehouseEntityUpsertResult>;

  upsertPrices(
    scope: WarehouseScope,
    items: MarketplacePriceDto[]
  ): Promise<WarehouseEntityUpsertResult>;
}

function emptyResult(): WarehouseEntityUpsertResult {
  return { upserted: 0, inserted: 0, updated: 0, skipped: 0 };
}

function scopePrefix(scope: WarehouseScope): string {
  return `${scope.marketplaceType}|${scope.companyId}|${scope.marketplaceAccountId}`;
}

/**
 * In-memory idempotent store — used by verify and dry-run paths.
 * Natural keys prevent duplicates across replay.
 */
export class InMemoryWarehouseEntityUpsert implements WarehouseEntityUpsertPort {
  readonly products = new Map<string, MarketplaceProductDto>();
  readonly orders = new Map<string, MarketplaceOrderDto>();
  readonly sales = new Map<string, MarketplaceSaleDto>();
  readonly finance = new Map<string, MarketplaceFinanceLineDto>();
  readonly stocks = new Map<string, MarketplaceStockDto>();
  readonly prices = new Map<string, MarketplacePriceDto>();

  private upsertMap<T>(
    map: Map<string, T>,
    key: string,
    item: T
  ): { inserted: number; updated: number } {
    if (map.has(key)) {
      map.set(key, item);
      return { inserted: 0, updated: 1 };
    }
    map.set(key, item);
    return { inserted: 1, updated: 0 };
  }

  async upsertProducts(
    scope: WarehouseScope,
    items: MarketplaceProductDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const key = `${prefix}|product|${item.externalProductId}`;
      const r = this.upsertMap(this.products, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  async upsertOrders(
    scope: WarehouseScope,
    items: MarketplaceOrderDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const key = `${prefix}|order|${item.externalOrderId}`;
      const r = this.upsertMap(this.orders, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  async upsertSales(
    scope: WarehouseScope,
    items: MarketplaceSaleDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const key = `${prefix}|sale|${item.externalSaleId}`;
      const r = this.upsertMap(this.sales, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  async upsertFinance(
    scope: WarehouseScope,
    items: MarketplaceFinanceLineDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const key = `${prefix}|finance|${item.externalLineId}`;
      const r = this.upsertMap(this.finance, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  async upsertStocks(
    scope: WarehouseScope,
    items: MarketplaceStockDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const wh = item.warehouseCode ?? "_";
      const key = `${prefix}|stock|${item.externalProductId}|${wh}`;
      const r = this.upsertMap(this.stocks, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  async upsertPrices(
    scope: WarehouseScope,
    items: MarketplacePriceDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = emptyResult();
    const prefix = scopePrefix(scope);
    for (const item of items) {
      const key = `${prefix}|price|${item.externalProductId}`;
      const r = this.upsertMap(this.prices, key, item);
      result.inserted += r.inserted;
      result.updated += r.updated;
      result.upserted += 1;
    }
    return result;
  }

  count(entity: HistoricalBackfillEntity): number {
    switch (entity) {
      case "products":
        return this.products.size;
      case "orders":
        return this.orders.size;
      case "sales":
        return this.sales.size;
      case "finance":
        return this.finance.size;
      case "stocks":
        return this.stocks.size;
      case "prices":
        return this.prices.size;
      default:
        return 0;
    }
  }
}
