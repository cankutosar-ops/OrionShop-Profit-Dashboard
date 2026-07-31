/**
 * Sprint 10.2 — Wildberries MarketplaceAdapter.
 * Marketplace HTTP lives here — not inside the Historical Backfill Engine.
 */

import type {
  MarketplaceAdapter,
  MarketplaceAdapterCursor,
  MarketplaceAdapterPage,
  MarketplaceFetchWindow,
  MarketplaceFinanceLineDto,
  MarketplaceOrderDto,
  MarketplacePriceDto,
  MarketplaceProductDto,
  MarketplaceSaleDto,
  MarketplaceStockDto,
} from "@/lib/warehouse/adapters/marketplace-adapter";
import { HISTORICAL_BACKFILL_ENTITY_ORDER } from "@/lib/warehouse/backfill/constants";
import type { WarehouseScope } from "@/lib/warehouse/types";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WbApiProductCard } from "@/lib/wildberries/types";

export type WildberriesMarketplaceAdapterOptions = {
  apiKey: string;
};

function inWindow(iso: string | null | undefined, window: MarketplaceFetchWindow): boolean {
  if (!iso) return true;
  const day = iso.slice(0, 10);
  return day >= window.from && day <= window.to;
}

function mapProduct(card: WbApiProductCard): MarketplaceProductDto {
  return {
    externalProductId: String(card.nmID),
    supplierArticle: card.vendorCode ?? null,
    name: card.title ?? null,
    raw: card,
  };
}

function mapPrice(card: WbApiProductCard): MarketplacePriceDto {
  const sizePrices = (card.sizes ?? [])
    .map((s) => {
      const p = (s as { price?: number; discountedPrice?: number }).discountedPrice
        ?? (s as { price?: number }).price;
      return typeof p === "number" ? p : null;
    })
    .filter((p): p is number => p != null);
  const price = sizePrices.length ? Math.min(...sizePrices) : null;
  return {
    externalProductId: String(card.nmID),
    price,
    currency: "RUB",
    observedAt: new Date().toISOString(),
    raw: card,
  };
}

/**
 * Wildberries adapter — fetch-only. Persistence is the upsert port's job.
 */
export class WildberriesMarketplaceAdapter implements MarketplaceAdapter {
  readonly capabilities = {
    marketplace: "wildberries" as const,
    entities: HISTORICAL_BACKFILL_ENTITY_ORDER,
  };

  private readonly client: WbApiClient;
  private productCache: WbApiProductCard[] | null = null;

  constructor(options: WildberriesMarketplaceAdapterOptions) {
    this.client = new WbApiClient(options.apiKey);
  }

  private async loadProducts(): Promise<WbApiProductCard[]> {
    if (!this.productCache) {
      this.productCache = await this.client.fetchAllProductCards();
    }
    return this.productCache;
  }

  async fetchProducts(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceProductDto>> {
    const cards = await this.loadProducts();
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: cards.map(mapProduct),
      nextCursor: null,
      done: true,
    };
  }

  async fetchOrders(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceOrderDto>> {
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    const rows = await this.client.fetchOrders(`${window.from}T00:00:00`);
    const items = rows
      .filter((row) => inWindow(row.date ?? row.lastChangeDate, window))
      .map((row) => ({
        externalOrderId: String(row.srid ?? row.gNumber ?? `${row.nmId}-${row.date}`),
        orderedAt: row.date ?? null,
        quantity: 1,
        raw: row,
      }));
    return { items, nextCursor: null, done: true };
  }

  async fetchSales(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceSaleDto>> {
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    const rows = await this.client.fetchSales(`${window.from}T00:00:00`);
    const items = rows
      .filter((row) => inWindow(row.date ?? row.lastChangeDate, window))
      .map((row) => ({
        externalSaleId: String(row.saleID ?? row.srid ?? `${row.nmId}-${row.date}`),
        soldAt: row.date ?? null,
        quantity: 1,
        raw: row,
      }));
    return { items, nextCursor: null, done: true };
  }

  async fetchFinance(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceFinanceLineDto>> {
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    const rows = await this.client.fetchFinanceReport(window.from, window.to);
    const items = rows.map((row) => ({
      externalLineId: String(row.rrd_id),
      operationDate: row.rr_dt ?? row.sale_dt ?? null,
      amount: row.ppvz_for_pay ?? row.retail_amount ?? null,
      raw: row,
    }));
    return { items, nextCursor: null, done: true };
  }

  async fetchStocks(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceStockDto>> {
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    const rows = await this.client.fetchWbWarehousesStock();
    const items: MarketplaceStockDto[] = [];
    for (const row of rows) {
      const nested = row.warehouses?.length ? row.warehouses : [row];
      for (const wh of nested) {
        items.push({
          externalProductId: String(wh.nmId ?? row.nmId),
          warehouseCode: String(wh.warehouseName ?? row.warehouseName ?? wh.warehouseId ?? "_"),
          quantity: Number(wh.quantity ?? 0),
          observedAt: new Date().toISOString(),
          raw: { row, warehouse: wh },
        });
      }
    }
    return { items, nextCursor: null, done: true };
  }

  async fetchPrices(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplacePriceDto>> {
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    const cards = await this.loadProducts();
    return {
      items: cards.map(mapPrice),
      nextCursor: null,
      done: true,
    };
  }
}

export function createWildberriesMarketplaceAdapter(
  apiKey: string
): WildberriesMarketplaceAdapter {
  return new WildberriesMarketplaceAdapter({ apiKey });
}
