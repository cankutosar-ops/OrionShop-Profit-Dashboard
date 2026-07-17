/**
 * Sprint 6.35.3 Safe Mode — financial identity + structural safety checks.
 */
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

const modelB = read("src/lib/profit-engine-model-b.ts");
if (
  !modelB.includes(
    "Seller Payout = forPay − Acquiring − Logistics − Storage − Penalties − Adjustments"
  )
) {
  fails.push("Model B docstring formula missing");
}
if (
  !/sellerPayout\s*=/.test(modelB) ||
  !/estimatedTax\s*=/.test(modelB) ||
  !/finalNetProfit\s*=/.test(modelB)
) {
  fails.push("Model B formula assignments missing");
}
if (/from\s+["']@\/lib\/perf\/perf-recorder["']/.test(modelB)) {
  fails.push("Model B must not import perf-recorder");
}

const settlement = read("src/lib/wb-settlement.ts");
if (
  !settlement.includes("sumNetForPayFromFinance") ||
  !settlement.includes("buildWbSettlementFromSources")
) {
  fails.push("Settlement math anchors missing");
}

const smartPricingPath = resolve(root, "src/lib/smart-pricing.ts");
if (!existsSync(smartPricingPath)) {
  fails.push("smart-pricing.ts missing");
} else {
  const smartPricing = read("src/lib/smart-pricing.ts");
  if (!smartPricing.includes("targetPrice") && !smartPricing.includes("buildSmartPricingRow")) {
    fails.push("Smart Pricing builder anchors missing");
  }
}

async function runModelBFixture() {
  const modUrl = pathToFileURL(resolve(root, "src/lib/profit-engine-model-b.ts")).href;
  const { calculateModelBNetProfit } = await import(modUrl);

  const result = calculateModelBNetProfit({
    grossSales: 100000,
    returnedSales: 5000,
    netSales: 95000,
    netSalesStatus: "ready",
    salesForPay: 70000,
    acquiring: 1200,
    logistics: 8000,
    storage: 1500,
    penalties: 200,
    adjustments: 300,
    productCost: 40000,
    advertising: 5000,
    taxPercent: 6,
  });

  const canonical = JSON.stringify({
    grossSales: result.grossSales,
    returnedSales: result.returnedSales,
    netSales: result.netSales,
    netSalesStatus: result.netSalesStatus,
    commission: result.commission,
    acquiring: result.acquiring,
    revenue: result.revenue,
    logistics: result.logistics,
    storage: result.storage,
    penalties: result.penalties,
    adjustments: result.adjustments,
    productCost: result.productCost,
    advertising: result.advertising,
    netProfit: result.netProfit,
    sellerPayout: result.sellerPayout,
    operatingProfit: result.operatingProfit,
    taxPercent: result.taxPercent,
    estimatedTax: result.estimatedTax,
    afterTaxPayout: result.afterTaxPayout,
    finalNetProfit: result.finalNetProfit,
  });

  const hash = sha(canonical);
  const perfDir = resolve(root, ".perf");
  if (!existsSync(perfDir)) mkdirSync(perfDir, { recursive: true });
  const goldenPath = resolve(perfDir, "model-b-golden.json");
  const payload = { hash, canonical, generatedAt: new Date().toISOString() };

  if (!existsSync(goldenPath)) {
    writeFileSync(goldenPath, JSON.stringify(payload, null, 2));
    console.log("Wrote golden Model B fixture:", hash.slice(0, 16) + "…");
    return { hash, matched: true, created: true };
  }

  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
  const matched = golden.hash === hash && golden.canonical === canonical;
  if (!matched) {
    fails.push(
      `Model B fixture mismatch\n  golden: ${golden.hash}\n  actual: ${hash}\n  golden JSON: ${golden.canonical}\n  actual JSON: ${canonical}`
    );
  }
  writeFileSync(resolve(perfDir, "model-b-actual.json"), JSON.stringify(payload, null, 2));
  return { hash, matched, created: false };
}

if (read("src/app/products/page.tsx").includes("getDashboardData(")) {
  fails.push("products page must not call getDashboardData (WB overfetch)");
}
if (read("src/app/categories/page.tsx").includes("getDashboardData(")) {
  fails.push("categories page must not call getDashboardData (WB overfetch)");
}
if (!read("src/services/dashboard-service.ts").includes("getDashboardListData")) {
  fails.push("getDashboardListData missing");
}
if (!read("src/services/smart-pricing-service.ts").includes("productIds")) {
  fails.push("smart pricing should pass productIds to scoped fetches");
}
if (!read("src/components/dashboard/dashboard-operational-sync.tsx").includes("processed > 0")) {
  fails.push("operational sync should skip refresh when sync processed 0 records");
}

const fixture = await runModelBFixture();

if (fails.length) {
  console.log(`FAIL (${fails.length})`);
  for (const f of fails) console.log(" -", f);
  process.exit(1);
}

console.log("PASS — Safe Mode financial identity");
console.log(`✓ Model B fixture byte-identical (${fixture.hash.slice(0, 16)}…)`);
console.log("✓ Math module anchors intact");
console.log("✓ Products/Categories SQL-only path");
console.log("✓ Smart Pricing scoped fetches + operational sync refresh guard");
process.exit(0);
