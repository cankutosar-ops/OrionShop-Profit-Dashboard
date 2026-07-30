import {
  calculateDeductions,
  calculateGrossMarginPercent,
  calculateGrossProfitFromRow,
} from "@/lib/profit-margin";
import type { ProductProfitability, ProductProfitabilityAuditRow } from "@/types/database";

export function toProductProfitabilityAuditRow(
  product: ProductProfitability
): ProductProfitabilityAuditRow {
  const grossProfit = calculateGrossProfitFromRow(product);
  const marginPercent = calculateGrossMarginPercent(product.revenue, grossProfit);

  return {
    productId: product.productId,
    supplierArticle: product.modelCode,
    productName: product.productName,
    revenue: product.revenue,
    quantitySold: product.unitsSold,
    commission: product.commission,
    logistics: product.logistics,
    returnLogistics: product.returnLogistics,
    deductions: calculateDeductions(product.otherExpenses),
    productCost: product.productCost,
    grossProfit,
    netProfit: product.finalNetProfit,
    marginPercent,
  };
}

export function buildProductProfitabilityAuditRows(
  products: ProductProfitability[],
  limit = 20
): ProductProfitabilityAuditRow[] {
  return products
    .filter((product) => product.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map(toProductProfitabilityAuditRow);
}

export function sumProductProfitabilityAuditRows(
  rows: ProductProfitabilityAuditRow[]
): ProductProfitabilityAuditRow {
  const totals = rows.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.quantitySold += row.quantitySold;
      acc.commission += row.commission;
      acc.logistics += row.logistics;
      acc.returnLogistics += row.returnLogistics;
      acc.deductions += row.deductions;
      acc.productCost += row.productCost;
      acc.grossProfit += row.grossProfit;
      acc.netProfit += row.netProfit;
      return acc;
    },
    {
      revenue: 0,
      quantitySold: 0,
      commission: 0,
      logistics: 0,
      returnLogistics: 0,
      deductions: 0,
      productCost: 0,
      grossProfit: 0,
      netProfit: 0,
    }
  );

  return {
    productId: "totals",
    supplierArticle: "—",
    productName: `Top ${rows.length} total`,
    ...totals,
    marginPercent: calculateGrossMarginPercent(totals.revenue, totals.grossProfit),
  };
}
