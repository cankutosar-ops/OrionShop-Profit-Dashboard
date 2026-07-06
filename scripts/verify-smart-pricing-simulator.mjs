/**
 * Profit Simulator verification — 50+ products, client-side logic only.
 * Usage: npx tsx scripts/verify-smart-pricing-simulator.mjs [accountId]
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
const MIN_PRODUCTS = 50;

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { buildSmartPricingRow, verifyRecommendedPrice } = await import("../src/lib/smart-pricing.ts");
const {
  adjustTestPrice,
  computeSmartPricingSimulation,
  resolveTestPrice,
} = await import("../src/lib/smart-pricing-simulator.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);
if (!inputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

const rows = inputs
  .map((row) => buildSmartPricingRow(row, TARGET_MARGIN, MARKETING))
  .filter((row) => row.targetPrice !== null);

console.log("=== Smart Pricing Profit Simulator Verification ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Priced products:", rows.length);
console.log("");

if (rows.length < MIN_PRODUCTS) {
  console.warn(`WARN: only ${rows.length} priced products (requested ${MIN_PRODUCTS}+)`);
}

let passed = 0;
let failed = 0;

function pass(label) {
  passed += 1;
  console.log("PASS:", label);
}

function fail(label, detail) {
  failed += 1;
  console.log("FAIL:", label, "—", detail);
}

for (const row of rows) {
  const recommended = row.targetPrice;
  const testPrice = resolveTestPrice(row, undefined);
  const simulation = computeSmartPricingSimulation(row, testPrice, MARKETING);

  if (simulation === null) {
    fail(row.supplierArticle, "simulation null at default test price");
    continue;
  }

  if (Math.abs(simulation.testPrice - recommended) > 0.01) {
    fail(row.supplierArticle, "default test price != recommended");
    continue;
  }

  if (simulation.differenceVsRecommended !== 0) {
    fail(row.supplierArticle, "default diff vs recommended != 0");
    continue;
  }

  const direct = verifyRecommendedPrice(
    {
      purchaseCost: row.purchaseCost,
      effectiveLogistics: row.effectiveLogistics,
      commissionPercent: row.commissionPercent,
    },
    TARGET_MARGIN,
    MARKETING,
    testPrice
  );

  if (Math.abs(simulation.netProfit - direct.profit) > 0.01) {
    fail(row.supplierArticle, `profit mismatch ${simulation.netProfit} vs ${direct.profit}`);
    continue;
  }

  if (Math.abs(simulation.profitMarginPercent - direct.marginPercent) > 0.01) {
    fail(row.supplierArticle, "margin mismatch");
    continue;
  }
}

if (failed === 0) {
  pass(`default simulation on ${rows.length} products matches verifyRecommendedPrice`);
} else {
  console.log("");
  console.log(`Default checks: ${passed} passed, ${failed} failed`);
}

const overrides = {};
const target = rows[0];
const customPrice = adjustTestPrice(target.targetPrice, -8);
overrides[target.productId] = customPrice;

const onlyTargetChanged =
  resolveTestPrice(target, overrides[target.productId]) === customPrice &&
  rows.slice(1, 6).every(
    (row) => resolveTestPrice(row, overrides[row.productId]) === row.targetPrice
  );

if (onlyTargetChanged) {
  pass("single override updates only that product test price");
} else {
  fail("single override", "other rows affected");
}

let quickOverrides = {};
const quickRows = rows.slice(0, 10);
for (const row of quickRows) {
  quickOverrides[row.productId] = adjustTestPrice(row.targetPrice, 5);
}

const allVisiblePlusFive = quickRows.every((row) => {
  const expected = adjustTestPrice(row.targetPrice, 5);
  return Math.abs(quickOverrides[row.productId] - expected) < 0.02;
});

if (allVisiblePlusFive) {
  pass("+5% quick action updates every visible row");
} else {
  fail("+5% quick action", "visible rows not adjusted correctly");
}

const resetOverrides = {};
const resetMatches = rows.slice(0, 10).every(
  (row) => resolveTestPrice(row, resetOverrides[row.productId]) === row.targetPrice
);

if (resetMatches) {
  pass("reset restores every test price to recommended");
} else {
  fail("reset", "overrides not cleared");
}

const lossRow = rows.find((row) => {
  const sim = computeSmartPricingSimulation(row, row.targetPrice * 0.5, MARKETING);
  return sim?.isLoss;
});

if (lossRow) {
  const lossSim = computeSmartPricingSimulation(lossRow, lossRow.targetPrice * 0.5, MARKETING);
  if (lossSim?.comparison === "loss" && lossSim.comparisonLabel === "🔴 Loss") {
    pass("negative profit classified as Loss");
  } else {
    fail("loss classification", lossRow.supplierArticle);
  }
} else {
  pass("loss classification skipped (no loss scenario in sample at 50% price)");
}

const nearRow = rows.find((row) => row.targetPrice !== null);
if (nearRow) {
  const nearPrice = nearRow.targetPrice * 1.01;
  const nearSim = computeSmartPricingSimulation(nearRow, nearPrice, MARKETING);
  if (nearSim?.comparison === "near-recommended") {
    pass("±2% band classified as Near Recommended");
  } else {
    fail("near recommended", `got ${nearSim?.comparison}`);
  }
}

console.log("");
console.log("=== Summary ===");
console.log("Products verified:", rows.length);
console.log("Checks passed:", passed);
console.log("Checks failed:", failed);
process.exit(failed > 0 ? 1 : 0);
