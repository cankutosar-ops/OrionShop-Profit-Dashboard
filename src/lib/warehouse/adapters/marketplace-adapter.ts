/**
 * Sprint 10.1 — Marketplace adapter contract.
 * Interfaces only — no Wildberries / Ozon / Lamoda / Shopify implementations.
 */

import type {
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseScope,
} from "@/lib/warehouse/types";

/** Opaque page cursor for adapter pagination (implementation-defined later). */
export type MarketplaceAdapterCursor = string | null;

export type MarketplaceAdapterPage<T> = {
  items: T[];
  nextCursor: MarketplaceAdapterCursor;
  /** True when adapter believes no further pages exist for the request. */
  done: boolean;
};

export type MarketplaceFetchWindow = {
  from: string;
  to: string;
};

/** Normalized DTO shapes — marketplace-agnostic contracts for future mappers. */
export type MarketplaceProductDto = {
  externalProductId: string;
  supplierArticle: string | null;
  name: string | null;
  raw?: unknown;
};

export type MarketplaceOrderDto = {
  externalOrderId: string;
  orderedAt: string | null;
  quantity: number | null;
  raw?: unknown;
};

export type MarketplaceSaleDto = {
  externalSaleId: string;
  soldAt: string | null;
  quantity: number | null;
  raw?: unknown;
};

export type MarketplaceFinanceLineDto = {
  externalLineId: string;
  operationDate: string | null;
  amount: number | null;
  raw?: unknown;
};

export type MarketplaceStockDto = {
  externalProductId: string;
  warehouseCode: string | null;
  quantity: number | null;
  observedAt: string | null;
  raw?: unknown;
};

export type MarketplacePriceDto = {
  externalProductId: string;
  price: number | null;
  currency: string | null;
  observedAt: string | null;
  raw?: unknown;
};

export type MarketplaceAdapterCapabilities = {
  marketplace: WarehouseMarketplaceType;
  entities: readonly WarehousePlatformEntity[];
};

/**
 * Plug-in marketplace adapter.
 * Sprint 10.1: contract only — must not call APIs until a later sprint.
 */
export interface MarketplaceAdapter {
  readonly capabilities: MarketplaceAdapterCapabilities;

  fetchProducts(
    scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceProductDto>>;

  fetchOrders(
    scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceOrderDto>>;

  fetchSales(
    scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceSaleDto>>;

  fetchFinance(
    scope: WarehouseScope,
    window: MarketplaceFetchWindow,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceFinanceLineDto>>;

  fetchStocks(
    scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplaceStockDto>>;

  fetchPrices(
    scope: WarehouseScope,
    cursor?: MarketplaceAdapterCursor
  ): Promise<MarketplaceAdapterPage<MarketplacePriceDto>>;
}

/**
 * Registry for plug-in adapters (empty until marketplace sprints register).
 */
export interface MarketplaceAdapterRegistry {
  get(marketplace: WarehouseMarketplaceType): MarketplaceAdapter | null;
  list(): readonly MarketplaceAdapter[];
  register(adapter: MarketplaceAdapter): void;
}
