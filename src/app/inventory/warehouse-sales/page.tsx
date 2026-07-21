import { Suspense } from "react";
import { InventoryModuleNav } from "@/components/inventory/inventory-module-nav";
import { WarehouseSalesAnalyticsTable } from "@/components/inventory/warehouse-sales-analytics-table";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { formatDate } from "@/lib/utils";
import { getWarehouseSalesAnalytics } from "@/services/warehouse-sales-analytics-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { warehouse?: string }>;
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

export default async function WarehouseSalesAnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const report = await getWarehouseSalesAnalytics(scope, {
    warehouse: params.warehouse ?? null,
  });

  return (
    <>
      <PageHeader
        title="Warehouse Sales Analytics"
        description="Completed sales by fulfilling warehouse — from wb_sales only"
      />

      <div className="mb-4">
        <Suspense fallback={<div className="h-11 animate-pulse rounded-2xl border border-border bg-card" />}>
          <InventoryModuleNav />
        </Suspense>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view warehouse sales.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p>
              Period:{" "}
              <span className="font-medium text-foreground">
                {formatDate(scope.from)} → {formatDate(scope.to)}
              </span>
              {" · "}
              {report.rows.length} warehouses
              {" · "}
              {report.sourceRowCount.toLocaleString("ru-RU")} completed sales with warehouse
              {" · "}
              loaded in {report.loadTimeMs} ms
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
              Metrics from wb_sales.warehouse · NULL warehouses excluded · Revenue = Σ price_with_disc
              · Order Share = warehouse orders ÷ total orders
            </p>
          </div>

          <Suspense fallback={<TableFallback />}>
            <WarehouseSalesAnalyticsTable
              rows={report.rows}
              totals={report.totals}
              drillDownWarehouse={report.drillDownWarehouse}
              products={report.products}
              rangeFrom={scope.from}
              rangeTo={scope.to}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
