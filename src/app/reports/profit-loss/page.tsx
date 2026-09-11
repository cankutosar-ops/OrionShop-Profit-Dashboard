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
  pnlPeriodRowFromModelB,
  type PnLLine,
  type PnLPeriodBreakdownRow,
} from "@/lib/reporting/module/pnl-report";
import { parseReportCategory } from "@/lib/reporting/module/report-filters";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import { buildPnLExportDocument } from "@/lib/reporting/module/export/build-export-document";
import { buildPeriodChunks } from "@/lib/reporting/weekly-business/period-chunks";
import type { ScopedDateRange } from "@/types/database";

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

function periodColumns(currency: string) {
  const money = (key: keyof PnLPeriodBreakdownRow, header: string) => ({
    key,
    header,
    align: "right" as const,
    cell: (row: PnLPeriodBreakdownRow) =>
      formatKpiCurrency(Number(row[key]) || 0, currency),
  });
  return [
    {
      key: "label",
      header: "Period",
      align: "left" as const,
      cell: (row: PnLPeriodBreakdownRow) => (
        <span className="font-medium">
          {row.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.from} → {row.to}
          </span>
        </span>
      ),
    },
    money("grossSales", "Gross Sales"),
    money("returnedSales", "Returns"),
    money("netSales", "Net Sales"),
    money("revenue", "Revenue"),
    money("marketplaceFees", "Fees"),
    money("logistics", "Logistics"),
    money("storage", "Storage"),
    money("productCost", "Product Cost"),
    money("netProfit", "Net Profit"),
  ];
}

async function loadPeriodBreakdown(
  parentScope: ScopedDateRange,
  periodPresetLabelValue: string | undefined,
  category: string | null
): Promise<{ kind: "week" | "month" | "none"; rows: PnLPeriodBreakdownRow[] }> {
  if (category) {
    // Category filter uses product aggregation — skip account-level period chunks.
    return { kind: "none", rows: [] };
  }
  const chunks = buildPeriodChunks(parentScope);
  if (chunks.length === 0) return { kind: "none", rows: [] };

  const rows: PnLPeriodBreakdownRow[] = [];
  for (const chunk of chunks) {
    const subScope: ScopedDateRange = {
      ...parentScope,
      from: chunk.from,
      to: chunk.to,
    };
    const sub = await loadReportContext(subScope, {
      skipInventory: true,
      periodPresetLabel: periodPresetLabelValue,
    });
    rows.push(pnlPeriodRowFromModelB(chunk.label, chunk.from, chunk.to, sub.financialEngine));
  }

  const kind = chunks[0]?.kind === "week" ? "week" : "month";
  return { kind, rows };
}

export default async function ProfitLossReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const category = parseReportCategory(params);
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const hubHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";

  const preset = inferPeriodPreset(scope.from, scope.to);
  const presetLabel = periodPresetLabel(preset);
  const ctx = await loadReportContext(scope, {
    skipInventory: true,
    periodPresetLabel: presetLabel,
  });

  const categories = ctx.categories.map((c) => ({ id: c.id, name: c.name }));
  const filteredProducts = filterProductsByCategory(ctx.products, category);

  const pnl = category
    ? buildPnLFromProductRows(filteredProducts, ctx.tenant.currency)
    : buildPnLFromModelB(ctx.financialEngine, ctx.tenant.currency);

  const period = await loadPeriodBreakdown(scope, presetLabel, category ?? null);

  const isEmpty =
    pnl.lines.every((l) => (l.isPercent ? false : l.amount === 0)) &&
    ctx.products.length === 0;

  const summaryLines = pnl.lines.filter((l) =>
    ["netSales", "revenue", "marketplaceFees", "operatingProfit", "netProfit", "netMargin"].includes(
      l.id
    )
  );

  const periodTotal: PnLPeriodBreakdownRow | null =
    period.rows.length > 0
      ? {
          label: "TOTAL",
          from: scope.from,
          to: scope.to,
          grossSales: period.rows.reduce((s, r) => s + r.grossSales, 0),
          returnedSales: period.rows.reduce((s, r) => s + r.returnedSales, 0),
          netSales: period.rows.reduce((s, r) => s + r.netSales, 0),
          revenue: period.rows.reduce((s, r) => s + r.revenue, 0),
          marketplaceFees: period.rows.reduce((s, r) => s + r.marketplaceFees, 0),
          logistics: period.rows.reduce((s, r) => s + r.logistics, 0),
          storage: period.rows.reduce((s, r) => s + r.storage, 0),
          productCost: period.rows.reduce((s, r) => s + r.productCost, 0),
          estimatedTax: period.rows.reduce((s, r) => s + r.estimatedTax, 0),
          netProfit: period.rows.reduce((s, r) => s + r.netProfit, 0),
        }
      : null;

  const periodRows =
    periodTotal != null ? [...period.rows, periodTotal] : period.rows;

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

          {period.kind !== "none" && periodRows.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {period.kind === "week" ? "Weekly breakdown" : "Monthly breakdown"}
              </h2>
              <ReportDataTable
                columns={periodColumns(ctx.tenant.currency)}
                rows={periodRows}
                rowKey={(row) => `${row.label}:${row.from}:${row.to}`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Period rows use the same Financial Engine for each sub-range. TOTAL is the
                sum of period rows (may differ slightly from account totals when
                settlement timing crosses week boundaries).
              </p>
            </section>
          )}

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
