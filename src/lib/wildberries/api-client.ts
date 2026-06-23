/**
 * Wildberries API integration scaffold.
 *
 * This module defines the client interface and sync orchestration
 * for future Wildberries API integration. No API calls are made yet.
 *
 * @see https://dev.wildberries.ru/openapi/api-information
 */

export type WbApiConfig = {
  token: string;
  baseUrl: string;
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
  dateFrom: string;
  dateTo: string;
  entities?: WbSyncEntity[];
};

export type WbSyncEntity =
  | "orders"
  | "sales"
  | "finance"
  | "ads"
  | "products"
  | "stocks";

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

export function getWbApiConfig(): WbApiConfig {
  const token = process.env.WB_API_TOKEN;
  const baseUrl = process.env.WB_API_BASE_URL ?? "https://suppliers-api.wildberries.ru";

  if (!token) {
    throw new WbApiError("WB_API_TOKEN is not configured");
  }

  return { token, baseUrl };
}

/**
 * Base HTTP client for Wildberries API requests.
 * Will be implemented when API integration begins.
 */
export class WbApiClient {
  private config: WbApiConfig;

  constructor(config?: WbApiConfig) {
    this.config = config ?? getWbApiConfig();
  }

  async request<T>(_endpoint: string, _options?: RequestInit): Promise<T> {
    throw new WbApiError(
      "Wildberries API integration is not yet implemented. Configure WB_API_TOKEN and implement request()."
    );
  }

  // --- Orders API ---
  async fetchOrders(_dateFrom: string, _dateTo: string): Promise<unknown[]> {
    throw new WbApiError("fetchOrders not implemented");
  }

  // --- Sales API ---
  async fetchSales(_dateFrom: string, _dateTo: string): Promise<unknown[]> {
    throw new WbApiError("fetchSales not implemented");
  }

  // --- Finance API ---
  async fetchFinanceReport(_dateFrom: string, _dateTo: string): Promise<unknown[]> {
    throw new WbApiError("fetchFinanceReport not implemented");
  }

  // --- Advertising API ---
  async fetchAdCampaigns(_dateFrom: string, _dateTo: string): Promise<unknown[]> {
    throw new WbApiError("fetchAdCampaigns not implemented");
  }

  // --- Content API (products) ---
  async fetchProductCards(_limit?: number, _offset?: number): Promise<unknown[]> {
    throw new WbApiError("fetchProductCards not implemented");
  }
}

/**
 * Orchestrates data sync from Wildberries API to Supabase.
 * Each entity sync method will map API responses to database records.
 */
export class WbSyncService {
  private client: WbApiClient;

  constructor(client?: WbApiClient) {
    this.client = client ?? new WbApiClient();
  }

  async syncAll(_options: WbSyncOptions): Promise<WbSyncResult[]> {
    throw new WbApiError("Full sync not yet implemented");
  }

  async syncOrders(_dateFrom: string, _dateTo: string): Promise<WbSyncResult> {
    return this.createPendingResult("orders");
  }

  async syncSales(_dateFrom: string, _dateTo: string): Promise<WbSyncResult> {
    return this.createPendingResult("sales");
  }

  async syncFinance(_dateFrom: string, _dateTo: string): Promise<WbSyncResult> {
    return this.createPendingResult("finance");
  }

  async syncAds(_dateFrom: string, _dateTo: string): Promise<WbSyncResult> {
    return this.createPendingResult("ads");
  }

  async syncProducts(): Promise<WbSyncResult> {
    return this.createPendingResult("products");
  }

  private createPendingResult(entity: string): WbSyncResult {
    return {
      entity,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: [`${entity} sync not yet implemented`],
      syncedAt: new Date().toISOString(),
    };
  }
}

export const wbApiClient = new WbApiClient();
export const wbSyncService = new WbSyncService();
