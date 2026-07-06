import { PurchasesManager } from "@/components/purchases/purchases-manager";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { fetchProductOptions } from "@/services/cost-service";
import { fetchPurchases } from "@/services/purchase-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function PurchasesPage({ searchParams }: PageProps) {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return (
      <>
        <PageHeader
          title="Purchases"
          description="Purchase history and cost imports — not inventory"
          showFilters={false}
        />
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to manage purchases.
        </div>
      </>
    );
  }

  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const [purchases, products] = await Promise.all([
    fetchPurchases(scope.marketplaceAccountId),
    fetchProductOptions(scope.marketplaceAccountId),
  ]);

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Purchase history and cost imports — not inventory"
        showFilters={true}
      />
      <PurchasesManager purchases={purchases} productCount={products.length} />
    </>
  );
}
