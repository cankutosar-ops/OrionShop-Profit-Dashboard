#!/usr/bin/env node
/**
 * Profit Dashboard V3 refinement validation.
 * Usage: npx tsx scripts/verify-dashboard-v3-refinement.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import { buildMarketplaceFeesPresentationFromFinance, summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";
import { buildModelBProfitMetrics } from "../src/lib/profit-engine-model-b.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { buildWbSettlementFromSources, resolveNetForPay, sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { expandSalesReportFetchWindow } from "../src/lib/expected-wb-payout.ts";
import { getWbBalanceMetrics } from "../src/services/wb-balance-service.ts";
import {
  buildNetSalesFromApiSales,
  buildNetSalesFromDb,
  buildNetForPayFromDb,
  resolveNetSalesFromSources,
  shareOfRevenueBasePercent,
} from "../src/lib/sales-revenue-resolution.ts";
import { shareOfNetSalesPercent } from "../src/lib/profit-engine-model-b.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-08";
const to = process.argv[4] ?? "2026-07-05";

function fmt(n) {
  return `${n.toFixed(2)} ₽`;
}

function pct(amount, base) {
  return `${shareOfRevenueBasePercent(base, amount).toFixed(1)}%`;
}

async function main() {
  loadEnv();
  const supabase = createAdminClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("marketplace_account_id", accountId);
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

  const sales = salesRes.data ?? [];
  const finance = financeRes.data ?? [];
  const ads = (adsRes.data ?? []).filter((row) =>
    row.product_id ? productIds.includes(String(row.product_id)) : true
  );
  const costHistory = costHistoryRes.data ?? [];
  const latestCostByProductId = buildLatestCostByProductId(costHistory, products ?? []);
  const breakdown = assembleFinancialComponents({
    sales,
    finance,
    ads,
    costHistory,
    latestCostByProductId,
  });
  const mf = buildMarketplaceFeesPresentationFromFinance(finance, breakdown.commission);
  const totalLogistics = breakdown.logistics + breakdown.returnLogistics;

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

  const netSales = resolveNetSalesFromSources({
    sales,
    apiSales,
    scopeFrom: from,
    scopeTo: to,
  });
  const categorySummary = summarizeFinanceByCategory(finance);
  const modelB = buildModelBProfitMetrics(netSales, {
    salesForPay: buildNetForPayFromDb(sales),
    acquiring: categorySummary.ACQUIRING,
    logistics: totalLogistics,
    storage: breakdown.storage,
    penalties: breakdown.penalties,
    adjustments: mf.accountAdjustments,
    productCost: breakdown.productCost,
    advertising: breakdown.advertising,
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
    marketplaceFees: mf.marketplaceFees,
    logistics: totalLogistics,
    storage: wbSettlement.storage,
    penalties: wbSettlement.penalties,
    deductions: wbSettlement.deductions,
    acceptance: wbSettlement.acceptance,
    productCost: breakdown.productCost,
    advertising: breakdown.advertising,
  });
  const wbBalance = await getWbBalanceMetrics(accountId);

  console.log("Profit Dashboard V3 Refinement Report");
  console.log(`Account: ${accountId}  Period: ${from} → ${to}\n`);

  console.log("=== Revenue (Model B) ===");
  console.log(`Gross Sales:     ${fmt(netSales.grossSales)}`);
  console.log(`Returned Sales:  ${fmt(netSales.returnedSales)}`);
  console.log(`Net Sales:       ${fmt(netSales.netSales)}`);
  console.log(`Source:          ${netSales.dataSource}`);
  console.log(`Formula:         Gross − Returned = Net`);

  console.log("\n=== Marketplace Fees (raw finance categories) ===");
  console.log(`Total:           ${fmt(mf.marketplaceFees)}`);
  console.log(`Commission:      ${fmt(mf.commission)}`);
  console.log(`Acquiring:       ${fmt(mf.acquiring)}`);
  console.log(`PPVZ Reward:     ${fmt(mf.ppvzReward)}`);
  console.log(`PPVZ VW:         ${fmt(mf.ppvzVw)}`);
  console.log(`Other MP Exp:    ${fmt(mf.otherMarketplaceExpenses)}`);
  console.log(`Acct Adjustments:${fmt(mf.accountAdjustments)}`);
  console.log(`Reimbursements:  ${fmt(mf.reimbursements)} (excluded from total)`);

  console.log("\n=== Logistics ===");
  console.log(`Amount:          ${fmt(totalLogistics)}`);
  console.log(`Model B %:       ${pct(totalLogistics, modelB.netSales)} of net sales`);
  console.log(
    `Model B formula: ${fmt(totalLogistics)} ÷ ${fmt(modelB.netSales)} × 100 = ${pct(totalLogistics, modelB.netSales)}`
  );
  console.log(`Model C %:       ${pct(totalLogistics, modelC.revenue)} of revenue (netForPay)`);
  console.log(
    `Model C formula: ${fmt(totalLogistics)} ÷ ${fmt(modelC.revenue)} × 100 = ${pct(totalLogistics, modelC.revenue)}`
  );

  console.log("\n=== Product Cost (net sold units) ===");
  console.log(`Sold Units:      ${breakdown.unitsSold}`);
  console.log(`Returned Units:  ${breakdown.unitsReturned}`);
  console.log(`Net Sold Units:  ${breakdown.unitsSold - breakdown.unitsReturned}`);
  console.log(`Product Cost:    ${fmt(breakdown.productCost)}`);
  console.log(`Formula:         Σ (sold qty × cost) − Σ (return qty × cost)`);

  console.log("\n=== Model B Net Profit ===");
  console.log(`Net Profit:      ${fmt(modelB.netProfit)}`);

  console.log("\n=== Model C Revenue & WB Settlement ===");
  console.log(`Revenue:         ${fmt(modelC.revenue)}`);
  console.log(`WB netForPay:    ${fmt(wbSettlement.netForPay)}`);
  console.log(`WB Settlement:   ${fmt(wbSettlement.settlement)}`);
  console.log(
    `Consistency:     Revenue − Logistics − Storage − Penalties − Deductions − Acceptance = WB Settlement`
  );

  console.log("\n=== Wallet Balance ===");
  console.log(`API:             GET /api/v1/account/balance (WB Finance API)`);
  console.log(`Total (current): ${wbBalance.current === null ? "n/a" : fmt(wbBalance.current)}`);
  console.log(
    `For withdraw:    ${wbBalance.forWithdraw === null ? "n/a" : fmt(wbBalance.forWithdraw)}`
  );
  console.log(
    `Note:            Dashboard shows total wallet balance; subtitle shows available to withdraw.`
  );

  console.log("\n=== Revenue Validation (historical priceWithDisc) ===");
  const dbNet = buildNetSalesFromDb(sales);
  const apiNet = apiSales ? buildNetSalesFromApiSales(apiSales, from, to) : null;
  console.log(`DB net sales:    ${fmt(dbNet.netSales)}`);
  if (apiNet) {
    console.log(`API net sales:   ${fmt(apiNet.netSales)}`);
    const delta = Math.abs(dbNet.netSales - apiNet.netSales);
    console.log(
      `DB vs API delta: ${fmt(delta)} ${delta < 1 ? "(match when backfilled)" : "(DB needs backfill)"}`
    );
  }

  const samples = sales.filter((s) => Number(s.price_with_disc) > 0).slice(0, 3);
  if (samples.length) {
    console.log("\nSample stored transactions (wb_sales.price_with_disc):");
    for (const row of samples) {
      console.log(
        `  srid=${row.srid} date=${row.sale_date} return=${row.is_return} price_with_disc=${row.price_with_disc} (historical Sales API)`
      );
    }
  } else if (apiSales?.length) {
    console.log("\nSample API transactions (no DB price_with_disc yet):");
    for (const row of apiSales.slice(0, 3)) {
      console.log(
        `  saleID=${row.saleID} date=${row.date.slice(0, 10)} priceWithDisc=${row.priceWithDisc}`
      );
    }
    console.log("  → Revenue uses Sales API fallback until wb_sales.price_with_disc is backfilled.");
  }

  console.log("\n=== Logistics % sanity (Model B) ===");
  console.log(
    `shareOfNetSalesPercent(logistics, netSales) = ${shareOfNetSalesPercent(modelB.netSales, totalLogistics).toFixed(2)}%`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
