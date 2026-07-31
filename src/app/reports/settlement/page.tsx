import { ReportShell } from "@/components/reporting/report-shell";
import { ReportSummaryCards } from "@/components/reporting/report-summary-cards";
import { ReportDataTable } from "@/components/reporting/report-data-table";
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
  buildSettlementReport,
  type SettlementLine,
} from "@/lib/reporting/module/settlement-report";
import { inferPeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import { buildSettlementExportDocument } from "@/lib/reporting/module/export/build-export-document";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

const SECTION_LABELS: Record<SettlementLine["section"], string> = {
  sales: "Sales",
  wb: "Wildberries Settlement",
  costs: "Operational Costs",
  result: "Final Result",
};

function settlementColumns(currency: string) {
  return [
    {
      key: "section",
      header: "Section",
      align: "left" as const,
      cell: (row: SettlementLine) => (
        <span className="text-muted-foreground">{SECTION_LABELS[row.section]}</span>
      ),
    },
    {
      key: "label",
      header: "Line",
      align: "left" as const,
      cell: (row: SettlementLine) => (
        <span className={row.isTotal ? "font-semibold" : undefined}>{row.label}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      sortable: true,
      sortValue: (row: SettlementLine) => row.amount,
      cell: (row: SettlementLine) => (
        <span className={row.isTotal ? "font-semibold tabular-nums" : "tabular-nums"}>
          {formatKpiCurrency(row.amount, currency)}
        </span>
      ),
    },
  ];
}

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
      title={report.title}
      description="Money flow between Wildberries and the seller — Financial Engine settlement presentation"
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
          })}
          fileName={`settlement-${scope.from}-${scope.to}`}
        />
      </div>

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
            <ReportDataTable
              columns={settlementColumns(ctx.tenant.currency)}
              rows={settlement.lines}
              rowKey={(row) => row.id}
            />
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
            . Marketplace Fees are informational (Sales − Sales API forPay) and are not
            subtracted again in Net Transfer.{" "}
            <a href={hubHref} className="text-primary hover:underline">
              Reports hub
            </a>
          </p>
        </div>
      )}
    </ReportShell>
  );
}
