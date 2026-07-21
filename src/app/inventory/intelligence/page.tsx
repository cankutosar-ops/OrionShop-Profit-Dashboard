import { Suspense } from "react";
import { InventoryIntelligenceTable } from "@/components/inventory/inventory-intelligence-table";
import { InventoryModuleNav } from "@/components/inventory/inventory-module-nav";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { formatDate } from "@/lib/utils";
import { getInventoryIntelligence } from "@/services/inventory-intelligence-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

function TableFallback() {
  return (
    <div className="space-y-4">
      <div className="h-14 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
    </div>
  );
}

export default async function InventoryIntelligencePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const report = await getInventoryIntelligence(scope);

  return (
    <>
      <PageHeader
        title="Inventory Intelligence"
        description="SKU health command center — which products need attention today"
      />

      <div className="mb-4">
        <Suspense
          fallback={<div className="h-11 animate-pulse rounded-2xl border border-border bg-card" />}
        >
          <InventoryModuleNav />
        </Suspense>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view inventory intelligence.
        </div>
      ) : report.rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          No SKUs with stock, sales, or last-sale history for this scope.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p>
              Period (warehouse distribution):{" "}
              <span className="font-medium text-foreground">
                {formatDate(scope.from)} → {formatDate(scope.to)}
              </span>
              {" · "}
              As of{" "}
              <span className="font-medium text-foreground">{formatDate(report.asOfDate)}</span>
              {" · "}
              {report.rows.length.toLocaleString("ru-RU")} SKUs
              {" · "}
              loaded in {report.loadTimeMs} ms
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
              Stock Health from days since last sale (service) · Total Sales = Σ period orders from
              warehouse distribution · Last Sale Date is all-time MAX(sale_date)
            </p>
          </div>

          <Suspense fallback={<TableFallback />}>
            <InventoryIntelligenceTable
              rows={report.rows}
              thresholds={report.thresholds}
              asOfDate={report.asOfDate}
              rangeFrom={scope.from}
              rangeTo={scope.to}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
