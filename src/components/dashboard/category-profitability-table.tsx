import type { CategoryProfitability } from "@/types/database";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type CategoryProfitabilityTableProps = {
  categories: CategoryProfitability[];
  isSampleData?: boolean;
};

export function CategoryProfitabilityTable({
  categories,
  isSampleData,
}: CategoryProfitabilityTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Category Profitability</h3>
        <p className="text-sm text-muted-foreground">
          {categories.length} categories
          {isSampleData && " · sample data"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-6 py-3 text-right font-medium">Products</th>
              <th className="px-6 py-3 text-right font-medium">Revenue</th>
              <th className="px-6 py-3 text-right font-medium">Net Profit</th>
              <th className="px-6 py-3 text-right font-medium">Margin</th>
              <th className="px-6 py-3 text-right font-medium">Return Rate</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No category data available for the selected period
                </td>
              </tr>
            ) : (
              categories.map((category) => {
                const margin =
                  category.revenue > 0 ? (category.netProfit / category.revenue) * 100 : 0;

                return (
                  <tr
                    key={category.categoryId}
                    className="border-b border-border/50 transition-colors hover:bg-card-hover"
                  >
                    <td className="px-6 py-3.5 font-medium">{category.categoryName}</td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {category.productCount}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium">
                      {formatCurrency(category.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right font-medium",
                        category.netProfit >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatCurrency(category.netProfit)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right",
                        margin >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatPercent(margin)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {formatPercent(category.returnRate)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
