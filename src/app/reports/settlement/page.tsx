import { ReportShell } from "@/components/reporting/report-shell";
import { ReportSummaryCards } from "@/components/reporting/report-summary-cards";
import { SettlementLinesTable } from "@/components/reporting/financial-detail-tables";
import { ReportEmptyState } from "@/components/reporting/report-empty-state";
import { ReportExportMenu } from "@/components/reporting/report-export-menu";
import { formatKpiCurrency } from "@/lib/kpi-format";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { loadReportContext } from "@/lib/reporting/report-context";
import { getReportDefinition } from "@/lib/reporting/module/report-catalog";
import { parseReportCategory } from "@/lib/reporting/module/report-filters";
import {
  CATEGORY_SETTLEMENT_LEGACY_TITLE,
  buildSettlementReport,
} from "@/lib/reporting/module/settlement-report";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import { buildSettlementExportDocument } from "@/lib/reporting/module/export/build-export-document";
import { MarketplaceFeeStatusNotice } from "@/components/reporting/marketplace-fee-status-notice";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

export default async function SettlementReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const report = getReportDefinition("settlement")!;
  const scope = await resolveScopedDateRange(params);
  const category = parseReportCategory(params);
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const hubHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";

  const preset = inferPeriodPreset(scope.from, scope.to);
  const ctx = await loadReportContext(scope, {
    skipInventory: true,
    periodPresetLabel: periodPresetLabel(preset),
  });

  const categories = ctx.categories.map((c) => ({ id: c.id, name: c.name }));
  const settlement = buildSettlementReport({
    fe: ctx.financialEngine,
    overview: ctx.overview,
    products: ctx.products,
    category,
    currency: ctx.tenant.currency,
  });

  const isEmpty =
    settlement.lines.every((l) => l.amount === 0) && ctx.products.length === 0;

  const summaryLines = settlement.lines.filter((l) =>
    ["grossSales", "netSales", "revenue", "netTransfer"].includes(l.id)
  );

  return (
    <ReportShell
      title={category ? CATEGORY_SETTLEMENT_LEGACY_TITLE : report.title}
      description={category
        ? "Legacy category-level Net Transfer projection from product rows"
        : "Money flow between Wildberries and the seller — Financial Engine settlement presentation"}
      categories={categories}
      selectedCategory={category}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ctx.tenant.companyName} · {ctx.tenant.marketplaceLabel} · {scope.from} →{" "}
          {scope.to}
          {category ? ` · Category: ${category}` : ""}
          {settlement.source === "financialEngine.modelB"
            ? " · Source: Financial Engine (sellerPayout)"
            : " · Source: product rows (category filter)"}
        </p>
        <ReportExportMenu
          reportId="settlement"
          payload={buildSettlementExportDocument({
            tenant: ctx.tenant,
            dateFrom: scope.from,
            dateTo: scope.to,
            category,
            source: settlement.source,
            lines: settlement.lines,
            summaryLines,
            netSalesStatus: settlement.netSalesStatus,
            marketplaceFeeStatus: settlement.marketplaceFeeStatus,
          })}
          fileName={`${category ? "category-settlement-legacy" : "settlement"}-${scope.from}-${scope.to}`}
        />
      </div>

      {settlement.netSalesStatus !== "ready" && (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 p-3 text-sm">
          Sales coverage: {settlement.netSalesStatus}. Net Sales shows observed values only; Marketplace Fees uses stored Finance evidence.
        </p>
      )}
      <MarketplaceFeeStatusNotice status={settlement.marketplaceFeeStatus} />
      {category && (
        <p role="note" className="mb-4 rounded-lg border border-amber-500/40 p-3 text-sm">
          Category Settlement (Legacy) uses the product Other Expenses finance rollup. Account Settlement uses canonical account-level Adjustments. These accounting classifications are different and the two transfers are not guaranteed to reconcile. No account-level adjustment is attributed to a category here.
        </p>
      )}

      {isEmpty ? (
        <ReportEmptyState />
      ) : (
        <div className="space-y-6">
          <ReportSummaryCards
            lines={summaryLines}
            currency={ctx.tenant.currency}
            highlightIds={["netTransfer"]}
          />

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Settlement detail
            </h2>
            <SettlementLinesTable rows={settlement.lines} currency={ctx.tenant.currency} />
          </section>

          <p className="text-xs text-muted-foreground">
            Net Transfer (primary):{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatKpiCurrency(settlement.netTransfer, ctx.tenant.currency)}
            </span>
            {!category && (
              <>
                {" "}
                (Engine sellerPayout:{" "}
                {formatKpiCurrency(ctx.financialEngine.sellerPayout, ctx.tenant.currency)})
              </>
            )}
            . Marketplace Fees is an informational Finance component total and is not
            subtracted again in Net Transfer. Sales-to-Settlement Difference remains a separate reconciliation metric.{" "}
            <a href={hubHref} className="text-primary hover:underline">
              Reports hub
            </a>
          </p>
        </div>
      )}
    </ReportShell>
  );
}
