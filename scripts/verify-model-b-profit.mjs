/**
 * Verify Sprint 6.31 — Model B commercial architecture.
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
  shareOfNetSalesPercent,
  verifyModelBProfitArithmetic,
} from "../src/lib/profit-engine-model-b.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";
import {
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "../src/lib/sales-revenue-resolution.ts";
import { buildWbSettlementFromSources, resolveNetForPay } from "../src/lib/wb-settlement.ts";
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
  const presentation = buildMarketplaceFeesPresentationFromFinance(finance, financeTotals.commission);
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
  const netSalesFromDb = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);

  const modelB = buildModelBProfitMetrics(netSalesFromDb, {
    salesForPay,
    acquiring: categorySummary.ACQUIRING,
    logistics: totalLogistics,
    storage: financeTotals.storage,
    penalties: financeTotals.penalty,
    adjustments: presentation.accountAdjustments,
    productCost,
    advertising,
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

  const arithDiff = verifyModelBProfitArithmetic(modelB);
  const revenueIsSalesForPay = Math.abs(modelB.revenue - salesForPay) < 0.01;
  const commissionCheck =
    Math.abs(netSalesFromDb.netSales - salesForPay - modelB.commission) < 0.02;
  const manualNp =
    modelB.revenue -
    modelB.acquiring -
    modelB.logistics -
    modelB.storage -
    modelB.penalties -
    modelB.adjustments -
    modelB.productCost -
    modelB.advertising;

  console.log("Sprint 6.31 — Model B Architecture Verification");
  console.log(`Account: ${accountId}  Period: ${from} → ${to}\n`);

  console.log("1. Model B Revenue = Sales API forPay");
  console.log(`   salesForPay:     ${fmt(salesForPay)}`);
  console.log(`   modelB.revenue:  ${fmt(modelB.revenue)}`);
  console.log(`   PASS: ${revenueIsSalesForPay ? "YES" : "NO"}\n`);

  console.log("2. Acquiring separate from Revenue; deducted in Net Profit only");
  console.log(`   Revenue widget:  ${fmt(modelB.revenue)} (forPay)`);
  console.log(`   Acquiring KPI:   ${fmt(modelB.acquiring)}`);
  console.log(`   Revenue ≠ forPay−acq unless coincidental: ${Math.abs(modelB.revenue - (salesForPay - modelB.acquiring)) < 0.01 ? "equal" : "separate"}\n`);

  console.log("3. Net Profit starts from Revenue (forPay)");
  console.log(`   ${fmt(modelB.revenue)} − ${fmt(modelB.acquiring)} − costs = ${fmt(manualNp)}`);
  console.log(`   Engine netProfit: ${fmt(modelB.netProfit)}`);
  console.log(`   Arithmetic diff:  ${arithDiff.toFixed(4)} (${Math.abs(arithDiff) < 0.01 ? "PASS" : "FAIL"})\n`);

  console.log("4. Model C breakdown engine (unchanged)");
  console.log(`   Model C revenue (netForPay): ${fmt(modelC.revenue)}`);
  console.log(`   Model C netProfit:           ${fmt(modelC.netProfit)}`);
  console.log(`   Model B revenue ≠ Model C revenue (expected): ${Math.abs(modelB.revenue - modelC.revenue) < 0.01 ? "SAME" : "DIFFERENT"}\n`);

  console.log("5. Commission = Sales − forPay");
  console.log(`   PASS: ${commissionCheck ? "YES" : "NO"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
