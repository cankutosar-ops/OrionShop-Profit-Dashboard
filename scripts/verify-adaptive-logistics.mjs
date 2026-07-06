/**
 * Sprint 6.6 — verify adaptive logistics resolution.
 * Usage: npx tsx scripts/verify-adaptive-logistics.mjs [accountId]
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

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const {
  SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES,
  sumProductLogisticsMetrics,
  weightedEffectiveLogistics,
} = await import("../src/lib/smart-pricing-logistics.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);
if (!inputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

console.log("=== Sprint 6.6 Adaptive Logistics Verification ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Product threshold:", SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES, "units");
console.log("Products in Smart Pricing:", inputs.length);
console.log("");

const bySource = {
  PRODUCT_HISTORY: [],
  CATEGORY_HISTORY: [],
  ACCOUNT_HISTORY: [],
};

for (const row of inputs) {
  bySource[row.logisticsSource]?.push(row);
}

for (const [source, rows] of Object.entries(bySource)) {
  console.log(`${source}: ${rows.length} products`);
}

console.log("");
console.log(
  [
    "Model".padEnd(16),
    "Units".padStart(6),
    "ProductLog".padStart(11),
    "CategoryLog".padStart(12),
    "Effective".padStart(11),
    "Source".padEnd(18),
    "BucketUnits".padStart(12),
  ].join(" ")
);
console.log("-".repeat(95));

const lowVolume = inputs
  .filter((r) => r.purchaseCost !== null && r.hasSalesHistory)
  .sort((a, b) => a.logisticsCompletedUnits - b.logisticsCompletedUnits)
  .slice(0, 15);

for (const row of lowVolume) {
  const productRaw =
    row.unitPurchaseLogistics + row.unitExcludedLogistics;
  console.log(
    [
      row.supplierArticle.slice(0, 16).padEnd(16),
      String(row.completedSales).padStart(6),
      productRaw.toFixed(2).padStart(11),
      (row.categoryHistoricalEffectiveLogistics ?? 0).toFixed(2).padStart(12),
      row.effectiveLogistics.toFixed(2).padStart(11),
      row.logisticsSource.padEnd(18),
      String(row.logisticsCompletedUnits).padStart(12),
    ].join(" ")
  );
}

console.log("");
const highVolume = inputs.filter(
  (r) =>
    r.purchaseCost !== null &&
    r.completedSales >= SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES
);

let preserved = 0;
let mismatches = 0;
for (const row of highVolume) {
  const productEffective = row.productHistoricalEffectiveLogistics;
  if (
    productEffective !== null &&
    Math.abs(productEffective - row.effectiveLogistics) < 0.01
  ) {
    preserved += 1;
  } else {
    mismatches += 1;
    console.log(
      `MISMATCH ${row.supplierArticle}: product=${productEffective?.toFixed(2)} effective=${row.effectiveLogistics.toFixed(2)} source=${row.logisticsSource}`
    );
  }
}

console.log(
  `High-volume products (>= ${SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES} units): ${highVolume.length}`
);
console.log(`Preserved product-level logistics: ${preserved}`);
console.log(`Mismatches: ${mismatches}`);

const arisi = inputs.find((r) => r.supplierArticle === "ARISIYAH01");
if (arisi) {
  console.log("");
  console.log("ARISIYAH01 spot check:");
  console.log(
    JSON.stringify(
      {
        productRawPerUnit: arisi.unitPurchaseLogistics + arisi.unitExcludedLogistics,
        effectiveLogistics: arisi.effectiveLogistics,
        logisticsSource: arisi.logisticsSource,
        logisticsCompletedUnits: arisi.logisticsCompletedUnits,
        categoryHistorical: arisi.categoryHistoricalEffectiveLogistics,
        accountHistorical: arisi.accountHistoricalEffectiveLogistics,
      },
      null,
      2
    )
  );
}

console.log("");
console.log("Done.");
