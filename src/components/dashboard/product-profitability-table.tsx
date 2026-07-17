import type { ProductProfitability } from "@/types/database";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type ProductProfitabilityTableProps = {
  products: ProductProfitability[];
  isSampleData?: boolean;
};

export function ProductProfitabilityTable({
  products,
  isSampleData,
}: ProductProfitabilityTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Product Profitability</h3>
        <p className="text-sm text-muted-foreground">
          By supplier article (артикул) · {products.length} products
          {isSampleData && " · sample data"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Supplier Article</th>
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-6 py-3 text-right font-medium">Revenue</th>
              <th className="px-6 py-3 text-right font-medium">Net Profit</th>
              <th className="px-6 py-3 text-right font-medium">Marketplace Fees</th>
              <th className="px-6 py-3 text-right font-medium">Ad Cost</th>
              <th className="px-6 py-3 text-right font-medium">Return Rate</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                  No product data available for the selected period
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr
                  key={product.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td className="px-6 py-3.5 font-mono text-xs font-medium text-primary">
                    {product.modelCode}
                  </td>
                  <td className="px-6 py-3.5">{product.productName}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{product.categoryName}</td>
                  <td className="px-6 py-3.5 text-right font-medium">
                    {formatCurrency(product.revenue)}
                  </td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right font-medium",
                      product.netProfit >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    {formatCurrency(product.netProfit)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground">
                    {formatCurrency(product.marketplaceFees)}
                  </td>
                  <td className="px-6 py-3.5 text-right">{formatCurrency(product.advertising)}</td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right",
                      product.returnRate > 10 ? "text-danger" : "text-muted-foreground"
                    )}
                  >
                    {formatPercent(product.returnRate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
