import {
  expandSalesReportFetchWindow,
  sumCashReceivedFromSalesReports,
} from "@/lib/cash-received";
import { sumExpectedWbPayoutFromSalesReports } from "@/lib/expected-wb-payout";
import { sanitizeUserFacingError } from "@/lib/user-facing-errors";
import { cachedExternalRequest } from "@/lib/wb/wb-request-cache";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type {
  CashReceivedMetrics,
  ExpectedWbPayoutMetrics,
  ScopedDateRange,
} from "@/types/database";

export type WbSalesReportsLoadResult =
  | { kind: "wildberries"; reports: WbSalesReportListItem[] }
  | { kind: "unsupported" }
  | { kind: "error"; error: unknown };

/** Single WB Finance sales-reports fetch shared by Cash Received, Expected Payout, and Settlement. */
export async function loadWbWeeklySalesReports(
  scope: ScopedDateRange
): Promise<WbSalesReportsLoadResult> {
  const cacheKey = `wb-weekly-reports:${scope.marketplaceAccountId}:${scope.from}:${scope.to}`;
  return cachedExternalRequest(cacheKey, async () => {
    try {
      const account = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
      if (account.marketplace !== "wildberries") {
        return { kind: "unsupported" as const };
      }

      const client = new WbApiClient(account.apiKey);
      const { fetchFrom, fetchTo } = expandSalesReportFetchWindow(scope.from, scope.to);
      const reports = await client.fetchSalesReportsList(fetchFrom, fetchTo, "weekly");
      return { kind: "wildberries" as const, reports };
    } catch (error) {
      return { kind: "error" as const, error };
    }
  });
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
