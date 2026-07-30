import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseLinesTable } from "@/components/purchases/purchase-lines-table";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { scopeParamsToSearchParams, type PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { fetchPurchaseById } from "@/services/purchase-service";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function PurchaseDetailPage({ params, searchParams }: PageProps) {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return (
      <>
        <PageHeader title="Purchase" description="Purchase record details" showFilters={false} />
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view purchases.
        </div>
      </>
    );
  }

  const { id } = await params;
  const scopeParams = await searchParams;
  const scope = await resolveScopedDateRange(scopeParams);
  const purchase = await fetchPurchaseById(id, scope.marketplaceAccountId);

  if (!purchase) {
    notFound();
  }

  const scopeQuery = scopeParamsToSearchParams(scopeParams);
  const backHref = scopeQuery.size > 0 ? `/purchases?${scopeQuery}` : "/purchases";

  return (
    <>
      <PageHeader
        title={`Purchase · ${formatDate(purchase.purchase_date)}`}
        description={purchase.supplier || "Purchase record"}
        showFilters={true}
      />

      <div className="space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to purchases
        </Link>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Purchase Date</p>
            <p className="mt-1 font-medium">{formatDate(purchase.purchase_date)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Supplier</p>
            <p className="mt-1 font-medium">{purchase.supplier || "—"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Currency</p>
            <p className="mt-1 font-medium">{purchase.currency}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Exchange Rate</p>
            <p className="mt-1 font-medium">{purchase.exchange_rate ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Product Lines</p>
            <p className="mt-1 font-medium">{formatNumber(purchase.line_count)}</p>
          </div>
        </div>

        {purchase.notes && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm">{purchase.notes}</p>
          </div>
        )}

        <PurchaseLinesTable lines={purchase.lines} currency={purchase.currency} />
      </div>
    </>
  );
}
