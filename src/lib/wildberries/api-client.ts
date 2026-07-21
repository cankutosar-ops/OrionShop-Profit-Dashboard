import {
  WB_CONTENT_API,
  WB_FINANCE_API,
  WB_FINANCE_PAGE_DELAY_MS,
  WB_RATE_LIMIT_MAX_RETRIES,
  WB_RATE_LIMIT_MS,
  WB_STATISTICS_API,
  WB_SUPPLIES_API,
} from "./constants";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { syncLog } from "./sync-log";
import type {
  WbApiCardsResponse,
  WbApiFinanceRow,
  WbApiOrder,
  WbApiProductCard,
  WbApiSale,
  WbApiStockRow,
  WbApiSupplyDetails,
  WbApiSupplyGood,
  WbApiSupplyListItem,
  WbAccountBalance,
  WbSalesReportListItem,
  WbSupplyListRequest,
} from "./types";

export type WbApiConfig = {
  token: string;
};

export type WbSyncResult = {
  entity: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
  syncedAt: string;
};

export type WbSyncOptions = {
  marketplaceAccountId: string;
  dateFrom: string;
  dateTo: string;
  entities?: WbSyncEntity[];
};

export type WbSyncEntity = "orders" | "sales" | "finance" | "products" | "stock";

export class WbApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string
  ) {
    super(message);
    this.name = "WbApiError";
  }
}

export function getWbApiToken(): string {
  const token = process.env.WB_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new WbApiError("WB_API_TOKEN is not configured in .env.local");
  }
  return token.trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WbApiClient {
  private token: string;
  private lastRequestAt = 0;

  constructor(token?: string) {
    this.token = token ?? getWbApiToken();
  }

  private async request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
    let attempt = 0;
    let count429 = 0;
    const overallStarted = Date.now();
    const endpoint = `${baseUrl}${path.split("?")[0]}`;

    while (true) {
      attempt += 1;
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < WB_RATE_LIMIT_MS) {
        await sleep(WB_RATE_LIMIT_MS - elapsed);
      }

      const url = `${baseUrl}${path}`;
      syncLog("wb-api", "Request START", {
        method: init?.method ?? "GET",
        url,
        attempt,
      });

      const startedAt = Date.now();
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      this.lastRequestAt = Date.now();
      const durationMs = Date.now() - startedAt;

      syncLog("wb-api", "Request END", {
        method: init?.method ?? "GET",
        url,
        status: response.status,
        durationMs,
        attempt,
      });

      if (response.status === 429 && attempt < WB_RATE_LIMIT_MAX_RETRIES) {
        count429 += 1;
        const waitMs = Math.min(180_000, 20_000 * attempt);
        syncLog("wb-api", "Rate limited — retrying", { attempt, waitMs });
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        recordPerfEvent({
          category: "wb_api",
          name: `wb_api.${path.split("?")[0]}`,
          durationMs: Date.now() - overallStarted,
          meta: {
            endpoint,
            path,
            method: init?.method ?? "GET",
            status: response.status,
            retries: Math.max(0, attempt - 1),
            count429,
            cache: "miss",
            ok: false,
          },
        });
        const body = await response.text();
        throw new WbApiError(
          `WB API error ${response.status}: ${body.slice(0, 300)}`,
          response.status,
          path
        );
      }

      recordPerfEvent({
        category: "wb_api",
        name: `wb_api.${path.split("?")[0]}`,
        durationMs: Date.now() - overallStarted,
        meta: {
          endpoint,
          path,
          method: init?.method ?? "GET",
          status: response.status,
          retries: Math.max(0, attempt - 1),
          count429,
          cache: "miss",
          ok: true,
          attemptDurationMs: durationMs,
        },
      });

      if (response.status === 204) {
        return [] as T;
      }

      return response.json() as Promise<T>;
    }
  }

  /** Paginated fetch for orders/sales statistics endpoints */
  async fetchPaginatedStatistics<T extends { lastChangeDate: string }>(
    path: string,
    dateFrom: string
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor = dateFrom;
    let page = 0;

    syncLog("wb-api", "Paginated statistics START", { path, dateFrom });

    while (true) {
      page += 1;
      const params = new URLSearchParams({ dateFrom: cursor, flag: "0" });
      syncLog("wb-api", "Paginated statistics page START", { path, page, cursor });

      const batch = await this.request<T[]>(
        WB_STATISTICS_API,
        `${path}?${params.toString()}`
      );

      syncLog("wb-api", "Paginated statistics page END", {
        path,
        page,
        batchSize: batch.length,
      });

      if (!batch.length) break;

      all.push(...batch);
      cursor = batch[batch.length - 1].lastChangeDate;

      if (batch.length < 80000) break;
    }

    syncLog("wb-api", "Paginated statistics END", { path, totalRows: all.length, pages: page });
    return all;
  }

  async fetchOrders(dateFrom: string): Promise<WbApiOrder[]> {
    return this.fetchPaginatedStatistics<WbApiOrder>("/api/v1/supplier/orders", dateFrom);
  }

  async fetchSales(dateFrom: string): Promise<WbApiSale[]> {
    return this.fetchPaginatedStatistics<WbApiSale>("/api/v1/supplier/sales", dateFrom);
  }

  /** Current warehouse stock snapshot from WB Statistics API. */
  async fetchStocks(dateFrom = "2019-01-01"): Promise<WbApiStockRow[]> {
    return this.fetchPaginatedStatistics<WbApiStockRow>("/api/v1/supplier/stocks", dateFrom);
  }

  /**
   * Weekly/daily realization report list with bank transfer totals.
   * Requires Personal or Service token with Finance scope.
   */
  async fetchSalesReportsList(
    dateFrom: string,
    dateTo: string,
    period: "weekly" | "daily" = "weekly"
  ): Promise<WbSalesReportListItem[]> {
    const all: WbSalesReportListItem[] = [];
    let offset = 0;
    const limit = 1000;

    syncLog("wb-api", "Sales reports list START", { dateFrom, dateTo, period });

    while (true) {
      const batch = await this.request<WbSalesReportListItem[]>(
        WB_FINANCE_API,
        "/api/finance/v1/sales-reports/list",
        {
          method: "POST",
          body: JSON.stringify({ dateFrom, dateTo, period, limit, offset }),
        }
      );

      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }

    syncLog("wb-api", "Sales reports list END", { totalRows: all.length });
    return all;
  }

  /** Seller wallet balance — portal main-page widget. Requires Finance-scoped token. */
  async fetchAccountBalance(): Promise<WbAccountBalance> {
    syncLog("wb-api", "Account balance START", {});
    const data = await this.request<WbAccountBalance>(WB_FINANCE_API, "/api/v1/account/balance");
    syncLog("wb-api", "Account balance END", { currency: data.currency });
    return data;
  }

  async fetchFinanceReport(dateFrom: string, dateTo: string): Promise<WbApiFinanceRow[]> {
    const all: WbApiFinanceRow[] = [];
    let rrdid = 0;
    let page = 0;

    syncLog("wb-api", "Finance report START", { dateFrom, dateTo });

    while (true) {
      page += 1;
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        limit: "100000",
        rrdid: String(rrdid),
      });

      syncLog("wb-api", "Finance report page START", { page, rrdid });

      const batch = await this.request<WbApiFinanceRow[]>(
        WB_STATISTICS_API,
        `/api/v5/supplier/reportDetailByPeriod?${params.toString()}`
      );

      syncLog("wb-api", "Finance report page END", { page, batchSize: batch.length });

      if (!batch.length) break;

      all.push(...batch);
      const lastRrd = batch[batch.length - 1].rrd_id;
      if (lastRrd === rrdid) break;
      rrdid = lastRrd;
      await sleep(WB_FINANCE_PAGE_DELAY_MS);
    }

    syncLog("wb-api", "Finance report END", { totalRows: all.length, pages: page });
    return all;
  }

  async fetchAllProductCards(): Promise<WbApiCardsResponse["cards"]> {
    const all: WbApiCardsResponse["cards"] = [];
    let cursor: { limit: number; nmID?: number; updatedAt?: string } = { limit: 100 };
    let page = 0;

    syncLog("wb-api", "Product cards START");

    while (true) {
      page += 1;
      const body = {
        settings: {
          cursor,
          filter: { withPhoto: -1 },
        },
      };

      syncLog("wb-api", "Product cards page START", { page, cursor });

      const response = await this.request<WbApiCardsResponse>(
        WB_CONTENT_API,
        "/content/v2/get/cards/list",
        { method: "POST", body: JSON.stringify(body) }
      );

      syncLog("wb-api", "Product cards page END", {
        page,
        batchSize: response.cards?.length ?? 0,
      });

      if (!response.cards?.length) break;

      all.push(...response.cards);

      const nextNmID = response.cursor?.nmID;
      const nextUpdatedAt = response.cursor?.updatedAt;
      if (!nextNmID || !nextUpdatedAt) break;

      cursor = { limit: 100, nmID: nextNmID, updatedAt: nextUpdatedAt };
    }

    syncLog("wb-api", "Product cards END", { totalCards: all.length, pages: page });
    return all;
  }

  /** Fetch a single product card by supplier article (vendor code). */
  async fetchProductCardByVendorCode(vendorCode: string): Promise<WbApiProductCard | null> {
    const response = await this.request<WbApiCardsResponse>(
      WB_CONTENT_API,
      "/content/v2/get/cards/list",
      {
        method: "POST",
        body: JSON.stringify({
          settings: {
            cursor: { limit: 100 },
            filter: { textSearch: vendorCode, withPhoto: -1 },
          },
        }),
      }
    );

    const cards = response.cards ?? [];
    return cards.find((card) => card.vendorCode === vendorCode) ?? cards[0] ?? null;
  }

  /**
   * FBW inbound supplies list (warehouse shipments).
   * Requires Supplies-scoped token. Dates must be YYYY-MM-DD.
   */
  async listSupplies(
    body: WbSupplyListRequest = {},
    options?: { limit?: number; offset?: number }
  ): Promise<WbApiSupplyListItem[]> {
    const limit = options?.limit ?? 1000;
    const offset = options?.offset ?? 0;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    syncLog("wb-api", "Supplies list START", { limit, offset, body });
    const rows = await this.request<WbApiSupplyListItem[]>(
      WB_SUPPLIES_API,
      `/api/v1/supplies?${params.toString()}`,
      { method: "POST", body: JSON.stringify(body) }
    );
    syncLog("wb-api", "Supplies list END", { count: rows.length });
    return rows;
  }

  /** FBW supply header details (warehouse, accepted qty, status). */
  async fetchSupplyDetails(
    supplyId: number,
    isPreorderID = false
  ): Promise<WbApiSupplyDetails> {
    const params = new URLSearchParams({
      isPreorderID: String(isPreorderID),
    });
    return this.request<WbApiSupplyDetails>(
      WB_SUPPLIES_API,
      `/api/v1/supplies/${supplyId}?${params.toString()}`
    );
  }

  /** Product lines inside a supply — paginated. */
  async fetchSupplyGoods(
    supplyId: number,
    options?: { isPreorderID?: boolean; limit?: number }
  ): Promise<WbApiSupplyGood[]> {
    const isPreorderID = options?.isPreorderID ?? false;
    const pageSize = options?.limit ?? 1000;
    const all: WbApiSupplyGood[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        isPreorderID: String(isPreorderID),
      });
      const batch = await this.request<WbApiSupplyGood[]>(
        WB_SUPPLIES_API,
        `/api/v1/supplies/${supplyId}/goods?${params.toString()}`
      );
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  }
}
