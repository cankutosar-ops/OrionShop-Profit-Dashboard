import { CostManagementManager } from "@/components/costs/cost-management-manager";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { fetchCostManagementRows } from "@/services/cost-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function CostManagementPage({ searchParams }: PageProps) {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return (
      <>
        <PageHeader
          title="Cost Management"
          description="Edit purchase prices inline or bulk update via Excel"
          showFilters={false}
        />
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to manage costs.
        </div>
      </>
    );
  }

  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const rows = await fetchCostManagementRows(scope);

  return (
    <>
      <PageHeader
        title="Cost Management"
        description="Edit purchase prices inline — updates cost history only"
        showFilters={true}
      />
      <CostManagementManager initialRows={rows} />
    </>
  );
}
