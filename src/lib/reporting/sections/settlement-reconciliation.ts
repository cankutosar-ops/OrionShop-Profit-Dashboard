/**
 * Settlement Reconciliation — bridge FE Commercial Performance to WB settlement.
 * Period-independent: uses ReportContext totals for the selected scope only.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";

export type SettlementReconciliationData = {
  /** Model B Revenue (ppvz_for_pay). */
  revenue: number;
  /** WB settlement / expected payout for the selected period (nullable when unavailable). */
  settlementAmount: number | null;
  /** Revenue − Settlement Amount when settlement is available. */
  difference: number | null;
  /** Model B Seller Payout (FE settlement identity). */
  sellerPayout: number;
  /** Seller Payout − Settlement Amount when settlement is available. */
  sellerPayoutDifference: number | null;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  otherDeductions: number;
  settlement: {
    available: boolean;
    source: "expectedWbPayout" | "wbSettlement" | "unavailable";
    reportCount: number | null;
    unavailableReason: string | null;
    weeklyReportCount: number | null;
    dataSource: string | null;
  };
  notes: string[];
};

export function buildSettlementReconciliationSection(
  ctx: ReportContext
): ReportSection<SettlementReconciliationData> {
  const fe = ctx.financialEngine;
  const wb = ctx.overview.wbSettlement;
  const expected = ctx.overview.expectedWbPayout;

  let settlementAmount: number | null = null;
  let source: SettlementReconciliationData["settlement"]["source"] = "unavailable";
  let unavailableReason: string | null = null;
  let reportCount: number | null = null;

  if (expected.amount != null) {
    settlementAmount = expected.amount;
    source = "expectedWbPayout";
    reportCount = expected.reportCount;
  } else if (wb.availability?.available !== false) {
    settlementAmount = wb.settlement;
    source = "wbSettlement";
    reportCount = wb.weeklyReportCount ?? null;
  } else {
    unavailableReason =
      expected.unavailableReason ??
      wb.dataSourceNote ??
      "Settlement unavailable for selected period";
  }

  const notes: string[] = [
    "Revenue is Financial Engine V4 Commercial Performance (ppvz_for_pay).",
    "Settlement Amount is Wildberries payout for the selected reporting period when available.",
    "Difference = Revenue − Settlement Amount (marketplace cost bridge, not Net Profit).",
    "Seller Payout is the FE identity: Revenue − Logistics − Storage − Acceptance − Penalties − Other.",
  ];

  if (unavailableReason) {
    notes.push(`Settlement unavailable: ${unavailableReason}`);
  }

  return {
    id: "settlement-reconciliation",
    kind: "settlement-reconciliation",
    title: "Settlement Reconciliation",
    description:
      "How Financial Engine revenue relates to Wildberries settlement for the selected period",
    data: {
      revenue: fe.revenue,
      settlementAmount,
      difference:
        settlementAmount == null ? null : fe.revenue - settlementAmount,
      sellerPayout: fe.sellerPayout,
      sellerPayoutDifference:
        settlementAmount == null ? null : fe.sellerPayout - settlementAmount,
      logistics: fe.logistics,
      storage: fe.storage,
      acceptance: fe.acceptance,
      penalties: fe.penalties,
      otherDeductions: fe.adjustments,
      settlement: {
        available: settlementAmount != null,
        source,
        reportCount,
        unavailableReason,
        weeklyReportCount: wb.weeklyReportCount ?? null,
        dataSource: wb.dataSource ?? null,
      },
      notes,
    },
  };
}
