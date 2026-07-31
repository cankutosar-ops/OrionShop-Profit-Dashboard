import { ReportShell } from "@/components/reporting/report-shell";
import { ReportSummaryCards } from "@/components/reporting/report-summary-cards";
import { ReportDataTable } from "@/components/reporting/report-data-table";
import { ReportEmptyState } from "@/components/reporting/report-empty-state";
import { ReportExportMenu } from "@/components/reporting/report-export-menu";
import { formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { loadReportContext } from "@/lib/reporting/report-context";
import {
  buildPnLFromModelB,
  buildPnLFromProductRows,
  filterProductsByCategory,
  type PnLLine,
} from "@/lib/reporting/module/pnl-report";
import { parseReportCategory } from "@/lib/reporting/module/report-filters";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import { buildPnLExportDocument } from "@/lib/reporting/module/export/build-export-document";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

function pnlColumns(currency: string) {
  return [
    {
      key: "label",
      header: "Line",
      align: "left" as const,
      cell: (row: PnLLine) => (
        <span className={row.isTotal ? "font-semibold" : undefined}>{row.label}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      sortable: true,
      sortValue: (row: PnLLine) => row.amount,
      cell: (row: PnLLine) =>
        row.isPercent
          ? formatKpiPercent(row.amount)
          : formatKpiCurrency(row.amount, currency),
    },
  ];
}

export default async function ProfitLossReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
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
  const filteredProducts = filterProductsByCategory(ctx.products, category);

  const pnl = category
    ? buildPnLFromProductRows(filteredProducts, ctx.tenant.currency)
    : buildPnLFromModelB(ctx.financialEngine, ctx.tenant.currency);

  const isEmpty =
    pnl.lines.every((l) => (l.isPercent ? false : l.amount === 0)) &&
    ctx.products.length === 0;

  const summaryLines = pnl.lines.filter((l) =>
    ["netSales", "revenue", "marketplaceFees", "netProfit", "netMargin"].includes(l.id)
  );

  return (
    <ReportShell
      title="Profit & Loss"
      description="Financial Engine V4 — same Net Profit as Dashboard Commercial Performance"
      categories={categories}
      selectedCategory={category}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ctx.tenant.companyName} · {ctx.tenant.marketplaceLabel} ·{" "}
          {scope.from} → {scope.to}
          {category ? ` · Category: ${category}` : ""}
          {pnl.source === "financialEngine.modelB"
            ? " · Source: Financial Engine"
            : " · Source: product rows (category filter)"}
        </p>
        <ReportExportMenu
          reportId="profit-loss"
          payload={buildPnLExportDocument({
            tenant: ctx.tenant,
            dateFrom: scope.from,
            dateTo: scope.to,
            category,
            source: pnl.source,
            lines: pnl.lines,
            summaryLines,
          })}
          fileName={`pnl-${scope.from}-${scope.to}`}
        />
      </div>

      {isEmpty ? (
        <ReportEmptyState />
      ) : (
        <div className="space-y-6">
          <ReportSummaryCards lines={summaryLines} currency={ctx.tenant.currency} />

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              P&amp;L detail
            </h2>
            <ReportDataTable
              columns={pnlColumns(ctx.tenant.currency)}
              rows={pnl.lines}
              rowKey={(row) => row.id}
            />
          </section>

          <p className="text-xs text-muted-foreground">
            Net Profit identity:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatKpiCurrency(pnl.netProfit, ctx.tenant.currency)}
            </span>
            {!category && (
              <>
                {" "}
                (Dashboard engine:{" "}
                {formatKpiCurrency(ctx.financialEngine.finalNetProfit, ctx.tenant.currency)})
              </>
            )}
            .{" "}
            <a href={hubHref} className="text-primary hover:underline">
              Reports hub
            </a>
          </p>
        </div>
      )}
    </ReportShell>
  );
}
