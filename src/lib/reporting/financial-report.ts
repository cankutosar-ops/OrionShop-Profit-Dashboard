/**
 * Financial Report skeleton — wired to Reporting Engine; sections TBD.
 */
import {
  loadReportContext,
  type LoadReportContextOptions,
} from "@/lib/reporting/report-context";
import { buildReportDocument } from "@/lib/reporting/report-builder";
import {
  buildAppendixSection,
  buildFinancialSummarySection,
  buildMarketplaceCostsSection,
} from "@/lib/reporting/sections";
import type { ReportDocument } from "@/lib/reporting/types";
import type { ScopedDateRange } from "@/types/database";

export async function buildFinancialReport(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportDocument> {
  const ctx = await loadReportContext(scope, {
    ...options,
    skipInventory: true,
  });
  const fe = ctx.financialEngine;

  return buildReportDocument({
    kind: "financial",
    context: ctx,
    version: 1,
    summary: {
      headline: "Financial report (skeleton)",
      metrics: [
        {
          id: "revenue",
          label: "Revenue",
          value: fe.revenue,
          format: "currency",
          unit: ctx.tenant.currency,
        },
        {
          id: "final-net-profit",
          label: "Net Profit",
          value: fe.finalNetProfit,
          format: "currency",
          unit: ctx.tenant.currency,
        },
      ],
    },
    sections: [
      buildFinancialSummarySection(ctx),
      buildMarketplaceCostsSection(ctx),
      buildAppendixSection(ctx),
    ],
  });
}
