/**
 * Sprint 6.34.4 — Model B Tax Integration validation.
 * Usage: npx tsx scripts/verify-model-b-tax-sprint-6-34-4.mjs [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const from = process.argv[2] ?? "2026-06-08";
const to = process.argv[3] ?? "2026-07-05";
const TAX_PERCENT = 6;

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} = await import("../src/lib/finance-rollup.ts");
const {
  buildModelBProfitMetrics,
  buildModelBBreakdownLines,
  verifyModelBFinalProfitArithmetic,
  verifyModelBProfitArithmetic,
} = await import("../src/lib/profit-engine-model-b.ts");
const { computeProductCost } = await import("../src/lib/product-cost.ts");
const {
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} = await import("../src/lib/sales-revenue-resolution.ts");
const { buildLatestCostByProductId } = await import("../src/lib/cost-history-resolution.ts");
const {
  DEFAULT_TAX_PERCENT,
  buildModelBUnitMetrics,
  solveRecommendedPrice,
  verifyRecommendedPrice,
} = await import("../src/lib/smart-pricing.ts");

function fmt(n) {
  return `${Number(n).toFixed(2)} ₽`;
}

function near(a, b, eps = 0.02) {
  return Math.abs(a - b) < eps;
}

async function loadAccount(accountId) {
  const supabase = createAdminClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .eq("marketplace_account_id", accountId);
  if (productsError) throw productsError;

  const productIds = new Set((products ?? []).map((p) => String(p.id)));

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
    row.product_id ? productIds.has(String(row.product_id)) : true
  );
  const costHistory = costHistoryRes.data ?? [];
  const latestCostByProductId = buildLatestCostByProductId(costHistory, products ?? []);
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const productCost = computeProductCost(sales, costHistory, latestCostByProductId);
  const advertising = ads.reduce((sum, ad) => sum + Number(ad.spend ?? 0), 0);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    financeTotals.commission
  );
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
    taxPercent: TAX_PERCENT,
  });

  return { accountId, sales, modelB, netSalesFromDb, salesForPay, financeTotals };
}

function validateAccount(ctx, printFullChain) {
  const { accountId, modelB } = ctx;
  const fails = [];

  const customerPayment = modelB.netSales;
  const commission = modelB.commission;
  const acquiring = modelB.acquiring;
  const logistics = modelB.logistics;
  const returnLogistics = 0; // already inside modelB.logistics (outbound + return)
  const storage = modelB.storage;
  const penalties = modelB.penalties;
  const adjustments = modelB.adjustments;
  const sellerPayout = modelB.sellerPayout;
  const estimatedTax = modelB.estimatedTax;
  const afterTaxPayout = modelB.afterTaxPayout;
  const productCost = modelB.productCost;
  const advertising = modelB.advertising;
  const finalNetProfit = modelB.finalNetProfit;

  const expectedSellerPayout =
    modelB.revenue - acquiring - logistics - storage - penalties - adjustments;
  const expectedTax =
    expectedSellerPayout > 0 ? expectedSellerPayout * (TAX_PERCENT / 100) : 0;
  const expectedFinal =
    expectedSellerPayout - expectedTax - productCost - advertising;

  if (!near(sellerPayout, expectedSellerPayout)) {
    fails.push(`Seller Payout mismatch ${sellerPayout} vs ${expectedSellerPayout}`);
  }
  if (!near(estimatedTax, expectedTax)) {
    fails.push(`Tax mismatch ${estimatedTax} vs ${expectedTax}`);
  }
  if (!near(finalNetProfit, expectedFinal)) {
    fails.push(`Final NP mismatch ${finalNetProfit} vs ${expectedFinal}`);
  }

  // Tax base = Seller Payout only — cost/marketing must not change tax when S fixed
  const taxIfCostDoubled = buildModelBProfitMetrics(
    { ...ctx.netSalesFromDb },
    {
      salesForPay: ctx.salesForPay,
      acquiring,
      logistics,
      storage,
      penalties,
      adjustments,
      productCost: productCost * 2,
      advertising: advertising * 2,
      taxPercent: TAX_PERCENT,
    }
  );
  if (!near(taxIfCostDoubled.estimatedTax, estimatedTax)) {
    fails.push("Tax changed when Product Cost / Advertising changed (tax base leak)");
  }

  const opDiff = verifyModelBProfitArithmetic(modelB);
  const finalDiff = verifyModelBFinalProfitArithmetic(modelB);
  if (Math.abs(opDiff) >= 0.01) fails.push(`Operating Profit arithmetic ${opDiff}`);
  if (Math.abs(finalDiff) >= 0.01) fails.push(`Final Profit arithmetic ${finalDiff}`);

  const breakdown = buildModelBBreakdownLines(modelB);
  const totalLine = breakdown.find((l) => l.isTotal);
  if (!totalLine || !near(totalLine.amount, modelB.finalNetProfit)) {
    fails.push("Breakdown Final Net Profit ≠ Dashboard Final Net Profit");
  }

  if (printFullChain) {
    console.log("\n========== COMPLETE CALCULATION (Account " + accountId + ") ==========");
    console.log(`Customer Payment          ${fmt(customerPayment)}`);
    console.log(`  ↓ Commission            ${fmt(commission)}`);
    console.log(`  ↓ Acquiring             ${fmt(acquiring)}`);
    console.log(`  ↓ Logistics             ${fmt(logistics)} (incl. return logistics)`);
    console.log(`  ↓ Return Logistics      ${fmt(returnLogistics)} (rolled into Logistics)`);
    console.log(`  ↓ Storage               ${fmt(storage)}`);
    console.log(`  ↓ Penalties             ${fmt(penalties)}`);
    console.log(`  ↓ Adjustments           ${fmt(adjustments)}`);
    console.log(`Seller Payout             ${fmt(sellerPayout)}`);
    console.log(`  ↓ Estimated Tax (${TAX_PERCENT}%) ${fmt(estimatedTax)}`);
    console.log(`After Tax Payout          ${fmt(afterTaxPayout)}`);
    console.log(`  ↓ Product Cost          ${fmt(productCost)}`);
    console.log(`  ↓ Advertising           ${fmt(advertising)}`);
    console.log(`Final Net Profit          ${fmt(finalNetProfit)}`);
    console.log(`Operating Profit (pre-tax)${fmt(modelB.operatingProfit)}`);
    console.log("===============================================================\n");
  }

  return fails;
}

function validateSmartPricingSolver() {
  const fails = [];
  if (DEFAULT_TAX_PERCENT !== 6) fails.push("DEFAULT_TAX_PERCENT ≠ 6");

  const inputs = {
    purchaseCost: 400,
    historicalLogistics: 80,
    effectiveLogistics: 80,
    storagePerUnit: 20,
    marketplaceFeesPercent: 25,
    commissionPercent: 25,
  };
  const marketing = 5;
  const targetMargin = 15;
  const tax = 6;

  const price = solveRecommendedPrice(inputs, targetMargin, marketing, tax);
  if (price === null) {
    fails.push("solveRecommendedPrice returned null");
    return fails;
  }

  const verified = verifyRecommendedPrice(inputs, targetMargin, marketing, price, tax);
  if (!near(verified.marginPercent, targetMargin, 0.05)) {
    fails.push(
      `Target margin after tax not achieved: got ${verified.marginPercent.toFixed(3)}% want ${targetMargin}%`
    );
  }

  const unit = buildModelBUnitMetrics(inputs, marketing, price, tax);
  if (!near(unit.estimatedTax, unit.sellerPayout * (tax / 100))) {
    fails.push("Unit tax ≠ Seller Payout × tax%");
  }
  if (!near(unit.finalNetProfit, verified.profit)) {
    fails.push("Unit Final NP ≠ verifyRecommendedPrice profit");
  }

  // Cost must not affect tax at fixed price
  const atPrice = 2000;
  const a = buildModelBUnitMetrics(inputs, marketing, atPrice, tax);
  const b = buildModelBUnitMetrics(
    { ...inputs, purchaseCost: inputs.purchaseCost * 3 },
    marketing * 2,
    atPrice,
    tax
  );
  if (!near(a.estimatedTax, b.estimatedTax)) {
    fails.push("SP: tax changed when cost/marketing changed at fixed price");
  }
  if (!near(a.sellerPayout, b.sellerPayout)) {
    fails.push("SP: seller payout changed when cost/marketing changed");
  }

  console.log("Smart Pricing solver check:");
  console.log(`  P* for ${targetMargin}% after tax @ ${tax}% tax: ${fmt(price)}`);
  console.log(`  Achieved Final Margin: ${verified.marginPercent.toFixed(3)}%`);
  console.log(`  Seller Payout: ${fmt(unit.sellerPayout)}  Tax: ${fmt(unit.estimatedTax)}`);
  console.log(`  Final Net Profit: ${fmt(unit.finalNetProfit)}\n`);

  return fails;
}

async function main() {
  console.log("Sprint 6.34.4 — Model B Tax Integration");
  console.log(`Period: ${from} → ${to}  Tax: ${TAX_PERCENT}%\n`);

  const allFails = [];
  allFails.push(...validateSmartPricingSolver());

  for (const accountId of ["1", "2"]) {
    const ctx = await loadAccount(accountId);
    console.log(`--- Account ${accountId} ---`);
    console.log(
      `Sales ${fmt(ctx.modelB.netSales)} | Seller Payout ${fmt(ctx.modelB.sellerPayout)} | Final NP ${fmt(ctx.modelB.finalNetProfit)}`
    );
    const fails = validateAccount(ctx, accountId === "1");
    if (fails.length) {
      console.log(`FAIL Account ${accountId}:`);
      for (const f of fails) console.log(`  - ${f}`);
      allFails.push(...fails.map((f) => `A${accountId}: ${f}`));
    } else {
      console.log(`PASS Account ${accountId}\n`);
    }
  }

  if (allFails.length) {
    console.log("\nOVERALL: FAIL");
    for (const f of allFails) console.log(`  - ${f}`);
    process.exit(1);
  }

  console.log("OVERALL: PASS");
  console.log("✓ Tax calculated ONLY from Seller Payout");
  console.log("✓ Product Cost does not affect tax base");
  console.log("✓ Marketing does not affect tax base");
  console.log("✓ Dashboard / Breakdown / Smart Pricing share Model B tax math");
  console.log("✓ Breakdown Final Net Profit = Dashboard Final Net Profit");
  console.log("✓ Target Margin achieved AFTER tax");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
