/**
 * Sprint 6.34.3 Final — Decision Console validation.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "1";
const USD_RATE = 80;

const {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  DEFAULT_TAX_PERCENT,
  buildSmartPricingRow,
  buildModelBUnitMetrics,
  buildSmartPricingAfterTaxMetrics,
  solveRecommendedPrice,
  verifyRecommendedPrice,
} = await import("../src/lib/smart-pricing.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { convertRubToUsd } = await import("../src/lib/smart-pricing-simulator.ts");
const {
  loadSmartPricingUiSettings,
  saveSmartPricingUiSettings,
} = await import("../src/lib/smart-pricing-ui-settings.ts");

if (
  DEFAULT_TARGET_MARGIN_PERCENT !== 15 ||
  DEFAULT_MARKETING_PERCENT !== 5 ||
  DEFAULT_TAX_PERCENT !== 6
) {
  console.error("FAIL defaults", {
    DEFAULT_TARGET_MARGIN_PERCENT,
    DEFAULT_MARKETING_PERCENT,
    DEFAULT_TAX_PERCENT,
  });
  process.exit(1);
}

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
};

saveSmartPricingUiSettings({
  targetMarginPercent: 18,
  marketingPercent: 7,
  taxPercent: 6,
  usdExchangeRate: USD_RATE,
});
const restored = loadSmartPricingUiSettings();
if (
  restored.targetMarginPercent !== 18 ||
  restored.marketingPercent !== 7 ||
  restored.taxPercent !== 6 ||
  Math.abs(restored.usdExchangeRate - USD_RATE) > 0.0001
) {
  console.error("FAIL settings restore", restored);
  process.exit(1);
}

const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);
if (!inputs) {
  console.error("FAIL: no inputs");
  process.exit(1);
}

const TAX = DEFAULT_TAX_PERCENT;
const MARKETING = DEFAULT_MARKETING_PERCENT;
const TARGET = DEFAULT_TARGET_MARGIN_PERCENT;

const withCost = inputs.filter(
  (r) =>
    r.purchaseCost !== null &&
    r.purchaseCost > 0 &&
    r.currentAvgPrice !== null &&
    r.currentAvgPrice > 0
);

let checked = 0;
let failed = 0;

for (const input of withCost.slice(0, 25)) {
  const row = buildSmartPricingRow(input, TARGET, MARKETING, TAX);
  const solver = {
    purchaseCost: input.purchaseCost,
    historicalLogistics: input.historicalLogistics,
    effectiveLogistics: input.historicalLogistics,
    storagePerUnit: input.storagePerUnit,
    marketplaceFeesPercent: input.marketplaceFeesPercent,
    commissionPercent: input.marketplaceFeesPercent,
  };

  // Model B operating unchanged
  const modelB = buildModelBUnitMetrics(solver, MARKETING, input.currentAvgPrice);
  const afterTax = buildSmartPricingAfterTaxMetrics(
    solver,
    MARKETING,
    TAX,
    input.currentAvgPrice
  );

  // Tax from forPay only
  const expectedTax = modelB.revenue * (TAX / 100);
  if (Math.abs(afterTax.tax - expectedTax) > 0.01) {
    console.error("FAIL tax ≠ forPay×rate", input.supplierArticle, afterTax.tax, expectedTax);
    failed += 1;
  }
  if (Math.abs(afterTax.finalNetProfit - (modelB.netProfit - expectedTax)) > 0.01) {
    console.error("FAIL final ≠ operating − tax", input.supplierArticle);
    failed += 1;
  }
  if (
    row.currentNetProfit === null ||
    Math.abs(row.currentNetProfit - afterTax.finalNetProfit) > 0.01
  ) {
    console.error("FAIL current NP after tax", input.supplierArticle);
    failed += 1;
  }

  const usd = convertRubToUsd(row.currentNetProfit, USD_RATE);
  if (usd === null || Math.abs(usd - row.currentNetProfit / USD_RATE) > 0.0001) {
    console.error("FAIL USD", input.supplierArticle);
    failed += 1;
  }

  // Recommended achieves target AFTER tax
  if (row.targetPrice !== null) {
    const v = verifyRecommendedPrice(solver, TARGET, MARKETING, row.targetPrice, TAX);
    if (Math.abs(v.marginPercent - TARGET) > 0.05) {
      console.error(
        "FAIL target margin after tax",
        input.supplierArticle,
        v.marginPercent,
        TARGET
      );
      failed += 1;
    }
  }

  const expect15 = solveRecommendedPrice(solver, 15, MARKETING, TAX);
  const expect20 = solveRecommendedPrice(solver, 20, MARKETING, TAX);
  const near = (a, b) =>
    a === null && b === null
      ? true
      : a !== null && b !== null && Math.abs(a - b) < 0.01;
  if (!near(row.priceFor15, expect15) || !near(row.priceFor20, expect20)) {
    console.error("FAIL scenarios", input.supplierArticle);
    failed += 1;
  }
  if ("priceFor10" in row) {
    console.error("FAIL 10% still present");
    failed += 1;
  }

  checked += 1;
}

console.log(`Account ${accountId}: checked ${checked}, failed ${failed}`);
console.log(
  `Defaults T=${DEFAULT_TARGET_MARGIN_PERCENT}% M=${DEFAULT_MARKETING_PERCENT}% Tax=${DEFAULT_TAX_PERCENT}%`
);
console.log(`Settings restored OK (USD=${restored.usdExchangeRate})`);
console.log(failed === 0 && checked > 0 ? "PASS" : "FAIL");
process.exit(failed === 0 && checked > 0 ? 0 : 1);
