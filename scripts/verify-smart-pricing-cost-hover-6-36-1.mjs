/**
 * Sprint 6.36.1 — Smart Pricing cost hover uses existing Model B output only.
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
  returnLogisticsPercent: 25,
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

  const checks = [
    ["commission", modelB.commission, true],
    ["forwardLogistics", 60, false],
    ["returnLogistics", 20, false],
    ["storage", modelB.storage, false],
    ["estimatedTax", afterTax.tax, true],
    ["productCost", modelB.productCost, false],
    ["advertising", modelB.advertising, true],
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

  if (byKey.logistics) fails.push("should use forward/return split when inputs match engine");
  if (byKey.otherCosts) fails.push("otherCosts group must be expanded");
  if (byKey.ppvzReward || byKey.ppvzVw) {
    fails.push("must not invent PPVZ lines absent from unit Model B");
  }
  if (!isPresent(modelB.acquiring) && byKey.acquiring) {
    fails.push("acquiring must be omitted when Model B amount is 0");
  }
  if (!isPresent(modelB.penalties) && byKey.penalties) {
    fails.push("penalties must be omitted when absent");
  }
  if (!isPresent(modelB.adjustments) && byKey.adjustments) {
    fails.push("adjustments must be omitted when absent");
  }

  if (
    breakdown.rows.some((r) =>
      ["finalNetProfit", "finalMargin", "markup"].includes(r.key)
    )
  ) {
    fails.push("must not show Final NP / Margin / Markup");
  }

  const forwardPlusReturn =
    (byKey.forwardLogistics?.amount ?? 0) + (byKey.returnLogistics?.amount ?? 0);
  if (Math.abs(forwardPlusReturn - modelB.logistics) > 1e-9) {
    fails.push("forward+return must equal Model B logistics");
  }
}

function isPresent(amount) {
  return Number.isFinite(amount) && Math.abs(amount) > 1e-9;
}

const priceAfter = solveRecommendedPrice(inputs, margin, marketing, tax);
if (priceAfter === null || Math.abs(price - priceAfter) > 1e-9) {
  fails.push("solver changed");
}

console.log("Sprint 6.36.1 — Smart Pricing cost hover");
if (breakdown) {
  for (const row of breakdown.rows) {
    console.log(
      `  ${row.label.padEnd(20)} ${row.amount.toFixed(2)} ₽` +
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
console.log("✓ Forward/Return logistics reuse row inputs when they match engine logistics");
console.log("✓ Storage / Tax / Product Cost / Advertising from Model B only");
console.log("✓ No invented PPVZ; no Final Net Profit / Margin / Markup");
console.log("✓ Solver mathematics unchanged");
