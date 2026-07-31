/**
 * Sprint 10.6 — Wallet balance from warehouse_account_balance only.
 * No Marketplace HTTP.
 */

import { getBalanceMetricsFromWarehouse } from "@/services/warehouse-kpi-read-service";
import type { WbBalanceMetrics } from "@/types/database";

/**
 * Current WB wallet balance snapshot from Warehouse.
 * Point-in-time, not filtered by dashboard date range.
 */
export async function getWbBalanceMetrics(
  marketplaceAccountId: string
): Promise<WbBalanceMetrics> {
  return getBalanceMetricsFromWarehouse(marketplaceAccountId);
}
