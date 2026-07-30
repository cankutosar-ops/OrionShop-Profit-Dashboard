/**
 * Sprint 6.34.5 — UX revamp validation (no Model B math changes).
 * Confirms calc breakdown is presentation-only (solver output unchanged).
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
  buildSmartPricingAfterTaxMetrics,
  DEFAULT_TAX_PERCENT,
} = await import("../src/lib/smart-pricing.ts");
const { buildSmartPricingCostBreakdown } = await import(
  "../src/lib/smart-pricing-calc-breakdown.ts"
);
const { SIDEBAR_COLLAPSED_STORAGE_KEY } = await import("../src/lib/sidebar-state.ts");

const inputs = {
  purchaseCost: 400,
  historicalLogistics: 80,
  effectiveLogistics: 80,
  storagePerUnit: 20,
  marketplaceFeesPercent: 25,
  commissionPercent: 25,
  finishedPriceRatio: 1,
};

const marketing = 5;
const tax = DEFAULT_TAX_PERCENT;
const margin = 15;

const priceBefore = solveRecommendedPrice(inputs, margin, marketing, tax);
const metricsBefore = buildSmartPricingAfterTaxMetrics(inputs, marketing, tax, priceBefore);

// Call presentation helper with a synthetic row shape
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
  finishedPriceRatio: 1,
  marketplaceFeesSource: "product",
  commissionSource: "product",
  completedSales: 10,
  productHistoricalMarketplaceFeesPercent: 25,
  categoryHistoricalMarketplaceFeesPercent: null,
  accountHistoricalMarketplaceFeesPercent: null,
  currentAvgPrice: priceBefore,
  hasSalesHistory: true,
  orders: 10,
  returnRatePercent: 0,
  excludedLogisticsPercent: 0,
  returnLogisticsPercent: 0,
  priceFor15: null,
  priceFor20: null,
  targetPrice: priceBefore,
  currentNetProfit: metricsBefore.finalNetProfit,
  currentMarginPercent: metricsBefore.finalMarginPercent,
  currentMarkupOnCostPercent: null,
  currentTax: metricsBefore.tax,
  differenceRub: 0,
  differencePercent: 0,
  status: "profitable",
  riskLevel: "low",
  riskLabel: "Low",
  riskTooltip: "",
};

buildSmartPricingCostBreakdown(fakeRow, marketing, tax);

const priceAfter = solveRecommendedPrice(inputs, margin, marketing, tax);
const metricsAfter = buildSmartPricingAfterTaxMetrics(inputs, marketing, tax, priceAfter);

const fails = [];
if (SIDEBAR_COLLAPSED_STORAGE_KEY !== "orionshop.sidebar.collapsed") {
  fails.push("sidebar storage key mismatch");
}
if (priceBefore === null || Math.abs(priceBefore - priceAfter) > 1e-9) {
  fails.push(`solver price changed: ${priceBefore} → ${priceAfter}`);
}
if (Math.abs(metricsBefore.finalNetProfit - metricsAfter.finalNetProfit) > 1e-9) {
  fails.push("final net profit changed after breakdown call");
}
if (Math.abs(metricsBefore.tax - metricsAfter.tax) > 1e-9) {
  fails.push("tax changed after breakdown call");
}

console.log("Sprint 6.34.5 — UX / math isolation check");
console.log(`  Recommended P*: ${priceBefore?.toFixed(2)} ₽`);
console.log(`  Final NP: ${metricsBefore.finalNetProfit.toFixed(2)} ₽`);
console.log(`  Tax: ${metricsBefore.tax.toFixed(2)} ₽`);

if (fails.length) {
  console.log("FAIL");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}

console.log("PASS");
console.log("✓ Sidebar persistence key present");
console.log("✓ Calc breakdown does not alter Model B / Smart Pricing mathematics");
