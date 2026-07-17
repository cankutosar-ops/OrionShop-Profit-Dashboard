/**
 * Sprint 6.3 — verify adaptive commission engine.
 * Usage: npx tsx scripts/verify-adaptive-commission.mjs [accountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "2";
const TARGET_MARGIN = 30;
const MARKETING = 15;
const OLD_COMMISSION = 20;

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { fetchProductsWithRelations, fetchSalesInRange, fetchFinanceInRange } =
  await import("../src/services/dashboard-service.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { buildSmartPricingRow, solveRecommendedPrice } = await import("../src/lib/smart-pricing.ts");
import { createServerClient } from "../src/lib/supabase/server.ts";

const scope = await resolveScopedDateRange({ account: accountId });
const client = createServerClient();
const [products, spInputs] = await Promise.all([
  fetchProductsWithRelations(scope.marketplaceAccountId, client),
  getSmartPricingInputs(scope),
]);

if (!spInputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

// Build rows for ALL catalog products (not just smart-pricing filter) for 50+ sample
const { buildCategoryCommissionTotals, resolveAdaptiveCommission, sumCompletedSalesMetrics } =
  await import("../src/lib/smart-pricing-commission.ts");

const sales = await fetchSalesInRange(scope, client);
const finance = await fetchFinanceInRange(scope, client);

const salesByProductId = new Map();
for (const row of sales) {
  const k = String(row.product_id);
  if (!salesByProductId.has(k)) salesByProductId.set(k, []);
  salesByProductId.get(k).push(row);
}
const financeByProductId = new Map();
for (const row of finance) {
  const k = String(row.product_id);
  if (!financeByProductId.has(k)) financeByProductId.set(k, []);
  financeByProductId.get(k).push(row);
}

const categoryTotals = buildCategoryCommissionTotals(products, salesByProductId, financeByProductId);
const spByModel = new Map(spInputs.map((r) => [r.supplierArticle, r]));

const rows = products.map((product) => {
  const productId = String(product.id);
  const sp = spByModel.get(product.supplier_article);
  const productSales = salesByProductId.get(productId) ?? [];
  const productTotals = sumCompletedSalesMetrics(productSales);
  const adaptive = resolveAdaptiveCommission({
    marketplace: "wildberries",
    categoryId: String(product.category_id),
    productTotals,
    categoryTotals: categoryTotals.get(String(product.category_id)) ?? {
      commission: 0,
      revenue: 0,
      salesForPay: 0,
      unitsSold: 0,
    },
  });

  const input = sp ?? {
    productId,
    supplierArticle: product.supplier_article,
    productName: product.name,
    purchaseCost: null,
    unitPurchaseLogistics: 0,
    unitExcludedLogistics: 0,
    effectiveLogistics: 0,
    commissionPercent: adaptive.commissionPercent,
    commissionSource: adaptive.commissionSource,
    completedSales: adaptive.completedSales,
    productHistoricalCommissionPercent: adaptive.productHistoricalCommissionPercent,
    categoryHistoricalCommissionPercent: adaptive.categoryHistoricalCommissionPercent,
    marketplaceCommissionPercent: adaptive.marketplaceCommissionPercent,
    currentAvgPrice: null,
    hasSalesHistory: false,
    orders: 0,
  };

  let oldPrice = null;
  let newPrice = null;
  if (input.purchaseCost != null) {
    const base = {
      purchaseCost: input.purchaseCost,
      effectiveLogistics: input.effectiveLogistics,
    };
    oldPrice = solveRecommendedPrice(
      { ...base, commissionPercent: OLD_COMMISSION },
      TARGET_MARGIN,
      MARKETING
    );
    newPrice = solveRecommendedPrice(
      { ...base, commissionPercent: input.commissionPercent },
      TARGET_MARGIN,
      MARKETING
    );
  } else if (sp) {
    const computed = buildSmartPricingRow(sp, TARGET_MARGIN, MARKETING);
    newPrice = computed.targetPrice;
    oldPrice = solveRecommendedPrice(
      {
        purchaseCost: sp.purchaseCost,
        effectiveLogistics: sp.effectiveLogistics,
        commissionPercent: OLD_COMMISSION,
      },
      TARGET_MARGIN,
      MARKETING
    );
  }

  const priceDiff =
    oldPrice != null && newPrice != null ? newPrice - oldPrice : null;
  const priceDiffPct =
    oldPrice != null && newPrice != null && oldPrice > 0
      ? ((newPrice - oldPrice) / oldPrice) * 100
      : null;

  return {
    model: product.supplier_article,
    completedSales: input.completedSales,
    productHist: input.productHistoricalCommissionPercent,
    categoryHist: input.categoryHistoricalCommissionPercent,
    marketplace: input.marketplaceCommissionPercent,
    commissionUsed: input.commissionPercent,
    source: input.commissionSource,
    oldPrice,
    newPrice,
    priceDiff,
    priceDiffPct,
    inSmartPricing: !!sp,
  };
});

const sample = rows.slice(0, Math.max(50, rows.length));
const priced = sample.filter((r) => r.oldPrice != null && r.newPrice != null);

console.log("=== Sprint 6.3 Adaptive Commission Verification ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Catalog products:", rows.length, "| Smart Pricing rows:", spInputs.length);
console.log("Report rows:", sample.length);
console.log("");

console.log(
  [
    "Model".padEnd(14),
    "Sales".padStart(5),
    "Prod%".padStart(7),
    "Cat%".padStart(7),
    "Mkt%".padStart(5),
    "Used%".padStart(7),
    "Source".padEnd(18),
    "Old₽".padStart(8),
    "New₽".padStart(8),
    "Δ₽".padStart(8),
    "Δ%".padStart(7),
  ].join(" ")
);
console.log("-".repeat(110));

for (const r of sample) {
  const fmt = (v) => (v != null ? v.toFixed(1) : "—");
  const fmt0 = (v) => (v != null ? v.toFixed(0) : "—");
  console.log(
    [
      r.model.slice(0, 14).padEnd(14),
      String(r.completedSales).padStart(5),
      fmt(r.productHist).padStart(7),
      fmt(r.categoryHist).padStart(7),
      fmt(r.marketplace).padStart(5),
      fmt(r.commissionUsed).padStart(7),
      r.source.padEnd(18),
      fmt0(r.oldPrice).padStart(8),
      fmt0(r.newPrice).padStart(8),
      (r.priceDiff != null ? (r.priceDiff >= 0 ? "+" : "") + r.priceDiff.toFixed(0) : "—").padStart(8),
      (r.priceDiffPct != null ? r.priceDiffPct.toFixed(1) + "%" : "—").padStart(7),
    ].join(" ")
  );
}

const bySource = {
  PRODUCT_HISTORY: sample.filter((r) => r.source === "PRODUCT_HISTORY"),
  CATEGORY_HISTORY: sample.filter((r) => r.source === "CATEGORY_HISTORY"),
  MARKETPLACE_DEFAULT: sample.filter((r) => r.source === "MARKETPLACE_DEFAULT"),
};

console.log("\n=== Summary ===");
for (const [source, list] of Object.entries(bySource)) {
  const avg =
    list.length > 0
      ? list.reduce((s, r) => s + r.commissionUsed, 0) / list.length
      : 0;
  console.log(`${source}: ${list.length} products | avg commission used: ${avg.toFixed(2)}%`);
}

console.log("\nSmart Pricing panel only:");
for (const [source, list] of Object.entries(bySource)) {
  const panel = list.filter((r) => r.inSmartPricing);
  const avg =
    panel.length > 0
      ? panel.reduce((s, r) => s + r.commissionUsed, 0) / panel.length
      : 0;
  console.log(`  ${source}: ${panel.length} | avg: ${avg.toFixed(2)}%`);
}

console.log("\nPriced products compared (old 20% vs new adaptive):", priced.length);
