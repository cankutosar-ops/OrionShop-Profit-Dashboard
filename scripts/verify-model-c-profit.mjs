/**
 * Verify Profit Dashboard V3 — Model C (Settlement Profit).
 * Usage: npx tsx scripts/verify-model-c-profit.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildMarketplaceFeesPresentationFromFinance, rollupCategoriesToProfitBuckets, summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { buildModelBProfitMetrics } from "../src/lib/profit-engine-model-b.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";
import { buildWbSettlementFromSources, resolveNetForPay, sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { expandSalesReportFetchWindow } from "../src/lib/expected-wb-payout.ts";
import {
  resolveNetSalesFromSources,
  buildNetSalesFromDb,
  buildNetForPayFromDb,
} from "../src/lib/sales-revenue-resolution.ts";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    // .env.local optional when vars already set
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-08";
const to = process.argv[4] ?? "2026-07-05";

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
  if (adsRes.error) throw adsRes.error;
  if (costHistoryRes.error) throw costHistoryRes.error;

  const sales = salesRes.data ?? [];
  const finance = financeRes.data ?? [];
  const ads = (adsRes.data ?? []).filter((row) =>
    row.product_id ? productIds.includes(String(row.product_id)) : true
  );
  const costHistory = costHistoryRes.data ?? [];

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products ?? []);
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const productCost = computeProductCost(sales, costHistory, latestCostByProductId);
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const presentation = buildMarketplaceFeesPresentationFromFinance(finance, financeTotals.commission);
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;

  let weeklyReports;
  let apiSales;
  try {
    const account = await getMarketplaceAccountForSync(accountId);
    const client = new WbApiClient(account.apiKey);
    const { fetchFrom, fetchTo } = expandSalesReportFetchWindow(from, to);
    weeklyReports = await client.fetchSalesReportsList(fetchFrom, fetchTo, "weekly");
    apiSales = await client.fetchSales(`${from}T00:00:00`);
  } catch {
    weeklyReports = undefined;
    apiSales = undefined;
  }

  const netSalesResolution = resolveNetSalesFromSources({
    sales,
    apiSales,
    scopeFrom: from,
    scopeTo: to,
  });
  const categorySummary = summarizeFinanceByCategory(finance);
  const modelB = buildModelBProfitMetrics(netSalesResolution, {
    salesForPay: buildNetForPayFromDb(sales),
    acquiring: categorySummary.ACQUIRING,
    logistics: totalLogistics,
    storage: financeTotals.storage,
    penalties: financeTotals.penalty,
    adjustments: presentation.accountAdjustments,
    productCost,
    advertising,
  });

  const netForPayResolution = resolveNetForPay({
    finance,
    weeklyReports,
    scopeFrom: from,
    scopeTo: to,
  });
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

  console.log("Profit Dashboard V3 — Revenue Fix Verification");
  console.log(`Account: ${accountId}`);
  console.log(`Period:  ${from} → ${to}`);
  console.log("");
  console.log("=== Model B Revenue ===");
  console.log(`Gross Sales:            ${modelB.grossSales.toFixed(2)} ₽`);
  console.log(`Returned Sales:         ${modelB.returnedSales.toFixed(2)} ₽`);
  console.log(`Net Sales:              ${modelB.netSales.toFixed(2)} ₽`);
  console.log(`Source:                 ${netSalesResolution.dataSource}`);
  console.log(`DB net (pre-fallback):  ${buildNetSalesFromDb(sales).netSales.toFixed(2)} ₽`);
  console.log("");
  console.log("=== Model C Revenue ===");
  console.log(`netForPay:              ${modelC.revenue.toFixed(2)} ₽`);
  console.log(`Source:                 ${wbSettlement.dataSource}`);
  console.log("");
  console.log("=== Marketplace Fees (display only) ===");
  console.log(`Total Marketplace Fees: ${presentation.marketplaceFees.toFixed(2)} ₽`);
  console.log(`Commission:             ${presentation.commission.toFixed(2)} ₽`);
  console.log(`Acquiring:              ${presentation.acquiring.toFixed(2)} ₽`);
  console.log(`PPVZ Reward:            ${presentation.ppvzReward.toFixed(2)} ₽`);
  console.log(`PPVZ VW:                ${presentation.ppvzVw.toFixed(2)} ₽`);
  console.log(`Other Marketplace Exp:  ${presentation.otherMarketplaceExpenses.toFixed(2)} ₽`);
  console.log(`Account Adjustments:    ${presentation.accountAdjustments.toFixed(2)} ₽`);
  console.log("");
  console.log("=== Operational Costs ===");
  console.log(`Logistics:              ${modelC.logistics.toFixed(2)} ₽`);
  console.log(`Storage:                ${modelC.storage.toFixed(2)} ₽`);
  console.log(`Penalties:              ${modelC.penalties.toFixed(2)} ₽`);
  console.log(`Deductions:             ${modelC.deductions.toFixed(2)} ₽`);
  console.log(`Acceptance:             ${modelC.acceptance.toFixed(2)} ₽`);
  console.log("");
  console.log("=== Seller Costs ===");
  console.log(`Product Cost:           ${modelC.productCost.toFixed(2)} ₽`);
  console.log(`Advertising:            ${modelC.advertising.toFixed(2)} ₽`);
  console.log("");
  console.log("=== Result ===");
  console.log(`Net Profit (Model C):   ${modelC.netProfit.toFixed(2)} ₽`);
  console.log("");
  console.log("=== WB Settlement (unchanged widget) ===");
  console.log(`netForPay:              ${wbSettlement.netForPay.toFixed(2)} ₽`);
  console.log(`Logistics:              ${wbSettlement.logistics.toFixed(2)} ₽`);
  console.log(`Storage:                ${wbSettlement.storage.toFixed(2)} ₽`);
  console.log(`Penalties:              ${wbSettlement.penalties.toFixed(2)} ₽`);
  console.log(`Deductions:             ${wbSettlement.deductions.toFixed(2)} ₽`);
  console.log(`Acceptance:             ${wbSettlement.acceptance.toFixed(2)} ₽`);
  console.log(`WB Settlement:          ${wbSettlement.settlement.toFixed(2)} ₽`);
  console.log(`Data source:            ${wbSettlement.dataSource}`);
  console.log("");
  console.log(
    "Model C check:",
    `${modelC.revenue.toFixed(2)} - ${modelC.logistics.toFixed(2)} - ${modelC.storage.toFixed(2)} - ${modelC.penalties.toFixed(2)} - ${modelC.deductions.toFixed(2)} - ${modelC.acceptance.toFixed(2)} - ${modelC.productCost.toFixed(2)} - ${modelC.advertising.toFixed(2)} = ${modelC.netProfit.toFixed(2)}`
  );
  console.log(
    "Settlement check:",
    `${wbSettlement.netForPay.toFixed(2)} - ${wbSettlement.logistics.toFixed(2)} - ${wbSettlement.storage.toFixed(2)} - ${wbSettlement.penalties.toFixed(2)} - ${wbSettlement.deductions.toFixed(2)} - ${wbSettlement.acceptance.toFixed(2)} = ${wbSettlement.settlement.toFixed(2)}`
  );
  console.log("");
  const revenueMatches =
    Math.abs(modelC.revenue - wbSettlement.netForPay) < 0.01;
  console.log(
    "Model C Revenue = WB Settlement netForPay:",
    revenueMatches ? "PASS" : "FAIL"
  );
  if (modelB.netSales <= 0 && sales.some((s) => !s.is_return)) {
    console.warn("\nWARN: Model B Revenue still zero — run backfill-sales-revenue-fields.mjs");
  }
  if (modelC.revenue <= 0 && finance.length > 0) {
    console.warn("\nWARN: Model C Revenue still zero — run backfill-finance-for-pay.mjs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
