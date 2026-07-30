/**
 * Business Performance Report — management intelligence layer (Sprint 7.6).
 *
 * Composition only: every section consumes ReportContext.
 * Period-independent — selected scope controls all figures.
 */
import {
  loadReportContext,
  type LoadReportContextOptions,
  type ReportContext,
} from "@/lib/reporting/report-context";
import { buildReportDocument } from "@/lib/reporting/report-builder";
import { BUSINESS_REPORT_VERSION } from "@/lib/reporting/business-report-version";
import {
  buildAppendixSection,
  buildBrandProfitabilitySection,
  buildCoverSection,
  buildExecutiveSummarySection,
  buildFinancialRatiosSection,
  buildFinancialSummarySection,
  buildInventorySection,
  buildLogisticsSection,
  buildMarketplaceCostsSection,
  buildProductPerformanceSection,
  buildReportHealthSection,
  buildReturnsSection,
  buildSettlementReconciliationSection,
  buildTrendsSection,
  validateFinancialSummaryAgainstEngine,
} from "@/lib/reporting/sections";
import { emptyReportInsights, netMarginPercent } from "@/lib/reporting/section-utils";
import type { ReportDocument, ReportSummary } from "@/lib/reporting/types";
import type { ScopedDateRange } from "@/types/database";

export { BUSINESS_REPORT_VERSION } from "@/lib/reporting/business-report-version";

function buildBusinessSummary(ctx: ReportContext): ReportSummary {
  const fe = ctx.financialEngine;
  const op = ctx.overview.ordersPurchases;
  const qty = ctx.overview.quantityMetrics;

  return {
    headline: "Business performance for the selected period",
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
      {
        id: "margin",
        label: "Margin",
        value: netMarginPercent(fe.revenue, fe.finalNetProfit),
        format: "percent",
      },
      {
        id: "orders",
        label: "Orders",
        value: op.ordersCount,
        format: "number",
      },
      {
        id: "units-sold",
        label: "Units Sold",
        value: qty.unitsSold,
        format: "number",
      },
      {
        id: "return-rate",
        label: "Return Rate",
        value: op.returnRate,
        format: "percent",
      },
    ],
    notes: ctx.meta.isSampleData
      ? ["Sample data — configure Supabase for live figures."]
      : undefined,
  };
}

/**
 * Assemble the full Business Report document from ReportContext.
 */
export function buildBusinessReportDocument(ctx: ReportContext): ReportDocument {
  const financialSummary = buildFinancialSummarySection(ctx);
  const financialCheck = validateFinancialSummaryAgainstEngine(financialSummary.data);
  const extraWarnings = financialCheck.ok
    ? []
    : [`financial_summary_mismatch: ${financialCheck.mismatches.join(",")}`];

  return buildReportDocument({
    kind: "business",
    context: ctx,
    version: BUSINESS_REPORT_VERSION,
    summary: buildBusinessSummary(ctx),
    insights: emptyReportInsights(),
    sections: [
      buildCoverSection(ctx),
      buildExecutiveSummarySection(ctx),
      financialSummary,
      buildSettlementReconciliationSection(ctx),
      buildFinancialRatiosSection(ctx),
      buildBrandProfitabilitySection(ctx),
      buildProductPerformanceSection(ctx),
      buildMarketplaceCostsSection(ctx),
      buildLogisticsSection(ctx),
      buildReturnsSection(ctx),
      buildTrendsSection(ctx),
      buildInventorySection(ctx),
      buildReportHealthSection(ctx),
      buildAppendixSection(ctx),
    ],
    appendix: {
      definitions: [
        {
          term: "Revenue",
          definition: "Finance Σ ppvz_for_pay (Model B Commercial Performance).",
        },
        {
          term: "Net Profit",
          definition:
            "Model B finalNetProfit — after product cost, marketplace costs, ads, and estimated tax.",
        },
        {
          term: "Settlement Amount",
          definition:
            "Wildberries payout for the selected period (expectedWbPayout or wbSettlement).",
        },
        {
          term: "Net Margin %",
          definition: "Final Net Profit ÷ Revenue × 100 (presentation ratio).",
        },
        {
          term: "Contribution %",
          definition: "Brand/Product Final Net Profit ÷ period total Final Net Profit × 100.",
        },
      ],
      warnings: extraWarnings,
      sourceNotes: [
        "All figures are scoped to the selected reporting period only (period-independent).",
        "Financial Summary and ratios identity-map Financial Engine V4 (overview.modelBProfit).",
        "Brand and product intelligence aggregate product-level Model B outputs from dashboard services.",
        "insights.highlights / warnings / opportunities are placeholders for future AI sprints.",
      ],
    },
  });
}

/**
 * Load shared ReportContext once, then compose the Business Report.
 */
export async function buildBusinessReport(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportDocument> {
  const ctx = await loadReportContext(scope, options);
  return buildBusinessReportDocument(ctx);
}
