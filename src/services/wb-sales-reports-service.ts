/**
 * Sprint 10.6 — Sales reports / Cash Received / Expected Payout from warehouse snapshots.
 * No Marketplace HTTP.
 */

import {
  sumCashReceivedFromSalesReports,
} from "@/lib/cash-received";
import { sumExpectedWbPayoutFromSalesReports } from "@/lib/expected-wb-payout";
import { sanitizeUserFacingError } from "@/lib/user-facing-errors";
import {
  loadSalesReportsFromWarehouse,
  type WarehouseSalesReportsLoadResult,
} from "@/services/warehouse-kpi-read-service";
import type {
  CashReceivedMetrics,
  ExpectedWbPayoutMetrics,
  ScopedDateRange,
} from "@/types/database";

export type WbSalesReportsLoadResult = WarehouseSalesReportsLoadResult;

/** Warehouse-backed weekly sales reports (Cash Received, Expected Payout, Settlement). */
export async function loadWbWeeklySalesReports(
  scope: ScopedDateRange
): Promise<WbSalesReportsLoadResult> {
  const loaded = await loadSalesReportsFromWarehouse(scope);
  if (loaded.kind === "empty") {
    return {
      kind: "error",
      error: new Error(
        "Settlement reports not yet synced to warehouse — run warehouse sync"
      ),
    };
  }
  return loaded;
}

export function buildCashReceivedMetricsFromReports(
  scope: ScopedDateRange,
  loadResult: WbSalesReportsLoadResult
): CashReceivedMetrics {
  if (loadResult.kind === "unsupported") {
    return {
      amount: null,
      payoutCount: 0,
      unavailableReason: "Cash Received is available for Wildberries accounts only",
    };
  }

  if (loadResult.kind === "empty") {
    return {
      amount: null,
      payoutCount: 0,
      unavailableReason:
        "Settlement reports not yet synced to warehouse — run warehouse sync",
    };
  }

  if (loadResult.kind === "error") {
    return {
      amount: null,
      payoutCount: 0,
      unavailableReason: sanitizeUserFacingError(loadResult.error),
    };
  }

  const { amount, payoutCount } = sumCashReceivedFromSalesReports(
    loadResult.reports,
    scope.from,
    scope.to
  );
  return { amount, payoutCount };
}

export function buildExpectedWbPayoutMetricsFromReports(
  scope: ScopedDateRange,
  loadResult: WbSalesReportsLoadResult
): ExpectedWbPayoutMetrics {
  if (loadResult.kind === "unsupported") {
    return {
      amount: null,
      reportCount: 0,
      unavailableReason: "Expected WB Payout is available for Wildberries accounts only",
    };
  }

  if (loadResult.kind === "empty") {
    return {
      amount: null,
      reportCount: 0,
      unavailableReason:
        "Settlement reports not yet synced to warehouse — run warehouse sync",
    };
  }

  if (loadResult.kind === "error") {
    return {
      amount: null,
      reportCount: 0,
      unavailableReason: sanitizeUserFacingError(loadResult.error),
    };
  }

  const { amount, reportCount } = sumExpectedWbPayoutFromSalesReports(
    loadResult.reports,
    scope.from,
    scope.to
  );
  return { amount, reportCount };
}
