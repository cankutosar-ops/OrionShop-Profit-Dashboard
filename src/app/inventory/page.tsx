import { Suspense } from "react";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { formatDate } from "@/lib/utils";
import { getInventoryReport } from "@/services/inventory-report-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { product?: string }>;
};

function WorkspaceFallback() {
  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[560px] items-center justify-center rounded-2xl border border-border bg-card">
      <p className="text-sm text-muted-foreground">Loading inventory…</p>
    </div>
  );
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const report = await getInventoryReport(scope);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Operational stock view — which models and SKUs are running low"
      />

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view inventory.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p>
              {report.models.length} models with stock · 30-day sales velocity through{" "}
              <span className="font-medium text-foreground">{formatDate(scope.to)}</span>
              {report.accountLastSync && (
                <>
                  {" · "}
                  Last account sync{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(report.accountLastSync)}
                  </span>
                </>
              )}
            </p>
          </div>

          <Suspense fallback={<WorkspaceFallback />}>
            <InventoryWorkspace
              report={report}
              initialProductId={params.product ?? null}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
