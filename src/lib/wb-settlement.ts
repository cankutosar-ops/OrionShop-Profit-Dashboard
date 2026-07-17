import { parseWbSourceSuffix } from "@/lib/finance-category";
import { summarizeFinanceByCategory } from "@/lib/finance-rollup";
import { parseWbMoney } from "@/lib/cash-received";
import { reportPeriodOverlaps } from "@/lib/expected-wb-payout";
import type {
  SettlementDataAvailability,
  WbFinance,
  WbSettlementDataSource,
  WbSettlementMetrics,
} from "@/types/database";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";

const WEEKLY_FALLBACK_NOTE =
  "netForPay from overlapping weekly WB reports (full report periods; partial weeks may differ from a custom range).";

/** Signed netForPay from finance transaction lines (ppvz_for_pay synced as for_pay suffix). */
export function sumNetForPayFromFinance(finance: WbFinance[]): number {
  return finance.reduce((sum, row) => {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix !== "for_pay") return sum;
    return sum + Number(row.amount);
  }, 0);
}

export function countFinanceForPayLines(finance: WbFinance[]): number {
  return finance.reduce((count, row) => {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix !== "for_pay") return count;
    return Math.abs(Number(row.amount)) > 0 ? count + 1 : count;
  }, 0);
}

/** netForPay = Σ forPaySum from weekly reports overlapping the dashboard range. */
export function sumNetForPayFromWeeklyReports(
  reports: WbSalesReportListItem[],
  scopeFrom: string,
  scopeTo: string
): { netForPay: number; reportCount: number } {
  let netForPay = 0;
  let reportCount = 0;

  for (const report of reports) {
    if (!reportPeriodOverlaps(scopeFrom, scopeTo, report.dateFrom, report.dateTo)) continue;
    netForPay += parseWbMoney(report.forPaySum);
    reportCount += 1;
  }

  return { netForPay, reportCount };
}

/** Latest realization report period end (dateTo) from a report list. */
export function latestRealizationReportDate(
  reports: WbSalesReportListItem[] | undefined
): string | null {
  if (!reports?.length) return null;
  let latest: string | null = null;
  for (const report of reports) {
    const dateTo = String(report.dateTo ?? "").slice(0, 10);
    if (!dateTo) continue;
    if (!latest || dateTo > latest) latest = dateTo;
  }
  return latest;
}

/**
 * Settlement / Model C data is unavailable when the selected period starts after
 * the latest known weekly realization report and no period settlement source exists.
 * Informational only — not an application error.
 */
export function resolveSettlementDataAvailability(params: {
  scopeFrom: string;
  scopeTo: string;
  reports?: WbSalesReportListItem[];
  finance?: WbFinance[];
}): SettlementDataAvailability {
  const latest = latestRealizationReportDate(params.reports);
  const financeForPay = params.finance ? countFinanceForPayLines(params.finance) : 0;
  const overlappingWeekly = params.reports
    ? sumNetForPayFromWeeklyReports(params.reports, params.scopeFrom, params.scopeTo)
        .reportCount
    : 0;

  const isUnavailable =
    latest !== null &&
    params.scopeFrom > latest &&
    financeForPay === 0 &&
    overlappingWeekly === 0;

  return {
    available: !isUnavailable,
    latestRealizationReportDate: latest,
    selectedFrom: params.scopeFrom,
    selectedTo: params.scopeTo,
  };
}

export type NetForPayResolution = {
  netForPay: number;
  dataSource: WbSettlementDataSource;
  dataSourceNote?: string;
  weeklyReportCount?: number;
};

/**
 * Resolve netForPay using the most accurate source available.
 * 1. Finance transaction lines (ppvz_for_pay) — exact for any operation_date range.
 * 2. Weekly report forPaySum — official WB «К перечислению за товар» fallback.
 */
export function resolveNetForPay(params: {
  finance: WbFinance[];
  weeklyReports?: WbSalesReportListItem[];
  scopeFrom: string;
  scopeTo: string;
}): NetForPayResolution {
  const financeLineCount = countFinanceForPayLines(params.finance);
  const financeNetForPay = sumNetForPayFromFinance(params.finance);

  if (financeLineCount > 0) {
    return {
      netForPay: financeNetForPay,
      dataSource: "finance_transaction",
    };
  }

  if (params.weeklyReports?.length) {
    const weekly = sumNetForPayFromWeeklyReports(
      params.weeklyReports,
      params.scopeFrom,
      params.scopeTo
    );
    if (weekly.reportCount > 0) {
      return {
        netForPay: weekly.netForPay,
        dataSource: "weekly_reports",
        dataSourceNote: WEEKLY_FALLBACK_NOTE,
        weeklyReportCount: weekly.reportCount,
      };
    }
  }

  return {
    netForPay: 0,
    dataSource: "weekly_reports",
    dataSourceNote:
      "No transaction-level netForPay in finance. Re-sync finance to populate for_pay lines, or select a range with overlapping weekly reports.",
    weeklyReportCount: 0,
  };
}

function sumFinanceBySuffix(finance: WbFinance[], suffix: string): number {
  return finance.reduce((sum, row) => {
    const rowSuffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (rowSuffix !== suffix) return sum;
    return sum + Math.abs(Number(row.amount));
  }, 0);
}

export function buildWbSettlementMetrics(params: {
  netForPay: number;
  finance: WbFinance[];
  logistics: number;
  dataSource: WbSettlementDataSource;
  dataSourceNote?: string;
  weeklyReportCount?: number;
  availability?: SettlementDataAvailability;
}): WbSettlementMetrics {
  const categorySummary = summarizeFinanceByCategory(params.finance);
  const storage = categorySummary.STORAGE;
  const penalties = categorySummary.PENALTY;
  const deductions = categorySummary.ADJUSTMENT;
  const acceptance = sumFinanceBySuffix(params.finance, "acceptance");
  const settlement =
    params.netForPay - params.logistics - storage - penalties - deductions - acceptance;

  return {
    netForPay: params.netForPay,
    logistics: params.logistics,
    storage,
    penalties,
    deductions,
    acceptance,
    settlement,
    dataSource: params.dataSource,
    dataSourceNote: params.dataSourceNote,
    weeklyReportCount: params.weeklyReportCount,
    availability: params.availability,
  };
}

export function buildWbSettlementFromSources(
  finance: WbFinance[],
  logistics: number,
  netForPayResolution: NetForPayResolution,
  availability?: SettlementDataAvailability
): WbSettlementMetrics {
  return buildWbSettlementMetrics({
    netForPay: netForPayResolution.netForPay,
    finance,
    logistics,
    dataSource: netForPayResolution.dataSource,
    dataSourceNote: netForPayResolution.dataSourceNote,
    weeklyReportCount: netForPayResolution.weeklyReportCount,
    availability,
  });
}

/** Empty settlement shell when data is not yet available — UI must not display these as real zeros. */
export function buildUnavailableWbSettlement(
  availability: SettlementDataAvailability
): WbSettlementMetrics {
  return {
    netForPay: 0,
    logistics: 0,
    storage: 0,
    penalties: 0,
    deductions: 0,
    acceptance: 0,
    settlement: 0,
    dataSource: "weekly_reports",
    availability,
  };
}
