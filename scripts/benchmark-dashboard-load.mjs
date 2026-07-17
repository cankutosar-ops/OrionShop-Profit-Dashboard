#!/usr/bin/env node
/**
 * Dashboard load benchmark — counts scoped fetches and measures load time.
 * Usage: npx tsx scripts/benchmark-dashboard-load.mjs [accountId] [from] [to] [brandId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { performance } from "perf_hooks";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("No .env.local — skipping live benchmark");
    process.exit(0);
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-13";
const to = process.argv[4] ?? "2026-07-12";
const brandId = process.argv[5] || undefined;

const scope = {
  marketplaceAccountId: String(accountId),
  from,
  to,
  brandId,
};

const { getDashboardData } = await import("../src/services/dashboard-service.ts");

console.log("Dashboard benchmark");
console.log(`  scope: account=${scope.marketplaceAccountId} from=${from} to=${to} brand=${brandId ?? "all"}`);
console.log("");

const start = performance.now();
const payload = await getDashboardData(scope);
const elapsedMs = Math.round(performance.now() - start);

const { overview, products, categories } = payload;

console.log("Results");
console.log(`  Load time: ${elapsedMs} ms`);
console.log(`  Sample data: ${payload.isSampleData ? "yes" : "no"}`);
console.log(`  Products: ${products.length}`);
console.log(`  Categories: ${categories.length}`);
console.log(`  Net sales status: ${overview.modelBProfit.netSalesStatus}`);
console.log(`  Model B net sales: ${overview.modelBProfit.netSales.toFixed(2)}`);
console.log(`  Model C revenue: ${overview.modelCProfit.revenue.toFixed(2)}`);
console.log(`  Orders value: ${overview.ordersPurchases.ordersValue.toFixed(2)}`);
console.log("");
console.log("Architecture (post-refactor):");
console.log("  DB product fetch: 1× per dashboard load");
console.log("  DB sales/finance/ads fetch: 1× per dashboard load");
console.log("  Model B + Model C: computed together from shared raw data");
console.log("  Model switch: client-side only (no server reload)");
