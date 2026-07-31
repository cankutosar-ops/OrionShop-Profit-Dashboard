/**
 * Sprint 10.2 — In-memory MarketplaceAdapter for engine verification.
 * No marketplace HTTP. Deterministic fixtures.
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
import type { WarehouseScope } from "@/lib/warehouse/types";
import { HISTORICAL_BACKFILL_ENTITY_ORDER } from "@/lib/warehouse/backfill/constants";

export type MockMarketplaceAdapterOptions = {
  /** Fail when this entity is first started (after optional pages). */
  failOnEntity?: (typeof HISTORICAL_BACKFILL_ENTITY_ORDER)[number];
  /** Products page size (default: all in one page). */
  productPageSize?: number;
};

function pageOf<T>(items: T[], cursor: MarketplaceAdapterCursor, pageSize: number): MarketplaceAdapterPage<T> {
  const offset = cursor ? Number(cursor) || 0 : 0;
  const slice = items.slice(offset, offset + pageSize);
  const next = offset + pageSize;
  const done = next >= items.length;
  return {
    items: slice,
    nextCursor: done ? null : String(next),
    done,
  };
}

/**
 * Fixture adapter — products/prices/stocks are account-scoped snapshots;
 * orders/sales/finance return items tagged by window.
 */
export class MockMarketplaceAdapter implements MarketplaceAdapter {
  readonly capabilities = {
    marketplace: "wildberries" as const,
    entities: HISTORICAL_BACKFILL_ENTITY_ORDER,
  };

  private readonly failOnEntity: MockMarketplaceAdapterOptions["failOnEntity"];
  private readonly productPageSize: number;
  private readonly products: MarketplaceProductDto[];

  constructor(options: MockMarketplaceAdapterOptions = {}) {
    this.failOnEntity = options.failOnEntity;
    this.productPageSize = options.productPageSize ?? 100;
    this.products = [
      { externalProductId: "nm-1", supplierArticle: "SKU-1", name: "Product 1" },
      { externalProductId: "nm-2", supplierArticle: "SKU-2", name: "Product 2" },
      { externalProductId: "nm-3", supplierArticle: "SKU-3", name: "Product 3" },
    ];
  }

  private maybeFail(entity: (typeof HISTORICAL_BACKFILL_ENTITY_ORDER)[number]): void {
    if (this.failOnEntity === entity) {
      throw new Error(`Mock adapter forced failure on ${entity}`);
    }
  }

  async fetchProducts(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceProductDto>> {
    this.maybeFail("products");
    return pageOf(this.products, cursor ?? null, this.productPageSize);
  }

  async fetchOrders(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceOrderDto>> {
    this.maybeFail("orders");
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: [
        {
          externalOrderId: `ord-${window.from}`,
          orderedAt: `${window.from}T12:00:00.000Z`,
          quantity: 1,
        },
      ],
      nextCursor: null,
      done: true,
    };
  }

  async fetchSales(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceSaleDto>> {
    this.maybeFail("sales");
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: [
        {
          externalSaleId: `sale-${window.from}`,
          soldAt: `${window.from}T15:00:00.000Z`,
          quantity: 1,
        },
      ],
      nextCursor: null,
      done: true,
    };
  }

  async fetchFinance(
    _scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceFinanceLineDto>> {
    this.maybeFail("finance");
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: [
        {
          externalLineId: `fin-${window.from}`,
          operationDate: window.from,
          amount: 100,
        },
      ],
      nextCursor: null,
      done: true,
    };
  }

  async fetchStocks(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceStockDto>> {
    this.maybeFail("stocks");
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: [
        {
          externalProductId: "nm-1",
          warehouseCode: "WH-1",
          quantity: 10,
          observedAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
      done: true,
    };
  }

  async fetchPrices(
    _scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplacePriceDto>> {
    this.maybeFail("prices");
    if (cursor) {
      return { items: [], nextCursor: null, done: true };
    }
    return {
      items: this.products.map((p) => ({
        externalProductId: p.externalProductId,
        price: 999,
        currency: "RUB",
        observedAt: new Date().toISOString(),
      })),
      nextCursor: null,
      done: true,
    };
  }
}
