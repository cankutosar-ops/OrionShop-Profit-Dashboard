import { CostsManager } from "@/components/costs/costs-manager";
import { PageHeader } from "@/components/layout/page-header";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { fetchCostRecords, fetchProductOptions } from "@/services/cost-service";

export default async function CostsPage() {
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

  const [costs, products] = await Promise.all([fetchCostRecords(), fetchProductOptions()]);

  return (
    <>
      <PageHeader
        title="Costs"
        description="Active product costs from cost history (latest row per product)"
        showFilters={false}
      />
      <CostsManager costs={costs} products={products} />
    </>
  );
}
