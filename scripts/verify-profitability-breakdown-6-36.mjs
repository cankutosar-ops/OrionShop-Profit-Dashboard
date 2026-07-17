#!/usr/bin/env node
/**
 * Usage:
 *   npx tsx scripts/verify-profitability-breakdown-6-36.mjs --sample
 *   npx tsx scripts/verify-profitability-breakdown-6-36.mjs <accountId> <companyId> <from> <to> [brandId]
 */
import { getSampleDashboard } from "../src/lib/sample-data.ts";
import { getDashboardData } from "../src/services/dashboard-service.ts";

const args = process.argv.slice(2);
const tolerance = 0.01;
const sampleOnly = args[0] === "--sample";

function sum(rows, field) {
  return rows.reduce((total, row) => total + row[field], 0);
}

function verify(label, actual, expected) {
  const difference = actual - expected;
  const passed = Math.abs(difference) <= tolerance;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${label}: actual=${actual.toFixed(2)} expected=${expected.toFixed(2)} diff=${difference.toFixed(2)}`
  );
  return passed;
}

function reconcile(data, label) {
  const modelB = data.overview.modelBProfit;
  const categoryRevenue = sum(data.categories, "revenue");
  const categoryProfit = sum(data.categories, "finalNetProfit");
  const brandRevenue = sum(data.brands, "revenue");
  const brandProfit = sum(data.brands, "finalNetProfit");

  console.log(`\n=== ${label} ===`);
  console.log(
    `Dashboard Model B: revenue=${modelB.revenue.toFixed(2)} finalNetProfit=${modelB.finalNetProfit.toFixed(2)}`
  );
  console.log(`Rows: categories=${data.categories.length} brands=${data.brands.length}`);

  return [
    verify("categories revenue", categoryRevenue, modelB.revenue),
    verify("categories final net profit", categoryProfit, modelB.finalNetProfit),
    verify("brands revenue", brandRevenue, modelB.revenue),
    verify("brands final net profit", brandProfit, modelB.finalNetProfit),
    verify("category vs brand revenue", categoryRevenue, brandRevenue),
    verify("category vs brand final net profit", categoryProfit, brandProfit),
  ].every(Boolean);
}

async function main() {
  if (sampleOnly || args.length === 0) {
    if (!sampleOnly && args.length === 0) {
      console.log("No scope args — running --sample reconciliation.");
    }
    const ok = reconcile(getSampleDashboard(), "sample");
    process.exit(ok ? 0 : 1);
  }

  const [marketplaceAccountId, companyId, from, to, brandId] = args;
  if (!marketplaceAccountId || !companyId || !from || !to) {
    console.error(
      "Usage: npx tsx scripts/verify-profitability-breakdown-6-36.mjs --sample\n" +
        "   or: npx tsx scripts/verify-profitability-breakdown-6-36.mjs <accountId> <companyId> <from> <to> [brandId]"
    );
    process.exit(2);
  }

  const data = await getDashboardData({
    marketplaceAccountId,
    companyId,
    from,
    to,
    ...(brandId ? { brandId } : {}),
  });

  console.log(
    `Scope: account=${marketplaceAccountId} company=${companyId} ${from} → ${to}` +
      (brandId ? ` brand=${brandId}` : "")
  );
  const ok = reconcile(data, data.isSampleData ? "fallback-sample" : "live");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
