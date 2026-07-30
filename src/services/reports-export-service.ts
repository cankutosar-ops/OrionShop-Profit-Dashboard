import type { FinanceCategory } from "@/lib/finance-category";
import type { FinanceCategoryReport } from "@/services/reports-query-service";

export type FinanceCategoryExportRow = {
  category: FinanceCategory;
  amount: number;
};

/**
 * Read-only export formatting for Reports Center.
 * No calculations — formats output from reports-query-service.
 */
export function formatFinanceCategoryCsv(report: FinanceCategoryReport): string {
  const header = ["category", "amount"].join(",");
  const rows = Object.entries(report.categories).map(([category, amount]) =>
    [category, amount.toFixed(2)].join(",")
  );
  return [header, ...rows].join("\n");
}

export function formatFinanceCategoryJson(report: FinanceCategoryReport): string {
  const rows: FinanceCategoryExportRow[] = Object.entries(report.categories).map(
    ([category, amount]) => ({
      category: category as FinanceCategory,
      amount,
    })
  );

  return JSON.stringify(
    {
      scope: report.scope,
      categories: rows,
      sales: report.modelBProfit.netSales,
      marketplaceFee: report.modelBProfit.marketplaceFee ?? report.modelBProfit.commission,
      revenue: report.modelBProfit.revenue,
      operatingProfit: report.modelBProfit.operatingProfit,
      netProfit: report.modelBProfit.finalNetProfit,
    },
    null,
    2
  );
}
