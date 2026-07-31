import { ReportShell } from "@/components/reporting/report-shell";
import { ReportSummaryCards } from "@/components/reporting/report-summary-cards";
import { ReportEmptyState } from "@/components/reporting/report-empty-state";
import { ReportExportMenu } from "@/components/reporting/report-export-menu";
import { GroupPerformanceReportTable } from "@/components/reporting/group-performance-report-table";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { loadReportContext } from "@/lib/reporting/report-context";
import { getReportDefinition } from "@/lib/reporting/module/report-catalog";
import { parseReportCategory } from "@/lib/reporting/module/report-filters";
import {
  buildGroupPerformanceReport,
  type GroupPerformanceDimension,
} from "@/lib/reporting/module/group-performance-report";
import { buildGroupPerformanceExportDocument } from "@/lib/reporting/module/export/build-export-document";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import type { ScopedDateRange } from "@/types/database";
import type { ReportExportFilter } from "@/lib/reporting/module/export/export-document";

type PageParams = PageScopeSearchParamsInput & { category?: string };

export type GroupPerformancePageConfig = {
  reportId: "category-performance" | "brand-performance";
  dimension: GroupPerformanceDimension;
  /** Category Performance: ignore category URL filter (hide selector). */
  ignoreCategoryFilter: boolean;
  /** Brand Performance: ignore global brand scope when loading products. */
  ignoreBrandFilter: boolean;
  description: string;
};

/**
 * Shared Category / Brand Performance page body — one architecture for both reports.
 */
export async function GroupPerformanceReportPage({
  searchParams,
  config,
}: {
  searchParams: Promise<PageParams>;
  config: GroupPerformancePageConfig;
}) {
  const params = await searchParams;
  const report = getReportDefinition(config.reportId)!;
  const resolvedScope = await resolveScopedDateRange(params);
  const category = parseReportCategory(params);
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const hubHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";

  const scope: ScopedDateRange = config.ignoreBrandFilter
    ? { ...resolvedScope, brandId: undefined }
    : resolvedScope;

  const preset = inferPeriodPreset(scope.from, scope.to);
  const ctx = await loadReportContext(scope, {
    skipInventory: true,
    periodPresetLabel: periodPresetLabel(preset),
  });

  const view = buildGroupPerformanceReport({
    products: ctx.products,
    dimension: config.dimension,
    category: config.ignoreCategoryFilter ? undefined : category,
    currency: ctx.tenant.currency,
  });

  // Category report: do not render category selector (ignore selector).
  const categories = config.ignoreCategoryFilter
    ? []
    : ctx.categories.map((c) => ({ id: c.id, name: c.name }));

  const isEmpty = view.rows.length === 0;
  const filterNotes: string[] = [];
  if (config.ignoreCategoryFilter) filterNotes.push("Category selector ignored");
  if (config.ignoreBrandFilter) filterNotes.push("Brand selector ignored");

  const exportFilters: ReportExportFilter[] = [
    { label: "Source", value: view.source },
    { label: "Dimension", value: config.dimension },
  ];
  if (!config.ignoreCategoryFilter && category) {
    exportFilters.push({ label: "Category", value: category });
  }
  for (const note of filterNotes) {
    exportFilters.push({ label: "Filter rule", value: note });
  }

  return (
    <ReportShell
      title={report.title}
      description={config.description}
      categories={categories}
      selectedCategory={config.ignoreCategoryFilter ? undefined : category}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ctx.tenant.companyName} · {ctx.tenant.marketplaceLabel} · {scope.from} →{" "}
          {scope.to}
          {!config.ignoreCategoryFilter && category ? ` · Category: ${category}` : ""}
          {" · "}
          {view.rows.length} {config.dimension === "category" ? "categories" : "brands"}
          {" · "}
          {view.productRowCount} products · Source: Σ Product Profit rows
          {filterNotes.length > 0 ? ` · ${filterNotes.join(" · ")}` : ""}
        </p>
        <ReportExportMenu
          reportId={config.reportId}
          payload={buildGroupPerformanceExportDocument({
            reportId: config.reportId,
            title: report.title,
            dimension: config.dimension,
            tenant: ctx.tenant,
            dateFrom: scope.from,
            dateTo: scope.to,
            filters: exportFilters,
            rows: view.rows,
            summary: view.summary,
          })}
          fileName={`${config.reportId}-${scope.from}-${scope.to}`}
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
              {config.dimension === "category" ? "Category" : "Brand"} profitability
            </h2>
            <GroupPerformanceReportTable
              rows={view.rows}
              dimension={config.dimension}
              currency={ctx.tenant.currency}
            />
          </section>

          <p className="text-xs text-muted-foreground">
            Aggregates Financial Engine product rows only. Totals equal Σ Product Profit for the
            same filter set. Margin % and ROI reuse Product Profit identities (Model B margin;
            Net Profit ÷ Product Cost).{" "}
            <a href={hubHref} className="text-primary hover:underline">
              Reports hub
            </a>
          </p>
        </div>
      )}
    </ReportShell>
  );
}
