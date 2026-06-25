import { ProductProfitabilityAuditTable } from "@/components/audit/product-profitability-audit-table";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate, parseDateRange } from "@/lib/utils";
import { getProductProfitabilityAudit } from "@/services/product-profitability-audit-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function ProductProfitabilityAuditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = parseDateRange(params.from, params.to);
  const report = await getProductProfitabilityAudit(range, 20);

  return (
    <>
      <PageHeader
        title="Product Profitability Audit"
        description="Validate per-product metrics before Product Analytics"
      />

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to run the audit.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground">
            <p>
              Period:{" "}
              <span className="font-medium text-foreground">
                {formatDate(range.from)} → {formatDate(range.to)}
              </span>
              {" · "}
              {report.productCount} products with revenue · top 20 shown
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1">
              <li>Revenue & quantity — wb_sales (non-returns), grouped by product_id</li>
              <li>Commission, logistics, return logistics, deductions — wb_finance by product_id</li>
              <li>Product cost — latest active cost × quantity sold</li>
              <li>Gross profit — revenue − product cost · Margin % — gross profit ÷ revenue</li>
              <li>
                Net profit — existing dashboard formula (also deducts storage, penalties,
                advertising)
              </li>
            </ul>
          </div>

          <ProductProfitabilityAuditTable rows={report.rows} totals={report.totals} />
        </div>
      )}
    </>
  );
}
