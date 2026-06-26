import { CostsManager } from "@/components/costs/costs-manager";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { fetchCostRecords, fetchProductOptions } from "@/services/cost-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; company?: string; account?: string }>;
};

export default async function CostsPage({ searchParams }: PageProps) {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return (
      <>
        <PageHeader
          title="Costs"
          description="Active product costs from cost history (latest row per product)"
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
  const [costs, products] = await Promise.all([
    fetchCostRecords(scope.marketplaceAccountId),
    fetchProductOptions(scope.marketplaceAccountId),
  ]);

  return (
    <>
      <PageHeader
        title="Costs"
        description="Active product costs from cost history (latest row per product)"
        showFilters={true}
      />
      <CostsManager costs={costs} products={products} />
    </>
  );
}
