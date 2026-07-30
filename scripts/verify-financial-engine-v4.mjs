/**
 * Validate Financial Engine V4 — single source of truth across modules.
 * Usage: npx tsx scripts/verify-financial-engine-v4.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import {
  buildModelBProfitMetrics,
  marketplaceFeeFromSales,
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
  const { data: products, error } = await sb
    .from("products")
    .select("*, brand:brands(*), category:categories(*)")
    .eq("marketplace_account_id", accountId);
  if (error) throw error;

  const productIds = (products ?? []).map((p) => String(p.id));
  const articles = (products ?? []).map((p) => p.supplier_article);

  const [salesRes, financeRes, adsRes, ordersRes, costRes] = await Promise.all([
    sb
      .from("wb_sales")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    sb
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to),
    sb.from("wb_ads").select("*").gte("campaign_date", from).lte("campaign_date", to),
    sb
      .from("wb_orders")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("order_date", from)
      .lte("order_date", to),
    sb.from("product_cost_history").select("*"),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (financeRes.error) throw financeRes.error;

  const sales = salesRes.data ?? [];
  const finance = financeRes.data ?? [];
  const ads = (adsRes.data ?? []).filter(
    (row) =>
      (row.product_id && productIds.includes(String(row.product_id))) ||
      (row.supplier_article && articles.includes(row.supplier_article))
  );
  const orders = ordersRes.data ?? [];
  const costHistory = costRes.data ?? [];
  const latestCost = buildLatestCostByProductId(costHistory, products ?? []);

  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    financeTotals.commission
  );
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
  const netSales = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);
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

  const add = (name, pass, detail) => {
    checks.push({ name, pass, detail });
  };

  add(
    "Revenue = Finance ppvz_for_pay",
    Math.abs(account.revenue - financeNetForPay) < 0.02,
    `account=${account.revenue} finance=${financeNetForPay}`
  );
  add(
    "Marketplace Fee = Sales − forPay",
    Math.abs(account.commission - marketplaceFeeFromSales(netSales.netSales, salesForPay)) <
      0.02,
    `fee=${account.commission}`
  );
  add(
    "Smart Pricing fee ≡ engine fee",
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
    "Product marketplaceFees ≡ engine fee (per SKU)",
    productRows.every(
      (row) => Math.abs(row.marketplaceFees - row.commission) < 0.02
    ),
    `products=${productRows.length}`
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
    Math.abs(account.estimatedTax - calculateEstimatedTax(customerPaid, 6)) < 0.02,
    `tax=${account.estimatedTax} customerPaid=${customerPaid}`
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

  // Attributed product revenue/fee may not equal account totals (unallocated finance).
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
        marketplaceFee: account.commission,
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
