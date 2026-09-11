import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import {
  buildProductMarketplaceFeeParts,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "@/lib/finance-rollup";
import {
  attributeProductFinance,
  buildProductLogisticsReconciliation,
  buildPurchaseSridSet,
  calculateNetUnits,
  calculateUnitLogisticsCost,
  stampLogisticsProductIds,
  type ProductLogisticsReconciliation,
} from "@/lib/product-logistics-attribution";
import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import { computeProductCost } from "@/lib/product-cost";
import { calculateModelBNetProfit } from "@/lib/financial-engine";
import { aggregateSalesMetrics } from "@/lib/sales-metrics";
import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "@/lib/sales-revenue-resolution";
import {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "@/lib/wb-settlement";
import { parseWbSourceSuffix } from "@/lib/finance-category";
import type {
  ProductCostHistory,
  ProductProfitability,
  ProductWithRelations,
  WbAd,
  WbFinance,
  WbOrder,
  WbSale,
} from "@/types/database";

function appendMapArray<T>(map: Map<string, T[]>, key: string | null | undefined, value: T): void {
  if (!key) return;
  const list = map.get(String(key));
  if (list) {
    list.push(value);
    return;
  }
  map.set(String(key), [value]);
}

/**
 * Advertising is indexed by product_id only.
 *
 * Indexing by supplier_article as well used to be the fallback for ad rows that
 * had no product_id. It is a cross-account hazard: article strings are only
 * unique per account (`idx_products_account_supplier_article`), so an article
 * match can attribute another account's spend to this product. Ingestion now
 * always resolves product_id against the owning account, and both
 * `fetchAdsInRange` and the wb_ads RLS policy drop unattributed rows, so the
 * fallback can only ever do harm.
 */
function indexAdsByProductId(ads: WbAd[]): Map<string, WbAd[]> {
  const byProductId = new Map<string, WbAd[]>();
  for (const ad of ads) {
    appendMapArray(byProductId, ad.product_id ? String(ad.product_id) : null, ad);
  }
  return byProductId;
}

type BuildProductProfitabilityRowsInput = {
  products: ProductWithRelations[];
  orders: WbOrder[];
  sales: WbSale[];
  finance: WbFinance[];
  ads: WbAd[];
  costHistory: ProductCostHistory[];
};

export type ProductProfitabilityBuildResult = {
  rows: ProductProfitability[];
  logisticsReconciliation: ProductLogisticsReconciliation;
  /** Σ finance for_pay with null product_id (not on any product row). */
  unallocatedRevenue: number;
  /** Σ finance for_pay across the full finance set. */
  accountRevenue: number;
};

function sumForPay(finance: readonly WbFinance[]): number {
  return sumNetForPayFromFinance(finance as WbFinance[]);
}

function sumForPayNullProduct(finance: readonly WbFinance[]): number {
  return finance.reduce((sum, row) => {
    if (row.product_id) return sum;
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix !== "for_pay") return sum;
    return sum + Number(row.amount);
  }, 0);
}

/** Shared pure product profitability builder used by Dashboard and Reports. */
export function buildProductProfitabilityResult(
  input: BuildProductProfitabilityRowsInput
): ProductProfitabilityBuildResult {
  const { products, orders, sales, finance, ads, costHistory } = input;
  const productIds = new Set(products.map((product) => String(product.id)));

  const stamped = stampLogisticsProductIds(finance, sales, products);
  const accountRevenue = sumForPay(finance);
  const unallocatedRevenue = sumForPayNullProduct(finance);

  const scopedOrders = orders.filter((row) => productIds.has(String(row.product_id)));
  const scopedSales = sales.filter((row) => productIds.has(String(row.product_id)));
  // Logistics may gain product_id via SRID/nm_id stamp; other null-product finance stays out.
  const scopedFinance = stamped.finance.filter(
    (row) => row.product_id && productIds.has(String(row.product_id))
  );
  const scopedAds = ads.filter(
    (row) => row.product_id && productIds.has(String(row.product_id))
  );

  const ordersByProductId = new Map<string, WbOrder[]>();
  const salesByProductId = new Map<string, WbSale[]>();
  const financeByProductId = new Map<string, WbFinance[]>();
  for (const row of scopedOrders) appendMapArray(ordersByProductId, String(row.product_id), row);
  for (const row of scopedSales) appendMapArray(salesByProductId, String(row.product_id), row);
  for (const row of scopedFinance)
    appendMapArray(financeByProductId, row.product_id ? String(row.product_id) : null, row);

  const adsByProductId = indexAdsByProductId(scopedAds);
  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);

  const rows = products
    .map((product) => {
      const productId = String(product.id);
      const productOrders = ordersByProductId.get(productId) ?? [];
      const productSales = salesByProductId.get(productId) ?? [];
      const productFinance = financeByProductId.get(productId) ?? [];

      const productAds = adsByProductId.get(productId) ?? [];

      const funnel = buildProductFunnelMetrics(productOrders, productSales);
      const purchaseSrids = buildPurchaseSridSet(productSales);
      const {
        financeForBreakdown,
        purchaseLogisticsRows,
        excludedLogisticsRows,
        excludedLogistics,
      } = attributeProductFinance(productFinance, purchaseSrids);

      const salesMetrics = aggregateSalesMetrics(productSales);
      const netUnits = calculateNetUnits(salesMetrics.unitsSold, salesMetrics.unitsReturned);
      const netSales = buildNetSalesFromDb(productSales);
      const salesForPay = buildNetForPayFromDb(productSales);
      const financeNetForPay = sumNetForPayFromFinance(financeForBreakdown);
      const productCost = computeProductCost(productSales, [], latestCostByProductId);
      const financeTotals = rollupCategoriesToProfitBuckets(financeForBreakdown);
      const categorySummary = summarizeFinanceByCategory(financeForBreakdown);
      const advertising = productAds.reduce((sum, ad) => sum + ad.spend, 0);
      const feeParts = buildProductMarketplaceFeeParts(financeForBreakdown);
      const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
      const unitLogisticsCost = calculateUnitLogisticsCost(financeTotals.logistics, netUnits);
      const modelB = calculateModelBNetProfit({
        grossSales: netSales.grossSales,
        returnedSales: netSales.returnedSales,
        netSales: netSales.netSales,
        netSalesStatus: "ready",
        salesForPay,
        financeNetForPay,
        acquiring: categorySummary.ACQUIRING,
        logistics: totalLogistics,
        storage: financeTotals.storage,
        penalties: financeTotals.penalty,
        adjustments: feeParts.accountAdjustments,
        acceptance: sumAcceptanceFromFinance(financeForBreakdown),
        productCost,
        advertising,
        customerPaid: buildNetFinishedPriceFromDb(productSales),
      });

      return {
        /** Commercial Performance Revenue = Finance ppvz_for_pay (net). */
        revenue: modelB.revenue,
        productCost,
        /** Marketplace Fee = Sales − Sales API forPay (V4 engine). */
        commission: modelB.marketplaceFee ?? modelB.commission,
        logistics: financeTotals.logistics,
        returnLogistics: financeTotals.return_logistics,
        storage: financeTotals.storage,
        advertising,
        penalties: financeTotals.penalty,
        otherExpenses: financeTotals.other + financeTotals.unclassified,
        /** Operating Profit (before tax). */
        netProfit: modelB.netProfit,
        netSales: modelB.netSales,
        finalNetProfit: modelB.finalNetProfit,
        returnRate: salesMetrics.returnRate,
        unitsSold: salesMetrics.unitsSold,
        unitsReturned: salesMetrics.unitsReturned,
        netUnits,
        unitLogisticsCost,
        /** Marketplace Fee (V4) — same as commission; not finance ppvz_* bundle. */
        marketplaceFees: modelB.marketplaceFee ?? modelB.commission,
        accountAdjustments: feeParts.accountAdjustments,
        reimbursements: feeParts.reimbursements,
        productId: String(product.id),
        modelCode: product.supplier_article,
        productName: product.name,
        categoryName: product.category?.name ?? "Uncategorized",
        brandName: product.brand?.name ?? "Unknown",
        orders: funnel.orders,
        purchases: funnel.purchases,
        conversionPercent: funnel.conversionPercent,
        cancelled: funnel.cancelled,
        cancellationPercent: funnel.cancellationPercent,
        purchaseLogistics: financeTotals.logistics,
        excludedLogistics,
        purchaseLogisticsRows,
        excludedLogisticsRows,
      };
    })
    .filter(
      (row) =>
        row.orders > 0 ||
        row.purchases > 0 ||
        row.netSales > 0 ||
        row.revenue > 0 ||
        row.advertising > 0 ||
        row.purchaseLogistics > 0
    )
    .sort((a, b) => b.finalNetProfit - a.finalNetProfit);

  const attributedProductLogistics = rows.reduce(
    (sum, row) => sum + row.purchaseLogistics,
    0
  );

  const logisticsReconciliation = buildProductLogisticsReconciliation({
    accountLogisticsTotal: stamped.accountLogisticsTotal,
    attributedProductLogistics,
    resolvedViaSridAbs: stamped.resolvedViaSridAbs,
    resolvedViaNmIdAbs: stamped.resolvedViaNmIdAbs,
    unresolvedAbs: stamped.unresolvedAbs,
    resolvedViaSridRows: stamped.resolvedViaSridRows,
    resolvedViaNmIdRows: stamped.resolvedViaNmIdRows,
    unresolvedRows: stamped.unresolvedRows,
  });

  return {
    rows,
    logisticsReconciliation,
    unallocatedRevenue,
    accountRevenue,
  };
}

/** Shared pure product profitability builder used by Dashboard and Reports. */
export function buildProductProfitabilityRows(
  input: BuildProductProfitabilityRowsInput
): ProductProfitability[] {
  return buildProductProfitabilityResult(input).rows;
}
