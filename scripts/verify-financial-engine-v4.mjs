/**
 * Validate Financial Engine V4 — single source of truth across modules.
 * Usage: npx tsx scripts/verify-financial-engine-v4.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { fetchAllRows, fetchAllInDateRange } from "../src/lib/supabase/paginate.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import {
  buildModelBProfitMetrics,
  sumSalesAndMarketplaceFee,
  verifyModelBFinalProfitArithmetic,
} from "../src/lib/financial-engine.ts";
import { buildProductProfitabilityRows } from "../src/lib/product-profitability-builder.ts";
import { calculateOperationalProfit } from "../src/lib/product-operational-metrics.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";
import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "../src/lib/sales-revenue-resolution.ts";
import { calculateEstimatedTax } from "../src/lib/financial-engine-tax.ts";
import {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "../src/lib/wb-settlement.ts";
import { sumSalesApiCommissionMetrics } from "../src/lib/smart-pricing-marketplace-fees.ts";
import { sumCompletedSalesMetrics } from "../src/lib/smart-pricing-commission.ts";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-01";
const to = process.argv[4] ?? "2026-07-19";
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function main() {
  const sb = createAdminClient();
  const products = await fetchAllRows(sb, "products", {marketplaceAccountId:accountId, selectColumns:"*, brand:brands(*), category:categories(*)"});
  const productIds = products.map(p => String(p.id));
  const [sales, finance, ads, orders, costHistory] = await Promise.all([
    fetchAllInDateRange(sb, "wb_sales", {column:"sale_date", from, to, marketplaceAccountId:accountId}),
    fetchAllInDateRange(sb, "wb_finance", {column:"operation_date", from, to, marketplaceAccountId:accountId}),
    fetchAllInDateRange(sb, "wb_ads", {column:"campaign_date", from, to, marketplaceAccountId:accountId}),
    fetchAllInDateRange(sb, "wb_orders", {column:"order_date", from, to, marketplaceAccountId:accountId}),
    fetchAllRows(sb, "product_cost_history", {inFilters:[{column:"product_id", values:productIds}]}),
  ]);
  const latestCost = buildLatestCostByProductId(costHistory, products);
  console.log("Rows validated", JSON.stringify({products:products.length,sales:sales.length,finance:finance.length,ads:ads.length,orders:orders.length}));

  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
  const netSales = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    financeTotals.commission,
    netSales.netSales,
    salesForPay
  );
  const financeNetForPay = sumNetForPayFromFinance(finance);
  const acceptance = sumAcceptanceFromFinance(finance);
  const productCost = computeProductCost(sales, costHistory, latestCost);
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const customerPaid = buildNetFinishedPriceFromDb(sales);

  const account = buildModelBProfitMetrics(netSales, {
    salesForPay,
    financeNetForPay,
    acquiring: categorySummary.ACQUIRING,
    logistics: totalLogistics,
    storage: financeTotals.storage,
    penalties: financeTotals.penalty,
    adjustments: presentation.accountAdjustments,
    acceptance,
    productCost,
    advertising,
    customerPaid,
  });

  const productRows = buildProductProfitabilityRows({
    products: products ?? [],
    orders,
    sales,
    finance,
    ads,
    costHistory,
  });

  const spFees = sumSalesApiCommissionMetrics(sales);
  const spCommission = sumCompletedSalesMetrics(sales);
  const engineFee = sumSalesAndMarketplaceFee(sales);

  const checks = [];

  // Independent raw-row expectations: do not reuse the production rollup
  // helpers under test to calculate both sides of these assertions.
  const sourceSuffix = (row) => row.wb_source_suffix || String(row.source_key ?? "").split(":").at(-1);
  const independentlyObservedRevenue = finance
    .filter((row) => sourceSuffix(row) === "for_pay")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const independentlyObservedCustomerPaid = sales.reduce((sum, row) =>
    sum + (row.is_return ? -1 : 1) * Math.abs(Number(row.revenue ?? 0)) * Number(row.quantity), 0);
  const independentlyObservedNetSales = sales.reduce((sum, row) =>
    sum + (row.is_return ? -1 : 1) * Math.abs(Number(row.price_with_disc ?? 0)) * Number(row.quantity), 0);
  const independentlyObservedForPay = sales.reduce((sum, row) =>
    sum + (row.is_return ? -1 : 1) * Math.abs(Number(row.for_pay ?? 0)) * Number(row.quantity), 0);
  const independentlyExpectedFee = independentlyObservedNetSales - independentlyObservedForPay;
  const independentlyExpectedTax = Math.max(0, independentlyObservedCustomerPaid) * 0.06;

  const add = (name, pass, detail) => {
    checks.push({ name, pass, detail });
  };

  add(
    "Revenue = Finance ppvz_for_pay",
    Math.abs(account.revenue - independentlyObservedRevenue) < 0.02,
    `account=${account.revenue} rawFinance=${independentlyObservedRevenue}`
  );
  add(
    "Sales-to-Settlement Difference = Sales − forPay",
    Math.abs(account.salesToSettlementDifference - independentlyExpectedFee) < 0.02,
    `difference=${account.salesToSettlementDifference} rawSales=${independentlyObservedNetSales} rawForPay=${independentlyObservedForPay}`
  );
  add(
    "Smart Pricing legacy proxy ≡ Sales-to-Settlement Difference",
    Math.abs(spFees.marketplaceFees - engineFee.marketplaceFee) < 0.02 &&
      Math.abs(spCommission.commission - engineFee.marketplaceFee) < 0.02,
    `sp=${spFees.marketplaceFees} eng=${engineFee.marketplaceFee}`
  );
  add(
    "NP arithmetic identity",
    Math.abs(verifyModelBFinalProfitArithmetic(account)) < 0.02,
    `Δ=${verifyModelBFinalProfitArithmetic(account)}`
  );
  add(
    "Product Marketplace Fees are attributed Finance components",
    productRows.reduce((sum, row) => sum + row.marketplaceFees, 0) <=
      presentation.marketplaceFees + 0.02,
    `productAttributed=${productRows.reduce((sum, row) => sum + row.marketplaceFees, 0)} account=${presentation.marketplaceFees}`
  );
  add(
    "Product operationalProfit ≡ finalNetProfit",
    productRows.every(
      (row) => Math.abs(calculateOperationalProfit(row) - row.finalNetProfit) < 0.02
    ),
    "ops path uses V4 Net Profit"
  );
  add(
    "Acquiring not in NP formula",
    Math.abs(
      account.finalNetProfit -
        (account.revenue -
          account.productCost -
          account.logistics -
          account.storage -
          account.acceptance -
          account.penalties -
          account.adjustments -
          account.advertising -
          account.estimatedTax)
    ) < 0.02,
    `np=${account.finalNetProfit}`
  );
  add(
    "Estimated Tax = 6% × Σ finishedPrice",
    Math.abs(account.estimatedTax - independentlyExpectedTax) < 0.02,
    `tax=${account.estimatedTax} rawCustomerPaid=${independentlyObservedCustomerPaid}`
  );
  add(
    "Product Sales readiness matches each raw persisted price",
    productRows.every((row) => {
      const productSales = sales.filter((sale) => String(sale.product_id) === String(row.productId));
      const expected = productSales.length === 0 ? "empty" : productSales.some((sale) =>
        !Number.isFinite(Number(sale.price_with_disc)) || Number(sale.price_with_disc) <= 0
      ) ? "unavailable" : "ready";
      return row.netSalesStatus === expected;
    }),
    `products=${productRows.length}`
  );
  add(
    "Tax not from Seller Payout",
    Math.abs(customerPaid - account.sellerPayout) < 0.02 ||
      Math.abs(account.estimatedTax - account.sellerPayout * 0.06) >= 0.02 ||
      Math.abs(customerPaid) < 0.02,
    `tax=${account.estimatedTax} sellerPayoutTax=${account.sellerPayout * 0.06}`
  );
  add(
    "Per-product Estimated Tax = Tax% × SKU Σ finishedPrice",
    productRows.every((row) => {
      const productSales = sales.filter((s) => String(s.product_id) === String(row.productId));
      const paid = buildNetFinishedPriceFromDb(productSales);
      const expected = calculateEstimatedTax(paid, 6);
      const actual = row.netProfit - row.finalNetProfit;
      return Math.abs(actual - expected) < 0.02;
    }),
    `products=${productRows.length}`
  );

  // Attributed product revenue/fees may not equal account totals (unallocated finance).
  // Identity: each product revenue comes from finance for_pay on attributed rows.
  const productRev = r2(productRows.reduce((s, p) => s + p.revenue, 0));
  add(
    "Product revenue uses Finance for_pay (sum ≤ account)",
    productRev <= r2(account.revenue) + 0.02 || productRows.length === 0,
    `productSum=${productRev} account=${account.revenue}`
  );

  console.log("Financial Engine V4 — Cross-module validation");
  console.log(`Account ${accountId} · ${from} → ${to}\n`);
  let failed = false;
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    console.log(`       ${c.detail}`);
    if (!c.pass) failed = true;
  }
  console.log("");
  console.log(
    JSON.stringify(
      {
        sales: account.netSales,
        salesToSettlementDifference: account.salesToSettlementDifference,
        marketplaceFees: presentation.marketplaceFees,
        acquiring: account.acquiring,
        revenue: account.revenue,
        netProfit: account.finalNetProfit,
        products: productRows.length,
      },
      null,
      2
    )
  );

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
