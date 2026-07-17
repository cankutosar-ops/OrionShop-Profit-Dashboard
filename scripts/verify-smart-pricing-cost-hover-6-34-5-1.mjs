/**
 * Sprint 6.34.5.1 — Cost breakdown hover uses existing Model B output only.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const {
  solveRecommendedPrice,
  buildModelBUnitMetrics,
  buildSmartPricingAfterTaxMetrics,
  DEFAULT_TAX_PERCENT,
} = await import("../src/lib/smart-pricing.ts");
const { buildSmartPricingCostBreakdown } = await import(
  "../src/lib/smart-pricing-calc-breakdown.ts"
);

const inputs = {
  purchaseCost: 400,
  historicalLogistics: 80,
  effectiveLogistics: 80,
  storagePerUnit: 20,
  marketplaceFeesPercent: 25,
  commissionPercent: 25,
};

const marketing = 5;
const tax = DEFAULT_TAX_PERCENT;
const margin = 15;
const price = solveRecommendedPrice(inputs, margin, marketing, tax);
if (price === null) {
  console.error("FAIL: no price");
  process.exit(1);
}

const modelB = buildModelBUnitMetrics(inputs, marketing, price, tax);
const afterTax = buildSmartPricingAfterTaxMetrics(inputs, marketing, tax, price);

const fakeRow = {
  productId: "x",
  supplierArticle: "TEST",
  productName: "Test",
  brandId: "b",
  brandName: "B",
  categoryId: "c",
  categoryName: "C",
  currentStock: 1,
  purchaseCost: 400,
  resolutionSource: "product",
  historicalLogistics: 80,
  effectiveLogistics: 80,
  storagePerUnit: 20,
  unitOutboundLogistics: 60,
  unitRebillLogistics: 20,
  historicalCompletedUnits: 10,
  productHistoricalLogistics: 80,
  categoryHistoricalLogistics: null,
  accountHistoricalLogistics: null,
  productHistoricalStoragePerUnit: 20,
  categoryHistoricalStoragePerUnit: null,
  accountHistoricalStoragePerUnit: null,
  marketplaceFeesPercent: 25,
  commissionPercent: 25,
  marketplaceFeesSource: "product",
  commissionSource: "product",
  completedSales: 10,
  productHistoricalMarketplaceFeesPercent: 25,
  categoryHistoricalMarketplaceFeesPercent: null,
  accountHistoricalMarketplaceFeesPercent: null,
  currentAvgPrice: price,
  hasSalesHistory: true,
  orders: 10,
  returnRatePercent: 0,
  excludedLogisticsPercent: 0,
  returnLogisticsPercent: 0,
  priceFor15: null,
  priceFor20: null,
  targetPrice: price,
  currentNetProfit: afterTax.finalNetProfit,
  currentMarginPercent: afterTax.finalMarginPercent,
  currentMarkupOnCostPercent: null,
  currentTax: afterTax.tax,
  differenceRub: 0,
  differencePercent: 0,
  status: "profitable",
  riskLevel: "low",
  riskLabel: "Low",
  riskTooltip: "",
};

const breakdown = buildSmartPricingCostBreakdown(fakeRow, marketing, tax);
const fails = [];

if (!breakdown) fails.push("no breakdown");
else {
  const byKey = Object.fromEntries(breakdown.rows.map((r) => [r.key, r]));

  // Expanded presentation (6.36.1): still Model B amounts only.
  const checks = [
    ["commission", modelB.commission, true],
    ["forwardLogistics", fakeRow.unitOutboundLogistics, false],
    ["returnLogistics", fakeRow.unitRebillLogistics, false],
    ["storage", modelB.storage, false],
    ["advertising", modelB.advertising, true],
    ["estimatedTax", afterTax.tax, true],
    ["productCost", modelB.productCost, false],
  ];

  for (const [key, amount, needsPct] of checks) {
    const row = byKey[key];
    if (!row) {
      fails.push(`missing ${key}`);
      continue;
    }
    if (Math.abs(row.amount - amount) > 1e-9) {
      fails.push(`${key} amount ${row.amount} ≠ engine ${amount}`);
    }
    if (needsPct && row.percent === null) fails.push(`${key} missing %`);
    if (!needsPct && row.percent !== null) fails.push(`${key} should not show %`);
  }

  if (breakdown.rows.some((r) =>
    ["finalNetProfit", "finalMargin", "markup"].includes(r.key)
  )) {
    fails.push("must not show Final NP / Margin / Markup");
  }
}

const priceAfter = solveRecommendedPrice(inputs, margin, marketing, tax);
if (priceAfter === null || Math.abs(price - priceAfter) > 1e-9) {
  fails.push("solver changed");
}

console.log("Sprint 6.34.5.1 — Cost breakdown hover");
if (breakdown) {
  for (const row of breakdown.rows) {
    console.log(
      `  ${row.label.padEnd(16)} ${row.amount.toFixed(2)} ₽` +
        (row.percent !== null ? `  ${row.percent.toFixed(1)}%` : "")
    );
  }
}

if (fails.length) {
  console.log("FAIL");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}

console.log("PASS");
console.log("✓ Amounts match existing Model B engine");
console.log("✓ Commission / Advertising / Tax show %");
console.log("✓ No Final Net Profit / Margin / Markup");
console.log("✓ Solver mathematics unchanged");
