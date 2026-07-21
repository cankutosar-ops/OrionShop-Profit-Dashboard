#!/usr/bin/env node
/**
 * Sprint 6.46.1 — verify Inventory Intelligence foundation aggregation.
 *
 * Usage:
 *   npx tsx scripts/verify-inventory-intelligence-6-46-1.mjs [accountId] [from] [to]
 *
 * Optional env:
 *   AUDIT_ACCOUNT, AUDIT_FROM, AUDIT_TO, AUDIT_BRAND
 *
 * PASS criteria (static + live when Supabase configured):
 *   - Pure helpers: Stock Health buckets, Sales Share = orders/total, calendar days
 *   - Live: service returns rows with product + stock + distribution + health fields
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const {
  classifyStockHealth,
  calendarDaysBetween,
  aggregateSkuWarehouseDistribution,
  maxSaleDateByProduct,
  summarizeProductStock,
  buildInventoryIntelligenceRows,
} = await import("../src/lib/inventory-intelligence-aggregation.ts");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
}

console.log("\n=== Sprint 6.46.1 — Inventory Intelligence Foundation ===\n");

// --- Pure unit checks ---
assert(classifyStockHealth(0) === "Healthy", "0 days → Healthy");
assert(classifyStockHealth(7) === "Healthy", "7 days → Healthy");
assert(classifyStockHealth(8) === "Slow", "8 days → Slow");
assert(classifyStockHealth(30) === "Slow", "30 days → Slow");
assert(classifyStockHealth(31) === "At Risk", "31 days → At Risk");
assert(classifyStockHealth(60) === "At Risk", "60 days → At Risk");
assert(classifyStockHealth(61) === "Dead Stock", "61 days → Dead Stock");
assert(classifyStockHealth(null) === "Dead Stock", "null days → Dead Stock");

assert(calendarDaysBetween("2026-07-01", "2026-07-20") === 19, "calendar days 19");
assert(
  calendarDaysBetween("2026-07-01T00:00:00+00:00", "2026-07-20") === 19,
  "calendar days accepts ISO sale_date"
);

const dist = aggregateSkuWarehouseDistribution([
  { warehouse: "Коледино", quantity: 2, price_with_disc: 100, is_return: false, product_id: "p1" },
  { warehouse: "Коледино", quantity: 1, price_with_disc: 50, is_return: false, product_id: "p1" },
  { warehouse: "Подольск", quantity: 1, price_with_disc: 80, is_return: false, product_id: "p1" },
  { warehouse: null, quantity: 9, price_with_disc: 999, is_return: false, product_id: "p1" },
  { warehouse: "Коледино", quantity: 1, price_with_disc: 10, is_return: true, product_id: "p1" },
]);
const byName = Object.fromEntries(dist.map((r) => [r.warehouse, r]));
assert(byName["Коледино"]?.orders === 2, "Коледино orders=2 (returns/null ignored)");
assert(byName["Подольск"]?.orders === 1, "Подольск orders=1");
assert(
  Math.abs(byName["Коледино"].salesSharePercent - (2 / 3) * 100) < 0.01,
  "Sales Share = Orders share (2/3)"
);
assert(
  Math.abs(byName["Подольск"].salesSharePercent - (1 / 3) * 100) < 0.01,
  "Sales Share Подольск = 1/3"
);

const lastMap = maxSaleDateByProduct([
  { product_id: "p1", sale_date: "2026-06-01", is_return: false },
  { product_id: "p1", sale_date: "2026-07-10T00:00:00+00:00", is_return: false },
  { product_id: "p1", sale_date: "2026-07-15", is_return: true },
]);
assert(lastMap.get("p1") === "2026-07-10", "MAX(sale_date) normalizes ISO + ignores returns");

const stockSum = summarizeProductStock([
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "M",
    barcode: null,
    warehouse: "Коледино",
    availableStock: 3,
    currentStock: 5,
    reservedStock: 2,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "L",
    barcode: null,
    warehouse: "Подольск",
    availableStock: 1,
    currentStock: 2,
    reservedStock: 1,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "S",
    barcode: null,
    warehouse: "Коледино",
    availableStock: 0,
    currentStock: 1,
    reservedStock: 1,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
]);
assert(stockSum.currentStock === 8, "currentStock sums quantity_full");
assert(stockSum.warehouseCount === 2, "warehouseCount = distinct warehouses");

const built = buildInventoryIntelligenceRows({
  products: [
    {
      productId: "p1",
      sku: "SKU1",
      productName: "Test",
      nmId: 12345678,
      brandId: "b1",
      brandName: "Brand",
      categoryId: "c1",
      categoryName: "Cat",
    },
  ],
  stockByProduct: new Map([
    [
      "p1",
      [
        {
          productId: "p1",
          marketplaceAccountId: "1",
          techSize: "M",
          barcode: null,
          warehouse: "Коледино",
          availableStock: 3,
          currentStock: 5,
          reservedStock: 2,
          syncedAt: null,
          nmId: null,
          supplierArticle: "SKU1",
        },
      ],
    ],
  ]),
  salesByProduct: new Map([
    [
      "p1",
      [
        {
          warehouse: "Коледино",
          quantity: 1,
          price_with_disc: 100,
          is_return: false,
          product_id: "p1",
          sale_date: "2026-07-01",
        },
      ],
    ],
  ]),
  lastSaleByProduct: new Map([["p1", "2026-07-01"]]),
  asOfDate: "2026-07-20",
});
assert(built.length === 1, "builds one SKU row");
assert(built[0].daysSinceLastSale === 19, "daysSinceLastSale from sale_date");
assert(built[0].stockHealth === "Slow", "19 days → Slow");
assert(built[0].warehouseDistribution[0].salesSharePercent === 100, "single warehouse 100% share");

if (failed > 0) {
  console.error(`\nSTATIC FAIL (${failed} assertions)`);
  process.exit(1);
}
console.log("\nSTATIC PASS\n");

// --- Live service check (optional if env missing) ---
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log("LIVE SKIP — Supabase env not configured");
  console.log("OVERALL: PASS (static only)");
  process.exit(0);
}

const accountId = process.argv[2] ?? process.env.AUDIT_ACCOUNT ?? "1";
const from = process.argv[3] ?? process.env.AUDIT_FROM ?? "2026-06-20";
const to = process.argv[4] ?? process.env.AUDIT_TO ?? "2026-07-20";
const brandId = process.env.AUDIT_BRAND || undefined;

const { getInventoryIntelligence } = await import(
  "../src/services/inventory-intelligence-service.ts"
);

const scope = {
  from,
  to,
  marketplaceAccountId: String(accountId),
  companyId: process.env.AUDIT_COMPANY ?? "1",
  brandId,
};

console.log(`Live scope: account=${accountId} ${from}→${to}${brandId ? ` brand=${brandId}` : ""}`);

const report = await getInventoryIntelligence(scope);
if (!report) {
  console.error("LIVE FAIL — null report (Supabase not configured in service?)");
  process.exit(1);
}

console.log(
  `Rows: ${report.rows.length} · distributionSales=${report.distributionSalesRowCount} · lastSaleSales=${report.lastSaleSalesRowCount} · ${report.loadTimeMs}ms`
);

let liveFail = 0;
for (const row of report.rows.slice(0, 50)) {
  if (!row.sku) {
    console.error("LIVE FAIL: missing sku", row.productId);
    liveFail += 1;
  }
  const shareSum = row.warehouseDistribution.reduce((s, w) => s + w.salesSharePercent, 0);
  if (row.warehouseDistribution.length > 0 && (shareSum < 99.5 || shareSum > 100.5)) {
    console.error(`LIVE FAIL: Sales Share sum ${shareSum} for ${row.sku}`);
    liveFail += 1;
  }
  if (row.lastSaleDate && (row.daysSinceLastSale == null || !Number.isFinite(row.daysSinceLastSale))) {
    console.error(`LIVE FAIL: lastSaleDate without finite days for ${row.sku} (${row.lastSaleDate})`);
    liveFail += 1;
  }
  if (row.lastSaleDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.lastSaleDate)) {
    console.error(`LIVE FAIL: lastSaleDate not YYYY-MM-DD for ${row.sku}: ${row.lastSaleDate}`);
    liveFail += 1;
  }
  if (!["Healthy", "Slow", "At Risk", "Dead Stock"].includes(row.stockHealth)) {
    console.error(`LIVE FAIL: bad stockHealth ${row.stockHealth}`);
    liveFail += 1;
  }
}

const sample = report.rows.slice(0, 5).map((r) => ({
  sku: r.sku,
  stock: r.currentStock,
  warehouses: r.warehouseCount,
  lastSale: r.lastSaleDate,
  days: r.daysSinceLastSale,
  health: r.stockHealth,
  dist: r.warehouseDistribution.slice(0, 3).map((w) => ({
    warehouse: w.warehouse,
    orders: w.orders,
    share: Number(w.salesSharePercent.toFixed(1)),
  })),
}));
console.log("Sample:", JSON.stringify(sample, null, 2));

mkdirSync(resolve("exports"), { recursive: true });
const outPath = resolve("exports/verify-inventory-intelligence-6-46-1.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      scope,
      asOfDate: report.asOfDate,
      loadTimeMs: report.loadTimeMs,
      rowCount: report.rows.length,
      distributionSalesRowCount: report.distributionSalesRowCount,
      lastSaleSalesRowCount: report.lastSaleSalesRowCount,
      healthCounts: report.rows.reduce((acc, r) => {
        acc[r.stockHealth] = (acc[r.stockHealth] ?? 0) + 1;
        return acc;
      }, {}),
      sample,
    },
    null,
    2
  ),
  "utf8"
);
console.log(`Wrote ${outPath}`);

// Sanity: also peek DB for one account product count
const sb = createClient(url, key);
const { count } = await sb
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("marketplace_account_id", accountId);
console.log(`DB products for account: ${count ?? "?"}`);

if (liveFail > 0) {
  console.error(`\nLIVE FAIL (${liveFail})`);
  process.exit(1);
}

console.log("\nLIVE PASS");
console.log("OVERALL: PASS");
