import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import {
  computeFinancePageWaitMs,
  parseRateLimitRetryHeader,
  parseWbRateLimitHeaders,
  resolve429WaitMs,
  type WbRateLimitSnapshot,
} from "@/lib/wildberries/rate-limit-retry";
import {
  WB_CONTENT_API,
  WB_FINANCE_API,
  WB_RATE_LIMIT_MAX_RETRIES,
  WB_RATE_LIMIT_MS,
  WB_SELLER_ANALYTICS_API,
  WB_STATISTICS_API,
  WB_SUPPLIES_API,
} from "./constants";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { redactSecrets } from "@/lib/security/secrets";
import {
  assertFinanceV1LiveAllowed,
  assertFinanceV1TokenReady,
  buildFinanceV1DetailedRequest,
  isFinanceV1DetailedEmpty,
  nextFinanceV1Cursor,
  normalizeFinanceV1DetailedRow,
  type WbFinanceV1DetailedRow,
  type WbFinanceV1Period,
  WB_FINANCE_V1_DETAILED_PATH,
} from "./finance-v1";
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
  WbWarehouseStockItem,
  WbWarehousesStockResponse,
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
  /** Finance Sync V2: distinct realizationreport_id values from fetched detail rows. */
  reportIds?: number[];
  /** Finance Sync V2: min/max operation_date from mapped lines. */
  returnedFrom?: string | null;
  returnedTo?: string | null;
};

export type WbSyncOptions = {
  marketplaceAccountId: string;
  dateFrom: string;
  dateTo: string;
  entities?: WbSyncEntity[];
};

export type WbSyncEntity = "orders" | "sales" | "finance" | "products" | "stock";

export type WbFinanceReportPage = {
  rows: WbApiFinanceRow[];
  currentRrdId: number;
  firstRrdId: number | null;
  lastRrdId: number | null;
  isEmpty: boolean;
  hasMore: boolean;
  rateLimit: WbRateLimitSnapshot | null;
};

export class WbApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
    /** Structured machine-readable code (e.g. FINANCE_HTTP_429). */
    public code?: string
  ) {
    super(message);
    this.name = "WbApiError";
  }
}

/** True only for a real HTTP 429 — never matches bare "rate-limit" wording. */
export function isFinanceHttp429Error(error: unknown): boolean {
  if (error instanceof WbApiError) {
    return error.statusCode === 429 || error.code === "FINANCE_HTTP_429";
  }
  if (error && typeof error === "object") {
    const maybe = error as { statusCode?: unknown; code?: unknown; message?: unknown };
    if (maybe.statusCode === 429 || maybe.code === "FINANCE_HTTP_429") return true;
    if (typeof maybe.message === "string" && isFinanceHttp429Error(maybe.message)) return true;
  }
  const msg = String(error ?? "");
  if (!msg) return false;
  // Explicit HTTP 429 markers only — do not match "rate-limit headers missing".
  if (/\bFINANCE_HTTP_429\b/.test(msg)) return true;
  if (/\[http\s*429\]/i.test(msg)) return true;
  if (/\bWB API error 429\b/i.test(msg)) return true;
  if (/\bhttp(?:Status|_?status| status)[=:\s]+429\b/i.test(msg)) return true;
  if (/\btoo many requests\b/i.test(msg)) return true;
  // Bare "429" token only when not part of a missing-headers validation message.
  if (/\b429\b/.test(msg) && !/headers missing|ambiguous|Remaining\/Reset required|missing_rate_limit_headers/i.test(msg)) {
    return true;
  }
  return false;
}

export const FINANCE_V1_MISSING_RATE_LIMIT_HEADERS = "FINANCE_V1_MISSING_RATE_LIMIT_HEADERS";
export const FINANCE_HTTP_429 = "FINANCE_HTTP_429";

export function getWbApiToken(): string {
  const token = process.env.WB_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new WbApiError("WB_API_TOKEN is not configured in .env.local");
  }
  return token.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) {
    return Promise.reject(new DOMException("Sync aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Sync aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Sync aborted", "AbortError");
  }
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
    let total429WaitMs = 0;
    const overallStarted = Date.now();
    const endpoint = `${baseUrl}${path.split("?")[0]}`;
    const execCtx = getSyncExecutionContext();
    const abortSignal = execCtx?.abortSignal;
    const isLegacyFinanceReport =
      baseUrl === WB_STATISTICS_API &&
      path.startsWith("/api/v5/supplier/reportDetailByPeriod");
    const isFinanceV1SalesReports =
      baseUrl === WB_FINANCE_API &&
      path.startsWith("/api/finance/v1/sales-reports");
    const isFinanceDetailRequest = isLegacyFinanceReport || isFinanceV1SalesReports;
    const configuredMax429Retries =
      execCtx?.wb429MaxRetries ?? WB_RATE_LIMIT_MAX_RETRIES;
    // A Finance 429 is always terminal. This prevents legacy/manual callers
    // from recreating the historical 20-attempt retry storms.
    const max429Retries = isFinanceDetailRequest
      ? 1
      : configuredMax429Retries;
    const max429TotalWaitMs = isFinanceDetailRequest
      ? 0
      : (execCtx?.wb429MaxTotalWaitMs ?? Number.POSITIVE_INFINITY);

    while (true) {
      attempt += 1;
      assertNotAborted(abortSignal);

      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < WB_RATE_LIMIT_MS) {
        await sleepWithAbort(WB_RATE_LIMIT_MS - elapsed, abortSignal);
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
        signal: abortSignal ?? init?.signal,
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      this.lastRequestAt = Date.now();
      const durationMs = Date.now() - startedAt;
      const rateLimitSnapshot = parseWbRateLimitHeaders(response.headers);
      if (execCtx) {
        execCtx.lastRateLimitSnapshot = rateLimitSnapshot;
        if (rateLimitSnapshot.retryAfterMs != null) {
          execCtx.lastRateLimitRetryAfterMs = rateLimitSnapshot.retryAfterMs;
        }
      }

      syncLog("wb-api", "Request END", {
        method: init?.method ?? "GET",
        url,
        status: response.status,
        durationMs,
        attempt,
        rateLimitRemaining: rateLimitSnapshot.remaining,
        rateLimitLimit: rateLimitSnapshot.limit,
        rateLimitReset: rateLimitSnapshot.resetSeconds,
        rateLimitRetry: rateLimitSnapshot.retrySeconds,
      });

      if (response.status === 429 && attempt < max429Retries) {
        count429 += 1;
        const honorServer =
          execCtx != null && execCtx.wb429HonorServerRetry !== false;
        const serverRetryMs = honorServer
          ? rateLimitSnapshot.retryAfterMs ??
            parseRateLimitRetryHeader(response.headers.get("X-RateLimit-Retry"))
          : null;
        if (execCtx && serverRetryMs != null) {
          execCtx.lastRateLimitRetryAfterMs = serverRetryMs;
        }
        const fallbackWaitMs = Math.min(180_000, 20_000 * attempt);
        const waitMs = resolve429WaitMs({
          honorServerRetry: honorServer,
          serverRetryMs,
          fallbackWaitMs,
        });
        if (total429WaitMs + waitMs > max429TotalWaitMs) {
          throw new WbApiError(
            "WB API error 429: rate limit retry budget exhausted (commercial continuity)",
            429,
            path,
            FINANCE_HTTP_429
          );
        }
        total429WaitMs += waitMs;
        syncLog("wb-api", "Rate limited — retrying", {
          attempt,
          waitMs,
          total429WaitMs,
          max429Retries,
          serverRetryMs,
          honorServerRetry: honorServer,
        });
        await sleepWithAbort(waitMs, abortSignal);
        continue;
      }

      if (!response.ok) {
        // Always surface Retry on terminal 429 (including recovery fail-closed).
        if (
          response.status === 429 &&
          execCtx &&
          rateLimitSnapshot.retryAfterMs != null
        ) {
          execCtx.lastRateLimitRetryAfterMs = rateLimitSnapshot.retryAfterMs;
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
            ok: false,
          },
        });
        const body = await response.text();
        throw new WbApiError(
          `WB API error ${response.status}: ${redactSecrets(body.slice(0, 300))}`,
          response.status,
          path,
          response.status === 429 ? FINANCE_HTTP_429 : undefined
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
   * Current WB warehouses inventory (Analytics).
   * Replaces deprecated Statistics GET /api/v1/supplier/stocks.
   * One row = one size (chrtId) on one warehouse. Updated ~every 30 minutes.
   */
  async fetchWbWarehousesStock(): Promise<WbWarehouseStockItem[]> {
    const all: WbWarehouseStockItem[] = [];
    let offset = 0;
    const limit = 100_000;

    syncLog("wb-api", "WB warehouses stock START", {});

    while (true) {
      const body = { limit, offset };
      const res = await this.request<WbWarehousesStockResponse>(
        WB_SELLER_ANALYTICS_API,
        "/api/analytics/v1/stocks-report/wb-warehouses",
        { method: "POST", body: JSON.stringify(body) }
      );
      const batch = res?.data?.items ?? [];
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 1_000_000) break;
    }

    syncLog("wb-api", "WB warehouses stock END", { totalRows: all.length });
    return all;
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

  /**
   * Legacy Statistics v5 page fetch (reportDetailByPeriod).
   * Account 2 Finance recovery must use fetchFinanceV1ReportPage instead.
   * Do not call this for reserved Account 2 recovery wakes.
   */
  async fetchFinanceReportPage(
    dateFrom: string,
    dateTo: string,
    currentRrdId: number
  ): Promise<WbFinanceReportPage> {
    if (!Number.isSafeInteger(currentRrdId) || currentRrdId < 0) {
      throw new WbApiError(`Invalid Finance rrdid cursor: ${currentRrdId}`);
    }

    const params = new URLSearchParams({
      dateFrom,
      dateTo,
      limit: "100000",
      rrdid: String(currentRrdId),
    });

    syncLog("wb-api", "Finance report page START (statistics v5)", { currentRrdId });
    const rows = await this.request<WbApiFinanceRow[]>(
      WB_STATISTICS_API,
      `/api/v5/supplier/reportDetailByPeriod?${params.toString()}`
    );
    const rateLimit =
      getSyncExecutionContext()?.lastRateLimitSnapshot ?? null;

    const firstRrdId = rows.length > 0 ? Number(rows[0].rrd_id) : null;
    const lastRrdId = rows.length > 0 ? Number(rows[rows.length - 1].rrd_id) : null;
    if (
      rows.length > 0 &&
      (!Number.isSafeInteger(firstRrdId) || !Number.isSafeInteger(lastRrdId))
    ) {
      throw new WbApiError("Finance report page contains an invalid rrd_id cursor");
    }

    const isEmpty = rows.length === 0;
    const hasMore = !isEmpty && lastRrdId !== currentRrdId;
    syncLog("wb-api", "Finance report page END (statistics v5)", {
      currentRrdId,
      firstRrdId,
      lastRrdId,
      batchSize: rows.length,
      hasMore,
      rateLimitRemaining: rateLimit?.remaining ?? null,
      rateLimitReset: rateLimit?.resetSeconds ?? null,
      rateLimitRetry: rateLimit?.retrySeconds ?? null,
    });

    return {
      rows,
      currentRrdId,
      firstRrdId,
      lastRrdId,
      isEmpty,
      hasMore,
      rateLimit,
    };
  }

  /**
   * Finance V1 detailed page (sales-reports/detailed).
   * Fail-closed before HTTP unless live env opt-in + Personal/Service+Finance token.
   * 204 / empty body → isEmpty; cursor advances only via caller after UPSERT.
   *
   * Rate-limit headers on HTTP 200:
   * - Remaining/Limit/Reset/Retry are captured when present and are authoritative for pacing.
   * - Missing Reset/Retry on a successful 200 does NOT discard the business body
   *   (repo does not prove Reset is mandatory on every 200; V5 page path already processes
   *   without requiring Reset). Next-request wait then uses FINANCE_RECOVERY_MIN_PAGE_GAP_MS
   *   via computeFinancePageWaitMs — never invent reportsServerRetryUntil.
   * - HTTP 429 remains fail-closed (statusCode 429 / FINANCE_HTTP_429).
   */
  async fetchFinanceV1ReportPage(
    dateFrom: string,
    dateTo: string,
    currentRrdId: number,
    period: WbFinanceV1Period = "weekly"
  ): Promise<WbFinanceReportPage> {
    assertFinanceV1LiveAllowed();
    assertFinanceV1TokenReady(this.token);

    const body = buildFinanceV1DetailedRequest({
      dateFrom,
      dateTo,
      rrdId: currentRrdId,
      period,
    });

    syncLog("wb-api", "Finance V1 detailed page START", {
      currentRrdId,
      period: body.period,
      path: WB_FINANCE_V1_DETAILED_PATH,
    });

    const raw = await this.request<WbFinanceV1DetailedRow[] | null>(
      WB_FINANCE_API,
      WB_FINANCE_V1_DETAILED_PATH,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    const rateLimit =
      getSyncExecutionContext()?.lastRateLimitSnapshot ?? null;

    if (rateLimit?.resetSeconds == null || rateLimit?.retrySeconds == null) {
      syncLog("wb-api", "Finance V1 detailed headers incomplete — processing body with local min gap", {
        remaining: rateLimit?.remaining ?? null,
        limit: rateLimit?.limit ?? null,
        resetSeconds: rateLimit?.resetSeconds ?? null,
        retrySeconds: rateLimit?.retrySeconds ?? null,
        pacing: "FINANCE_RECOVERY_MIN_PAGE_GAP_MS when Reset absent",
      });
    }

    const v1Rows = Array.isArray(raw) ? raw : [];
    const isEmpty = isFinanceV1DetailedEmpty(v1Rows);
    const cursor = nextFinanceV1Cursor({
      rows: v1Rows,
      currentRrdId,
    });
    const rows = isEmpty
      ? []
      : v1Rows.map((row) => normalizeFinanceV1DetailedRow(row));

    const firstRrdId = rows.length > 0 ? Number(rows[0].rrd_id) : null;
    const lastRrdId = rows.length > 0 ? Number(rows[rows.length - 1].rrd_id) : null;

    syncLog("wb-api", "Finance V1 detailed page END", {
      currentRrdId,
      firstRrdId,
      lastRrdId,
      batchSize: rows.length,
      hasMore: cursor.hasMore,
      isEmpty,
      rateLimitRemaining: rateLimit?.remaining ?? null,
      rateLimitReset: rateLimit?.resetSeconds ?? null,
      rateLimitRetry: rateLimit?.retrySeconds ?? null,
    });

    return {
      rows,
      currentRrdId,
      firstRrdId,
      lastRrdId,
      isEmpty,
      hasMore: cursor.hasMore,
      rateLimit,
    };
  }

  async fetchFinanceReport(dateFrom: string, dateTo: string): Promise<WbApiFinanceRow[]> {
    const all: WbApiFinanceRow[] = [];
    let rrdid = 0;
    let page = 0;

    syncLog("wb-api", "Finance report START", { dateFrom, dateTo });

    while (true) {
      page += 1;
      const result = await this.fetchFinanceReportPage(dateFrom, dateTo, rrdid);
      if (result.isEmpty) break;

      all.push(...result.rows);
      if (!result.hasMore || result.lastRrdId == null) break;
      rrdid = result.lastRrdId;
      const waitMs = computeFinancePageWaitMs({
        remaining: result.rateLimit?.remaining ?? null,
        resetSeconds: result.rateLimit?.resetSeconds ?? null,
        lastFinanceRequestAtMs: this.lastRequestAt,
      });
      await sleepWithAbort(
        waitMs,
        getSyncExecutionContext()?.abortSignal
      );
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
