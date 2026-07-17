import { rollupCategoriesToProfitBuckets } from "@/lib/finance-rollup";
import { computeProductCost } from "@/lib/product-cost";
import { aggregateSalesMetrics } from "@/lib/sales-metrics";
import type { ProductCostHistory, WbAd, WbFinance, WbSale } from "@/types/database";

/** Rolls up sales, finance, ads, and cost inputs for Model B/C engines (not a profit engine). */
export function assembleFinancialComponents(params: {
  sales: WbSale[];
  finance: WbFinance[];
  ads: WbAd[];
  costHistory: ProductCostHistory[];
  latestCostByProductId?: Map<string, number>;
}) {
  const salesMetrics = aggregateSalesMetrics(params.sales);
  const productCost = computeProductCost(
    params.sales,
    params.costHistory,
    params.latestCostByProductId
  );
  const financeTotals = rollupCategoriesToProfitBuckets(params.finance);
  const advertising = params.ads.reduce((sum, ad) => sum + ad.spend, 0);

  return {
    ...salesMetrics,
    productCost,
    commission: financeTotals.commission,
    logistics: financeTotals.logistics,
    returnLogistics: financeTotals.return_logistics,
    storage: financeTotals.storage,
    penalties: financeTotals.penalty,
    otherExpenses: financeTotals.other + financeTotals.unclassified,
    advertising,
    financeTotals,
  };
}
