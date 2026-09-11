import Link from "next/link";
import { Suspense } from "react";
import { ReportsHeader } from "@/components/reports/reports-header";
import { ExportWeeklyBusinessExcelButton } from "@/components/reports/export-business-report-button";
import { ReportNav } from "@/components/reporting/report-nav";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { REPORTING_CATALOG } from "@/lib/reporting/module/report-catalog";
import { REPORT_FILTER_PARAMS } from "@/lib/reporting/module/report-filters";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params);
  if (params.category?.trim()) {
    scopeQuery.set(REPORT_FILTER_PARAMS.category, params.category.trim());
  }
  const qs = scopeQuery.toString();
  const hrefWithScope = (href: string) => (qs ? `${href}?${qs}` : href);

  return (
    <>
      <ReportsHeader
        title="Reporting"
        description="Financial and operational reports — powered by the Financial Engine, not a second dashboard"
      />

      <div className="mb-6 space-y-4">
        <Suspense fallback={<div className="h-9 animate-pulse rounded-xl bg-card" />}>
          <ReportNav />
        </Suspense>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Unified Business Excel</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Any selected period (week, month, multi-month, custom): P&amp;L, Settlement,
              Product / Brand / Category, Finance &amp; Sales detail — same Financial Engine
              as Dashboard, with chronological period breakdowns when the range spans
              multiple weeks or months.
            </p>
          </div>
          <Suspense fallback={<div className="h-10 w-44 animate-pulse rounded-xl bg-muted" />}>
            <ExportWeeklyBusinessExcelButton variant="primary" />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTING_CATALOG.map((report) => (
          <Link
            key={report.id}
            href={hrefWithScope(report.href)}
            className={cn(
              "rounded-2xl border border-border bg-card p-5 transition-ui hover:bg-card-hover",
              report.status === "ready" && "border-primary/30"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{report.title}</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  report.status === "ready"
                    ? "bg-primary/12 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {report.status === "ready" ? "Ready" : "Soon"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Legacy document previews remain available:{" "}
        <a href={hrefWithScope("/reports/business")} className="text-primary hover:underline">
          Business
        </a>
        ,{" "}
        <a href={hrefWithScope("/reports/marketplace")} className="text-primary hover:underline">
          Marketplace
        </a>
        ,{" "}
        <a href={hrefWithScope("/reports/product")} className="text-primary hover:underline">
          Product
        </a>
        ,{" "}
        <a
          href={hrefWithScope("/reports/product-profit")}
          className="text-primary hover:underline"
        >
          Product Profit (legacy)
        </a>
        .
      </p>
    </>
  );
}
