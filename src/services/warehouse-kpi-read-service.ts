/**
 * Sprint 10.6 — Map warehouse snapshots → Dashboard KPI metric shapes (read-only).
 * No marketplace HTTP.
 */

import { expandSalesReportFetchWindow } from "@/lib/cash-received";
import {
  getWarehouseAccountBalance,
  listWarehouseSalesReportSnapshots,
  type WarehouseSalesReportSnapshotRecord,
} from "@/lib/warehouse/snapshots";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import type { ScopedDateRange, WbBalanceMetrics } from "@/types/database";

export type WarehouseSalesReportsLoadResult =
  | { kind: "wildberries"; reports: WbSalesReportListItem[] }
  | { kind: "empty" }
  | { kind: "unsupported" }
  | { kind: "error"; error: unknown };

export function snapshotsToSalesReportItems(
  rows: WarehouseSalesReportSnapshotRecord[]
): WbSalesReportListItem[] {
  return rows.map((row) => ({
    reportId: row.reportId,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    createDate: row.createDate,
    currency: row.currency ?? undefined,
    reportType: row.reportType ?? undefined,
    retailAmountSum:
      row.retailAmountSum == null ? undefined : String(row.retailAmountSum),
    forPaySum: row.forPaySum == null ? undefined : String(row.forPaySum),
    bankPaymentSum:
      row.bankPaymentSum == null ? undefined : String(row.bankPaymentSum),
    sellerFinanceName: row.sellerFinanceName ?? undefined,
  }));
}

export async function loadSalesReportsFromWarehouse(
  scope: ScopedDateRange
): Promise<WarehouseSalesReportsLoadResult> {
  try {
    const { fetchFrom, fetchTo } = expandSalesReportFetchWindow(scope.from, scope.to);
    const rows = await listWarehouseSalesReportSnapshots(scope.marketplaceAccountId, {
      from: fetchFrom,
      to: fetchTo,
    });
    if (!rows.length) return { kind: "empty" };
    return { kind: "wildberries", reports: snapshotsToSalesReportItems(rows) };
  } catch (error) {
    return { kind: "error", error };
  }
}

export async function getBalanceMetricsFromWarehouse(
  marketplaceAccountId: string
): Promise<WbBalanceMetrics> {
  try {
    const row = await getWarehouseAccountBalance(marketplaceAccountId);
    if (!row) {
      return {
        current: null,
        forWithdraw: null,
        currency: null,
        unavailableReason:
          "Wallet balance not yet synced to warehouse — run warehouse sync",
      };
    }
    return {
      current: row.currentAmount,
      forWithdraw: row.forWithdrawAmount,
      currency: row.currency,
    };
  } catch (error) {
    return {
      current: null,
      forWithdraw: null,
      currency: null,
      unavailableReason:
        error instanceof Error ? error.message : "Failed to load warehouse balance",
    };
  }
}
