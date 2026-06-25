#!/usr/bin/env node
/**
 * Validates inventory intelligence against live wb_stock + SKU analytics.
 * Usage: node scripts/verify-inventory-intelligence.mjs [supplier_article]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.env.AUDIT_FROM || "2026-05-25";
const to = process.env.AUDIT_TO || "2026-06-24";
const skuFilter = process.argv[2] || "ALEXASIYAH01";
const targetDays = Number(process.env.TARGET_DAYS || 60);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Supabase not configured");
  process.exit(1);
}

const sb = createClient(url, key);

const { data: products, error: productError } = await sb
  .from("products")
  .select("id, supplier_article, nm_id")
  .eq("supplier_article", skuFilter)
  .limit(1);

if (productError || !products?.length) {
  console.error("Product not found:", skuFilter, productError?.message);
  process.exit(1);
}

const product = products[0];
const productId = String(product.id);

const { data: stockRows } = await sb
  .from("wb_stock")
  .select("*")
  .eq("product_id", productId);

console.log(`\n=== Inventory Intelligence Validation: ${skuFilter} ===`);
console.log(`Period: ${from} → ${to} · Target days: ${targetDays}`);
console.log(`Product ID: ${productId} · WB stock rows: ${stockRows?.length ?? 0}`);

if (stockRows?.length) {
  const totalStock = stockRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  console.log(`Live wb_stock total quantity: ${totalStock}`);
  for (const row of stockRows.slice(0, 5)) {
    console.log(
      `  size=${row.tech_size || "—"} barcode=${row.barcode ?? "—"} qty=${row.quantity} synced=${row.synced_at}`
    );
  }
} else {
  console.log("No wb_stock rows — run Sync Wildberries after migration");
}

const apiUrl = `http://localhost:3000/api/analytics/products/${productId}/skus?from=${from}&to=${to}`;
let report;
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  report = await response.json();
} catch (error) {
  console.error("\nSKU API unavailable (start dev server):", error.message);
  process.exit(1);
}

const { buildInventoryMetrics, aggregateInventoryMetrics, formatInventoryRecommendation } =
  await import("../src/lib/inventory-intelligence.ts");

console.log(`\nSKU rows: ${report.skus.length} · load ${report.loadTimeMs}ms`);

const purchases30From = new Date(to);
purchases30From.setDate(purchases30From.getDate() - 30);
const purchases30FromStr = purchases30From.toISOString().slice(0, 10);

const { data: sales30 } = await sb
  .from("wb_sales")
  .select("tech_size, quantity, is_return, sale_date")
  .eq("product_id", productId)
  .gte("sale_date", purchases30FromStr)
  .lte("sale_date", to);

function purchases30ForSize(size) {
  const normalized = size === "—" ? "" : size;
  return (sales30 ?? [])
    .filter(
      (sale) =>
        !sale.is_return &&
        (sale.tech_size || "") === normalized
    )
    .reduce((sum, sale) => sum + Number(sale.quantity ?? 0), 0);
}

let stockMismatch = false;
for (const sku of report.skus) {
  const purchases30Day = purchases30ForSize(sku.size);
  const unitCost = 0;
  const inventory = buildInventoryMetrics({
    currentStock: sku.currentStock,
    purchases30Day,
    unitCost,
    targetDays,
  });

  const stockFromDb = stockRows?.reduce((sum, row) => {
    const skuSize = sku.size === "—" ? "" : sku.size;
    const keyMatch = (row.tech_size || "") === skuSize;
    return keyMatch ? sum + Number(row.quantity ?? 0) : sum;
  }, 0);

  if (stockRows?.length && sku.currentStock !== (stockFromDb ?? sku.currentStock)) {
    stockMismatch = true;
    console.warn(
      `  STOCK MISMATCH size=${sku.size}: API=${sku.currentStock} wb_stock=${stockFromDb}`
    );
  }

  console.log(`\n  Size: ${sku.size} · Barcode: ${sku.barcode ?? "—"}`);
  console.log(`    Current stock:     ${inventory.currentStock}`);
  console.log(`    30d purchases:     ${purchases30Day}`);
  console.log(`    Avg daily sales:   ${inventory.averageDailySales.toFixed(2)}`);
  console.log(`    Recommended stock: ${Math.round(inventory.recommendedStock)}`);
  console.log(`    Difference:        ${Math.round(inventory.stockDifference)}`);
  console.log(
    `    Days of stock:     ${inventory.daysOfStock === null ? "∞" : inventory.daysOfStock.toFixed(1)}`
  );
  console.log(`    Unit cost:         ${unitCost.toFixed(2)} ₽`);
  console.log(`    Stock value:       ${inventory.stockValue.toFixed(2)} ₽`);
  console.log(
    `    Recommendation:    ${formatInventoryRecommendation(
      inventory.recommendation,
      inventory.recommendationUnits
    )}`
  );
}

const aggregate = aggregateInventoryMetrics(
  report.skus.map((sku) => ({
    currentStock: sku.currentStock,
    purchases30Day: purchases30ForSize(sku.size),
    unitCost: 0,
  })),
  targetDays
);

console.log("\n--- Parent aggregate ---");
console.log(`  Total stock:       ${aggregate.currentStock}`);
console.log(`  Recommended stock: ${Math.round(aggregate.recommendedStock)}`);
console.log(`  Difference:        ${Math.round(aggregate.stockDifference)}`);
console.log(`  Stock value:       ${aggregate.stockValue.toFixed(2)} ₽`);
console.log(
  `  Recommendation:    ${formatInventoryRecommendation(
    aggregate.recommendation,
    aggregate.recommendationUnits
  )}`
);

const skuStockSum = report.skus.reduce((sum, sku) => sum + sku.currentStock, 0);
const parentStockOk = skuStockSum === aggregate.currentStock;
console.log(`\nParent stock sum = aggregate: ${parentStockOk ? "OK" : "FAIL"} (${skuStockSum})`);
console.log(`Stock data aligned: ${stockMismatch ? "MISMATCH" : stockRows?.length ? "OK" : "NO DATA"}`);
console.log(`No duplicate sizes: ${new Set(report.skus.map((s) => s.size)).size === report.skus.length ? "OK" : "FAIL"}`);
console.log(`No dash row: ${report.skus.every((s) => s.size !== "—") ? "OK" : "FAIL"}`);

if (stockMismatch || report.skus.some((s) => s.size === "—")) process.exit(1);
