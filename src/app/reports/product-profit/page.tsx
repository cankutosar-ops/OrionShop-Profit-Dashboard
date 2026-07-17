import { ProductProfitReportTable } from "@/components/reports/product-profit-report-table";
import { ReportsHeader } from "@/components/reports/reports-header";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { formatDate } from "@/lib/utils";
import { getProductProfitReport } from "@/services/reports-product-profit-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductProfitReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const report = await getProductProfitReport(scope);

  return (
    <>
      <ReportsHeader
        title="Product Profit Report"
        description="Historical financial profitability by product for the selected scope"
      />

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to `.env.local` to view product profitability
          reporting.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatDate(scope.from)} → {formatDate(scope.to)}
            </span>
            {" · "}
            {report.rows.length} products
          </div>
          <ProductProfitReportTable rows={report.rows} />
        </div>
      )}
    </>
  );
}
