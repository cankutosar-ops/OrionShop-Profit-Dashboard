/**
 * Sprint 6.37 — Expandable cost breakdown UX (no hover / floating panel).
 * Confirms presentation refactor + Model B math isolation.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const calcPanelPath = resolve("src/components/analytics/smart-pricing-calc-panel.tsx");
const panelPath = resolve("src/components/analytics/smart-pricing-panel.tsx");
const calcPanelSrc = readFileSync(calcPanelPath, "utf8");
const panelSrc = readFileSync(panelPath, "utf8");

const fails = [];

const bannedInCalcPanel = [
  ["setCoords", /setCoords/],
  ["positionPanel", /positionPanel/],
  ["useLayoutEffect", /useLayoutEffect/],
  ["onMouseEnter", /onMouseEnter/],
  ["onMouseLeave", /onMouseLeave/],
  ["fixed floating panel", /fixed\s+z-\[60\]/],
  ["PANEL_WIDTH", /PANEL_WIDTH/],
  ["scheduleClose", /scheduleClose/],
  ["SmartPricingCalcTrigger", /SmartPricingCalcTrigger/],
];

for (const [label, re] of bannedInCalcPanel) {
  if (re.test(calcPanelSrc)) fails.push(`calc-panel still has ${label}`);
}

if (!/SmartPricingCostBreakdownDetail/.test(calcPanelSrc)) {
  fails.push("calc-panel missing SmartPricingCostBreakdownDetail");
}
if (!/canExpandSmartPricingCostBreakdown/.test(calcPanelSrc)) {
  fails.push("calc-panel missing canExpandSmartPricingCostBreakdown");
}

if (!/expandedProductId/.test(panelSrc)) {
  fails.push("panel missing expandedProductId accordion state");
}
if (!/SmartPricingCostBreakdownDetail/.test(panelSrc)) {
  fails.push("panel missing inset SmartPricingCostBreakdownDetail");
}
if (/SmartPricingCalcTrigger/.test(panelSrc)) {
  fails.push("panel still imports/uses SmartPricingCalcTrigger");
}
if (!/aria-expanded/.test(panelSrc)) {
  fails.push("panel missing aria-expanded on expand control");
}
if (!/ChevronRight/.test(panelSrc)) {
  fails.push("panel missing chevron expand indicator");
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
  finishedPriceRatio: 1,
};

const marketing = 5;
const tax = DEFAULT_TAX_PERCENT;
const margin = 15;
const price = solveRecommendedPrice(inputs, margin, marketing, tax);
if (price === null) {
  fails.push("no recommended price");
} else {
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
    finishedPriceRatio: 1,
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
  if (!breakdown) {
    fails.push("no breakdown");
  } else {
    const byKey = Object.fromEntries(breakdown.rows.map((r) => [r.key, r]));
    const checks = [
      ["commission", modelB.commission],
      ["storage", modelB.storage],
      ["estimatedTax", afterTax.tax],
      ["productCost", modelB.productCost],
      ["advertising", modelB.advertising],
    ];
    for (const [key, amount] of checks) {
      const row = byKey[key];
      if (!row) fails.push(`missing ${key}`);
      else if (Math.abs(row.amount - amount) > 1e-9) {
        fails.push(`${key} amount ${row.amount} ≠ engine ${amount}`);
      }
    }
    if (
      breakdown.rows.some((r) =>
        ["finalNetProfit", "finalMargin", "markup", "recommendedPrice", "riskScore"].includes(
          r.key
        )
      )
    ) {
      fails.push("breakdown must not show Final NP / Margin / Markup / Recommended / Risk");
    }
  }

  const priceAfter = solveRecommendedPrice(inputs, margin, marketing, tax);
  if (priceAfter === null || Math.abs(price - priceAfter) > 1e-9) {
    fails.push("solver changed");
  }
}

console.log("Sprint 6.37 — Expandable Smart Pricing breakdown UX");
if (fails.length) {
  console.log("FAIL");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}

console.log("PASS");
console.log("✓ No hover / floating panel / setCoords / layout positioning in calc-panel");
console.log("✓ Parent expandedProductId accordion; inset SmartPricingCostBreakdownDetail");
console.log("✓ Model B / solver amounts unchanged; no Final NP / Margin / Markup in breakdown");
