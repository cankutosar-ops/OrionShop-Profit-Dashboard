import { Suspense } from "react";
import { InventoryModuleNav } from "@/components/inventory/inventory-module-nav";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getInventoryReport } from "@/services/inventory-report-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { product?: string }>;
};

function WorkspaceFallback() {
  return (
    <div className="space-y-4">
      <div className="h-14 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-12 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="flex h-[calc(100vh-14rem)] min-h-[560px] items-center justify-center rounded-2xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">Loading inventory…</p>
      </div>
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
        description="Current operational stock — models and SKUs that need attention"
        showFilters={false}
      />

      <div className="mb-4">
        <Suspense fallback={<div className="h-11 animate-pulse rounded-2xl border border-border bg-card" />}>
          <InventoryModuleNav />
        </Suspense>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view inventory.
        </div>
      ) : (
        <Suspense fallback={<WorkspaceFallback />}>
          <InventoryWorkspace
            report={report}
            initialProductId={params.product ?? null}
          />
        </Suspense>
      )}
    </>
  );
}
