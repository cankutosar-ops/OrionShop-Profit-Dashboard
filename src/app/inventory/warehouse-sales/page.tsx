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
        description="Compare warehouse orders and completed purchases"
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
              {report.locations.length} known warehouses
              {" · "}
              {report.sourceOrderCount.toLocaleString("ru-RU")} orders
              {" · "}
              {report.sourceSaleCount.toLocaleString("ru-RU")} completed sales
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
              Orders and completed purchases are separate stages. Units show completed purchases,
              not current stock. Locations without period activity can be hidden below.
            </p>
          </div>

          <Suspense fallback={<TableFallback />}>
            <p className="text-xs text-muted-foreground">
              {report.fbsAttribution.available && report.fbsAttribution.evidenceRows > 0
                ? `FBS source evidence: ${report.fbsAttribution.attributedOrders} orders and ${report.fbsAttribution.attributedSales} completed sales matched. Unmatched rows retain their stored WB location; FBS attribution may be incomplete.`
                : "FBS warehouse attribution is not loaded yet. Generic WB locations do not establish seller-warehouse activity; missing FBS figures are not zero sales."}
            </p>
            <WarehouseSalesAnalyticsTable
              rows={report.rows}
              totals={report.totals}
              drillDownWarehouse={report.drillDownWarehouse}
              products={report.products}
              locations={report.locations}
              rangeFrom={scope.from}
              rangeTo={scope.to}
              marketplaceAccountId={scope.marketplaceAccountId}
              companyId={scope.companyId}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
