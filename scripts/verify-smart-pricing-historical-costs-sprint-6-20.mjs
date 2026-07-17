#!/usr/bin/env node
/**
 * Sprint 6.20 — Smart Pricing historical cost engine validation.
 * Usage: npx tsx scripts/verify-smart-pricing-historical-costs-sprint-6-20.mjs [accountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { getSmartPricingInputs } from "../src/services/smart-pricing-service.ts";
import {
  applySmartPricingCommissionSettings,
  formatCommissionSourceLabel,
} from "../src/lib/smart-pricing-settings.ts";
import { buildSmartPricingRow, solveRecommendedPrice } from "../src/lib/smart-pricing.ts";
import { formatHistoricalSourceLabel } from "../src/lib/smart-pricing-historical-costs.ts";

const accountId = process.argv[2] ?? "1";
const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);

if (!inputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

const withCost = inputs.filter((row) => row.purchaseCost !== null);
const skuExample = withCost.find((row) => row.resolutionSource === "PRODUCT_HISTORY");
const categoryExample = withCost.find((row) => row.resolutionSource === "CATEGORY_HISTORY");
const accountExample = withCost.find((row) => row.resolutionSource === "ACCOUNT_HISTORY");

function printExample(label, row) {
  if (!row) {
    console.log(`\n=== ${label} — not found in period ===`);
    return;
  }
  const computed = buildSmartPricingRow(row, 30, 15);
  const solver = {
    purchaseCost: row.purchaseCost,
    historicalLogistics: row.historicalLogistics,
    effectiveLogistics: row.historicalLogistics,
    storagePerUnit: row.storagePerUnit,
    marketplaceFeesPercent: row.marketplaceFeesPercent,
    commissionPercent: row.marketplaceFeesPercent,
  };
  const price = solveRecommendedPrice(solver, 30, 15);

  console.log(`\n=== ${label}: ${row.supplierArticle} ===`);
  console.log(`Resolution Source:     ${formatHistoricalSourceLabel(row.resolutionSource)}`);
  console.log(`Completed units:       ${row.historicalCompletedUnits}`);
  console.log(`Marketplace Fees:      ${row.marketplaceFeesPercent.toFixed(2)}%`);
  console.log(`Historical Logistics:  ${row.historicalLogistics.toFixed(2)} ₽/unit`);
  console.log(`  outbound:            ${row.unitOutboundLogistics.toFixed(2)} ₽/unit`);
  console.log(`  rebill:              ${row.unitRebillLogistics.toFixed(2)} ₽/unit`);
  console.log(`Storage:               ${row.storagePerUnit.toFixed(2)} ₽/unit`);
  console.log(`Purchase Cost:         ${row.purchaseCost?.toFixed(2)} ₽`);
  console.log(`Recommended Price:     ${price !== null ? `${price.toFixed(2)} ₽` : "—"}`);
  console.log(`Status:                ${computed.status}`);
}

console.log("Sprint 6.20 — Smart Pricing Historical Cost Validation");
console.log(`Account ${accountId} | ${scope.from} → ${scope.to}`);
console.log(`Products with cost: ${withCost.length}`);

const sourceCounts = withCost.reduce(
  (acc, row) => {
    acc[row.resolutionSource] = (acc[row.resolutionSource] ?? 0) + 1;
    return acc;
  },
  {}
);
console.log("Resolution sources:", sourceCounts);

printExample("SKU source", skuExample);
printExample("CATEGORY source", categoryExample);
printExample("ACCOUNT source", accountExample);

const lowVolume = withCost.find((row) => row.completedSales < 20);
if (lowVolume) {
  const forcedCategory = applySmartPricingCommissionSettings(lowVolume, {
    minProductSales: 20,
    minCategorySales: 50,
    commissionWindow: "range",
  });
  console.log(`\n=== Inheritance check: ${lowVolume.supplierArticle} (${lowVolume.completedSales} sales) ===`);
  console.log(`Before: ${formatHistoricalSourceLabel(lowVolume.resolutionSource)}`);
  console.log(`After settings apply: ${formatHistoricalSourceLabel(forcedCategory.resolutionSource)}`);
  console.log(
    forcedCategory.resolutionSource !== "PRODUCT_HISTORY"
      ? "PASS — low-volume SKU inherits category/account"
      : "INFO — still SKU (category may also be insufficient)"
  );
}

const highVolume = withCost.find(
  (row) => row.completedSales >= 20 && row.resolutionSource === "PRODUCT_HISTORY"
);
if (highVolume) {
  console.log(`\n=== Sufficient history: ${highVolume.supplierArticle} (${highVolume.completedSales} sales) ===`);
  console.log(`Source: ${formatHistoricalSourceLabel(highVolume.resolutionSource)}`);
  console.log(
    highVolume.resolutionSource === "PRODUCT_HISTORY"
      ? "PASS — sufficient SKU history uses product data"
      : "FAIL"
  );
}

let emptyValues = 0;
for (const row of withCost) {
  if (!Number.isFinite(row.historicalLogistics)) emptyValues += 1;
  if (!Number.isFinite(row.storagePerUnit)) emptyValues += 1;
  if (!Number.isFinite(row.marketplaceFeesPercent)) emptyValues += 1;
}
console.log(`\nEmpty historical values: ${emptyValues === 0 ? "PASS (0)" : `FAIL (${emptyValues})`}`);

if (!skuExample && !categoryExample && !accountExample) {
  process.exit(1);
}
