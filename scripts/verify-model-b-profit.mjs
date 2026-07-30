/**
 * Verify Commercial Performance Engine V4.
 * Usage: npx tsx scripts/verify-model-b-profit.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import {
  buildModelBProfitMetrics,
  verifyModelBFinalProfitArithmetic,
  verifyModelBProfitArithmetic,
} from "../src/lib/profit-engine-model-b.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";
import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "../src/lib/sales-revenue-resolution.ts";
import { calculateEstimatedTax } from "../src/lib/financial-engine-tax.ts";
import {
  buildWbSettlementFromSources,
  resolveNetForPay,
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "../src/lib/wb-settlement.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    // optional
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-08";
const to = process.argv[4] ?? "2026-07-05";

function fmt(n) {
  return `${Number(n).toFixed(2)} ₽`;
}

async function main() {
  const supabase = createAdminClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .eq("marketplace_account_id", accountId);
  if (productsError) throw productsError;

  const productIds = (products ?? []).map((p) => String(p.id));

  const [salesRes, financeRes, adsRes, costHistoryRes] = await Promise.all([
    supabase
      .from("wb_sales")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to),
    supabase.from("wb_ads").select("*").gte("campaign_date", from).lte("campaign_date", to),
    supabase.from("product_cost_history").select("*"),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (financeRes.error) throw financeRes.error;

  const sales = salesRes.data ?? [];
  const finance = financeRes.data ?? [];
  const ads = (adsRes.data ?? []).filter((row) =>
    row.product_id ? productIds.includes(String(row.product_id)) : true
  );
  const costHistory = costHistoryRes.data ?? [];

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products ?? []);
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const productCost = computeProductCost(sales, costHistory, latestCostByProductId);
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    financeTotals.commission
  );
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
  const netSalesFromDb = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);
  const financeNetForPay = sumNetForPayFromFinance(finance);
  const acceptance = sumAcceptanceFromFinance(finance);
  const customerPaid = buildNetFinishedPriceFromDb(sales);

  const modelB = buildModelBProfitMetrics(netSalesFromDb, {
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

  const netForPayResolution = resolveNetForPay({ finance, scopeFrom: from, scopeTo: to });
  const wbSettlement = buildWbSettlementFromSources(finance, totalLogistics, netForPayResolution);
  const modelC = buildModelCProfitMetrics({
    netForPay: wbSettlement.netForPay,
    marketplaceFees: presentation.marketplaceFees,
    logistics: totalLogistics,
    storage: wbSettlement.storage,
    penalties: wbSettlement.penalties,
    deductions: wbSettlement.deductions,
    acceptance: wbSettlement.acceptance,
    productCost,
    advertising,
  });

  const opDiff = verifyModelBProfitArithmetic(modelB);
  const npDiff = verifyModelBFinalProfitArithmetic(modelB);
  const revenueIsFinanceForPay = Math.abs(modelB.revenue - financeNetForPay) < 0.01;
  const revenueNotSalesForPay = Math.abs(modelB.revenue - salesForPay) >= 0.01 || salesForPay === financeNetForPay;
  const feeCheck =
    Math.abs(netSalesFromDb.netSales - salesForPay - modelB.commission) < 0.02;
  const acquiringNotInNp =
    Math.abs(
      modelB.finalNetProfit -
        (modelB.revenue -
          modelB.productCost -
          modelB.logistics -
          modelB.storage -
          modelB.acceptance -
          modelB.penalties -
          modelB.adjustments -
          modelB.advertising -
          modelB.estimatedTax)
    ) < 0.02;

  console.log("Commercial Performance Engine V4 — Verification");
  console.log(`Account: ${accountId}  Period: ${from} → ${to}\n`);

  console.log("1. Revenue = Finance ppvz_for_pay (NOT Sales API forPay)");
  console.log(`   financeNetForPay: ${fmt(financeNetForPay)}`);
  console.log(`   salesForPay:      ${fmt(salesForPay)}`);
  console.log(`   modelB.revenue:   ${fmt(modelB.revenue)}`);
  console.log(`   PASS revenue=finance: ${revenueIsFinanceForPay ? "YES" : "NO"}`);
  console.log(
    `   revenue≠salesForPay (or equal only if coincidental): Δ=${(modelB.revenue - salesForPay).toFixed(2)}\n`
  );

  console.log("2. Marketplace Fee = Sales − Sales API forPay (not ppvz_*)");
  console.log(`   Fee: ${fmt(modelB.marketplaceFee ?? modelB.commission)}`);
  console.log(`   PASS: ${feeCheck ? "YES" : "NO"}\n`);

  console.log("3. Net Profit excludes Marketplace Fee & Acquiring");
  console.log(`   Acquiring KPI: ${fmt(modelB.acquiring)} (informational)`);
  console.log(`   Net Profit:    ${fmt(modelB.finalNetProfit)}`);
  console.log(`   Op arith Δ:    ${opDiff.toFixed(4)} (${Math.abs(opDiff) < 0.01 ? "PASS" : "FAIL"})`);
  console.log(`   NP arith Δ:    ${npDiff.toFixed(4)} (${Math.abs(npDiff) < 0.01 ? "PASS" : "FAIL"})`);
  console.log(`   NP identity:   ${acquiringNotInNp ? "PASS" : "FAIL"}\n`);

  const expectedTax = calculateEstimatedTax(customerPaid, 6);
  const taxOk = Math.abs(modelB.estimatedTax - expectedTax) < 0.02;
  console.log("4. Estimated Tax = 6% × Σ finishedPrice");
  console.log(`   customerPaid:  ${fmt(customerPaid)}`);
  console.log(`   estimatedTax:  ${fmt(modelB.estimatedTax)}`);
  console.log(`   PASS: ${taxOk ? "YES" : "NO"}\n`);

  console.log("5. Model C unchanged (settlement)");
  console.log(`   Model C revenue: ${fmt(modelC.revenue)}`);
  console.log(`   Model B revenue: ${fmt(modelB.revenue)}`);
  console.log(
    `   Same base expected when both use finance for_pay: ${
      Math.abs(modelB.revenue - modelC.revenue) < 0.01 ? "SAME" : "DIFFERENT"
    }\n`
  );

  const failed =
    !revenueIsFinanceForPay ||
    !feeCheck ||
    Math.abs(opDiff) >= 0.01 ||
    Math.abs(npDiff) >= 0.01 ||
    !acquiringNotInNp ||
    !taxOk;
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
