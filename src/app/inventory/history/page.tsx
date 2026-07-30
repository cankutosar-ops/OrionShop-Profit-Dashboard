import { Suspense } from "react";
import { InventoryHistoryWorkspace } from "@/components/inventory/inventory-history-workspace";
import { InventoryModuleNav } from "@/components/inventory/inventory-module-nav";
import { PageHeader } from "@/components/layout/page-header";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { listCompanies } from "@/services/marketplace-account-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function InventoryHistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const configured = getSupabaseEnv().isConfigured;

  let accounts: Array<{ id: string; account_name: string }> = [];
  if (configured) {
    try {
      const companies = await listCompanies();
      const all = companies.flatMap((c) => c.accounts ?? []);
      accounts = filterOperationalMarketplaceAccounts(all).map((a) => ({
        id: String(a.id),
        account_name: a.account_name,
      }));
    } catch {
      accounts = [];
    }
  }

  const initialAccountId =
    scope.marketplaceAccountId &&
    accounts.some((a) => a.id === String(scope.marketplaceAccountId))
      ? String(scope.marketplaceAccountId)
      : accounts[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="Inventory History"
        description="Current Inventory for a past date — same stock rows, selected historical day"
        showFilters={false}
      />

      <div className="mb-4">
        <Suspense
          fallback={<div className="h-11 animate-pulse rounded-2xl border border-border bg-card" />}
        >
          <InventoryModuleNav />
        </Suspense>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view inventory history.
        </div>
      ) : (
        <InventoryHistoryWorkspace
          accounts={accounts}
          initialAccountId={initialAccountId}
        />
      )}
    </>
  );
}
