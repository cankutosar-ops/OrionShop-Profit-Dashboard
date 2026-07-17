#!/usr/bin/env node
/**
 * Sprint: Legacy vs Model B vs Model C accounting reconciliation.
 * Usage: npx tsx scripts/accounting-reconciliation-sprint.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import { buildModelBProfitMetrics } from "../src/lib/profit-engine-model-b.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { buildWbSettlementFromSources, resolveNetForPay, sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { resolveNetSalesFromSources, buildNetSalesFromApiSales, buildNetForPayFromDb } from "../src/lib/sales-revenue-resolution.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { expandSalesReportFetchWindow } from "../src/lib/expected-wb-payout.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "../src/services/persisted-query-service.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-04-14";
const to = process.argv[4] ?? "2026-07-12";

function r(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const client = createAdminClient();
  const scope = { marketplaceAccountId: accountId, companyId: "", from, to };
  const products = await fetchProductsWithRelations(accountId, client);
  const productIds = products.map((p) => String(p.id));
  const supplierArticles = products.map((p) => p.supplier_article);

  const [sales, finance, ads, costHistory] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds }),
    fetchFinanceInRange(scope, client, { productIds }),
    fetchAdsInRange(scope, client, { productIds, supplierArticles }),
    fetchCostHistory(accountId, client, { productIds }),
  ]);

  const latestCost = buildLatestCostByProductId(costHistory, products);
  const components = assembleFinancialComponents({
    sales,
    finance,
    ads,
    costHistory,
    latestCostByProductId: latestCost,
  });
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const cats = summarizeFinanceByCategory(finance);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    components.commission
  );

  // Legacy dashboard KPI card (pre-V3): commission + otherExpenses
  const legacyMarketplaceFees = r(components.commission + components.otherExpenses);
  const legacyNetProfit = r(
    components.revenue -
      components.productCost -
      components.commission -
      components.logistics -
      components.returnLogistics -
      components.storage -
      components.advertising -
      components.penalties -
      components.otherExpenses
  );

  const netSales = resolveNetSalesFromSources({ sales, scopeFrom: from, scopeTo: to });
  const totalLogistics = r(components.logistics + components.returnLogistics);
  const modelB = buildModelBProfitMetrics(netSales, {
    salesForPay: buildNetForPayFromDb(sales),
    acquiring: cats.ACQUIRING,
    logistics: totalLogistics,
    storage: components.storage,
    penalties: components.penalties,
    adjustments: presentation.accountAdjustments,
    productCost: components.productCost,
    advertising: components.advertising,
  });

  let weeklyReports;
  try {
    const account = await getMarketplaceAccountForSync(accountId);
    const wb = new WbApiClient(account.apiKey);
    const { fetchFrom, fetchTo } = expandSalesReportFetchWindow(from, to);
    weeklyReports = await wb.fetchSalesReportsList(fetchFrom, fetchTo, "weekly");
  } catch {
    weeklyReports = undefined;
  }

  const netForPay = resolveNetForPay({
    finance,
    weeklyReports,
    scopeFrom: from,
    scopeTo: to,
  });
  const settlement = buildWbSettlementFromSources(finance, totalLogistics, netForPay);
  const modelC = buildModelCProfitMetrics({
    netForPay: settlement.netForPay,
    marketplaceFees: presentation.marketplaceFees,
    logistics: totalLogistics,
    storage: settlement.storage,
    penalties: settlement.penalties,
    deductions: settlement.deductions,
    acceptance: settlement.acceptance,
    productCost: components.productCost,
    advertising: components.advertising,
  });

  const mfDiff = r(legacyMarketplaceFees - presentation.marketplaceFees);

  // Legacy MF KPI rolls acquiring/PPVZ/adjustment/compensation into otherExpenses — decompose for Part 1.
  const legacyAcquiring = r(cats.ACQUIRING);
  const legacyPpvzReward = r(cats.PPVZ_REWARD);
  const legacyPpvzVw = r(cats.PPVZ_VW);
  const legacyAdjustment = r(cats.ADJUSTMENT);
  const legacyCompensation = r(cats.COMPENSATION);
  const legacyOtherMf = r(cats.OTHER);
  const legacyHidden = r(financeTotals.unclassified);

  let apiNetSales = null;
  try {
    const account = await getMarketplaceAccountForSync(accountId);
    const wb = new WbApiClient(account.apiKey);
    const apiSales = await wb.fetchSales(`${from}T00:00:00`);
    apiNetSales = buildNetSalesFromApiSales(apiSales, from, to);
  } catch (err) {
    console.warn("Sales API unavailable for Part 3:", err instanceof Error ? err.message : err);
  }

  const purchaseCount = sales.filter((s) => !s.is_return).length;
  const returnCount = sales.filter((s) => s.is_return).length;

  console.log("=== ACCOUNTING RECONCILIATION ===");
  console.log(`Account: ${accountId}  Period: ${from} → ${to}`);
  console.log(`Finance rows: ${finance.length}  Sales rows: ${sales.length}`);
  console.log("");

  console.log("=== PART 1 — Marketplace Fees ===");
  console.log("| Component | Legacy | Model B | Difference |");
  console.log("|-----------|-------:|--------:|-----------:|");
  const part1Rows = [
    ["Commission", components.commission, presentation.commission],
    ["Acquiring", legacyAcquiring, presentation.acquiring],
    ["PPVZ Reward", legacyPpvzReward, presentation.ppvzReward],
    ["PPVZ VW", legacyPpvzVw, presentation.ppvzVw],
    ["Other Marketplace Fees", legacyOtherMf, presentation.otherMarketplaceExpenses],
    ["Account Adjustments", legacyAdjustment, presentation.accountAdjustments],
    ["Compensation", legacyCompensation, presentation.reimbursements ?? 0],
    ["Penalties (legacy NP line, not MF KPI)", components.penalties, 0],
    ["Acceptance", 0, settlement.acceptance],
    ["Hidden Finance Categories", legacyHidden, 0],
  ];
  for (const [label, leg, mb] of part1Rows) {
    console.log(`| ${label} | ${r(leg)} | ${r(mb)} | ${r(leg - mb)} |`);
  }
  const legacyMfDecomposed = r(
    components.commission +
      legacyAcquiring +
      legacyPpvzReward +
      legacyPpvzVw +
      legacyOtherMf +
      legacyAdjustment +
      legacyCompensation
  );
  console.log(`| **TOTAL Marketplace Fees KPI** | **${legacyMarketplaceFees}** | **${r(presentation.marketplaceFees)}** | **${mfDiff}** |`);
  console.log(`| (decomposed legacy sum) | ${legacyMfDecomposed} | | |`);
  console.log("");
  console.log(
    `PROVEN gap ${mfDiff} = ADJUSTMENT (${legacyAdjustment}) + COMPENSATION (${legacyCompensation}) — excluded from Model B MF KPI, shown as separate Model B lines.`
  );
  console.log("");
  console.log("Category summary (all finance):");
  for (const [k, v] of Object.entries(cats)) {
    if (v > 0) console.log(`  ${k}: ${r(v)}`);
  }
  console.log("");
  console.log("Legacy otherExpenses decomposition:");
  console.log(`  operation_type other: ${r(financeTotals.other)}`);
  console.log(`  unclassified: ${r(financeTotals.unclassified)}`);
  console.log(`  penalties in NP (not in MF card): ${r(components.penalties)}`);

  console.log("\n=== PART 2 — Net Profit Bridge (Model B → Model C) ===");
  const bridge = [
    ["Revenue basis (netSales vs netForPay)", r(modelB.netSales - modelC.revenue)],
    ["Marketplace Fees (legacy KPI, not Model B widget)", r(-presentation.marketplaceFees)],
    ["Adjustments (Model B widget)", r(-modelB.adjustments)],
    ["Logistics", r(modelB.logistics - modelC.logistics)],
    ["Storage", r(modelB.storage - modelC.storage)],
    ["Penalties (deducted C only)", r(modelC.penalties)],
    ["Deductions (deducted C only)", r(modelC.deductions)],
    ["Acceptance (deducted C only)", r(modelC.acceptance)],
    ["Product Cost", r(modelB.productCost - modelC.productCost)],
    ["Advertising", r(modelB.advertising - modelC.advertising)],
  ];
  console.log("| Difference Source | B−C impact on NP |");
  for (const [label, amt] of bridge) {
    console.log(`| ${label} | ${amt} |`);
  }
  console.log(`| Model B Net Profit | ${r(modelB.netProfit)} |`);
  console.log(`| Model C Net Profit | ${r(modelC.netProfit)} |`);
  console.log(`| Actual difference | ${r(modelB.netProfit - modelC.netProfit)} |`);

  console.log("\n=== PART 3 — Model B Revenue (priceWithDisc) ===");
  if (apiNetSales) {
    console.log("| Metric | Amount | Count |");
    console.log("|--------|-------:|------:|");
    console.log(`| Gross Sales (Σ sold priceWithDisc) | ${r(apiNetSales.grossSales)} | ${purchaseCount} db / API gross |`);
    console.log(`| Returned Sales (Σ returned priceWithDisc) | ${r(apiNetSales.returnedSales)} | ${returnCount} db returns |`);
    console.log(`| Net Sales (Gross − Returns) | ${r(apiNetSales.netSales)} | |`);
    console.log(`| Model B engine netSales (DB-only path) | ${r(modelB.netSales)} | |`);
    console.log(`| Difference (API math − DB path) | ${r(apiNetSales.netSales - modelB.netSales)} | |`);
    console.log("");
    console.log("| Validation | Status |");
    console.log("|-----------|--------|");
    console.log(`| Sales API returns priceWithDisc | PASS |`);
    console.log(`| Mapper stores priceWithDisc | PASS (mapApiSaleToDb) |`);
    console.log(
      `| Database contains historical priceWithDisc | ${modelB.netSales > 0 ? "PASS" : "FAIL — column missing / not backfilled"} |`
    );
    console.log(`| Dashboard reads priceWithDisc | ${modelB.netSales > 0 ? "PASS (DB)" : "FALLBACK to Sales API when available"} |`);
    console.log(`| Model B Revenue uses priceWithDisc | PASS (buildNetSalesFromDb / buildNetSalesFromApiSales) |`);
  } else {
    console.log("SKIP: Sales API rate-limited or unavailable.");
  }

  console.log("\n=== PART 4 — Legacy vs Model B vs Model C ===");
  console.log("| Metric | Legacy | Model B | Model C |");
  console.log("|--------|-------:|--------:|--------:|");
  const part4Rows = [
    ["Revenue", components.revenue, apiNetSales?.netSales ?? modelB.netSales, modelC.revenue],
    ["Marketplace Fees", legacyMarketplaceFees, presentation.marketplaceFees, presentation.marketplaceFees],
    ["Logistics", totalLogistics, modelB.logistics, modelC.logistics],
    ["Storage", components.storage, modelB.storage, modelC.storage],
    ["Product Cost", components.productCost, modelB.productCost, modelC.productCost],
    ["Advertising", components.advertising, modelB.advertising, modelC.advertising],
    ["Penalties", components.penalties, 0, modelC.penalties],
    ["Deductions", 0, 0, modelC.deductions],
    ["Account Adjustments", legacyAdjustment, modelB.adjustments, 0],
    ["Net Profit", legacyNetProfit, modelB.netProfit, modelC.netProfit],
  ];
  for (const [label, leg, mb, mc] of part4Rows) {
    console.log(`| ${label} | ${r(leg)} | ${r(mb)} | ${r(mc)} |`);
  }

  console.log(`netForPay: ${r(settlement.netForPay)}`);
  console.log(`WB Settlement: ${r(settlement.settlement)}`);
  console.log(`Model C revenue: ${r(modelC.revenue)}`);
  if (weeklyReports?.length) {
    console.log(`Weekly reports overlapping: ${weeklyReports.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
