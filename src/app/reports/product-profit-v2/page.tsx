import { ReportShell } from "@/components/reporting/report-shell";
import { ReportSummaryCards } from "@/components/reporting/report-summary-cards";
import { ReportEmptyState } from "@/components/reporting/report-empty-state";
import { ReportExportMenu } from "@/components/reporting/report-export-menu";
import { ProductProfitReportTable } from "@/components/reporting/product-profit-report-table";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { loadReportContext } from "@/lib/reporting/report-context";
import { getReportDefinition } from "@/lib/reporting/module/report-catalog";
import { parseReportCategory } from "@/lib/reporting/module/report-filters";
import { buildProductProfitReport } from "@/lib/reporting/module/product-profit-report";
import { buildProductProfitExportDocument } from "@/lib/reporting/module/export/build-export-document";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

export default async function ProductProfitReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const report = getReportDefinition("product-profit")!;
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
  const view = buildProductProfitReport({
    products: ctx.products,
    category,
    currency: ctx.tenant.currency,
  });

  const isEmpty = view.rows.length === 0;

  return (
    <ReportShell
      title={report.title}
      description="Financial profitability by SKU — Financial Engine product rows (not Product Analytics)"
      categories={categories}
      selectedCategory={category}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ctx.tenant.companyName} · {ctx.tenant.marketplaceLabel} · {scope.from} →{" "}
          {scope.to}
          {category ? ` · Category: ${category}` : ""}
          {" · "}
          {view.rows.length} SKUs · Source: Financial Engine products
        </p>
        <ReportExportMenu
          reportId="product-profit"
          payload={buildProductProfitExportDocument({
            tenant: ctx.tenant,
            dateFrom: scope.from,
            dateTo: scope.to,
            category,
            source: view.source,
            rows: view.rows,
            summary: view.summary,
          })}
          fileName={`product-profit-${scope.from}-${scope.to}`}
        />
      </div>

      {isEmpty ? (
        <ReportEmptyState />
      ) : (
        <div className="space-y-6">
          <ReportSummaryCards
            lines={view.summary}
            currency={ctx.tenant.currency}
            highlightIds={["netProfit", "netMargin"]}
          />

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Product profitability
            </h2>
            <ProductProfitReportTable rows={view.rows} currency={ctx.tenant.currency} />
          </section>

          <p className="text-xs text-muted-foreground">
            Net Profit and Revenue are Financial Engine Model B outputs. Net Margin % = Net Profit ÷
            Revenue. ROI = Net Profit ÷ Product Cost (when cost &gt; 0). Recommended Price is
            informational only when an existing value is available — this report does not run Smart
            Pricing.{" "}
            <a href={hubHref} className="text-primary hover:underline">
              Reports hub
            </a>
          </p>
        </div>
      )}
    </ReportShell>
  );
}
