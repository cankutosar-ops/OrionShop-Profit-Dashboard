#!/usr/bin/env node
/**
 * Data Validation Sprint 1 — audit only (no fixes).
 * Run: npx tsx scripts/sprint1-validation-audit.mjs
 */
import { readFileSync } from "fs";
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

const from = process.env.AUDIT_FROM || "2026-05-24";
const to = process.env.AUDIT_TO || "2026-06-23";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Supabase not configured");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, dateCol) {
  const rows = [];
  let offset = 0;
  while (true) {
    let q = sb.from(table).select("*");
    if (dateCol) q = q.gte(dateCol, from).lte(dateCol, to);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) return { error: error.message, rows: [] };
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return { rows, error: null };
}

async function tableCount(table) {
  const r = await fetchAll(table);
  return r.error ? { error: r.error, count: 0 } : { count: r.rows.length, rows: r.rows };
}

console.log("=== SPRINT 1 VALIDATION AUDIT ===");
console.log(`Period: ${from} → ${to}\n`);

// Step 1 — Stock
console.log("--- STEP 1: STOCK ---");
const stock = await tableCount("wb_stock");
const variants = await tableCount("product_variants");
console.log("wb_stock:", stock.error ?? `count=${stock.count}`);
console.log("product_variants:", variants.error ?? `count=${variants.count}`);

const { data: alex } = await sb
  .from("products")
  .select("*")
  .eq("supplier_article", "ALEXASIYAH01")
  .maybeSingle();

if (alex) {
  const alexStock = stock.error ? [] : stock.rows.filter((r) => String(r.product_id) === String(alex.id));
  const alexVars = variants.error ? [] : variants.rows.filter((r) => String(r.product_id) === String(alex.id));
  console.log("\nALEXASIYAH01:");
  console.log("  product_id:", alex.id, "nm_id:", alex.nm_id);
  console.log("  product_variants (DB):", alexVars.length);
  for (const v of alexVars.slice(0, 5)) {
    console.log("   ", { tech_size: v.tech_size, barcode: v.barcode });
  }
  console.log("  wb_stock (DB):", alexStock.length);
  for (const s of alexStock.slice(0, 5)) {
    console.log("   ", { tech_size: s.tech_size, barcode: s.barcode, quantity: s.quantity });
  }

  const { getProductSkuAnalytics } = await import("../src/services/product-sku-analytics-service.ts");
  const skuReport = await getProductSkuAnalytics(String(alex.id), { from, to }, 0);
  if (skuReport) {
    console.log("  SKU service (app):", skuReport.skus.length, "rows");
    for (const sku of skuReport.skus) {
      console.log(
        `    size=${sku.size} stock=${sku.currentStock} orders=${sku.orders} purchases=${sku.purchases} barcode=${sku.barcode ?? "—"}`
      );
    }
    console.log(
      "  SKU sum orders:",
      skuReport.skus.reduce((s, x) => s + x.orders, 0),
      "purchases:",
      skuReport.skus.reduce((s, x) => s + x.purchases, 0)
    );
  }
}

// Step 2 — SKU mapping
console.log("\n--- STEP 2: SKU MAPPING (tech_size) ---");
for (const table of ["wb_orders", "wb_sales"]) {
  const col = table === "wb_orders" ? "order_date" : "sale_date";
  const probe = await sb.from(table).select("tech_size, barcode").limit(1);
  if (probe.error) {
    console.log(`${table}: ${probe.error.message}`);
    continue;
  }
  const r = await fetchAll(table, col);
  const withSize = r.rows.filter((x) => x.tech_size?.trim()).length;
  const withBar = r.rows.filter((x) => x.barcode?.trim()).length;
  console.log(`${table}: rows=${r.rows.length} tech_size=${withSize} barcode=${withBar}`);
}

// Step 3 — 10 products
console.log("\n--- STEP 3: 10 PRODUCTS vs DB ---");
const { getProductProfitability } = await import("../src/services/dashboard-service.ts");
const { toProductAnalyticsV3Row } = await import("../src/lib/product-analytics.ts");
const {
  buildProductOperationalMetrics,
} = await import("../src/lib/product-operational-metrics.ts");

const products = await fetchAll("products");
const ordersR = await fetchAll("wb_orders", "order_date");
const salesR = await fetchAll("wb_sales", "sale_date");
const financeR = await fetchAll("wb_finance", "operation_date");
const adsR = await fetchAll("wb_ads", "campaign_date");
const costR = await fetchAll("product_cost_history");

const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { verifyProductAnalyticsV3Totals } = await import("../src/lib/product-analytics.ts");

const prof = await getProductProfitability({ from, to });
const active = prof
  .filter((p) => p.orders > 0 || p.purchases > 0 || p.revenue > 0)
  .sort((a, b) => a.modelCode.localeCompare(b.modelCode));
const step = Math.max(1, Math.floor(active.length / 10));
const pick = [];
for (let i = 0; pick.length < 10 && i < active.length; i += step) pick.push(active[i]);

const costMap = buildLatestCostByProductId(costR.rows, products.rows);

const mismatches = [];
for (const p of pick) {
  const pid = p.productId;
  const v3 = toProductAnalyticsV3Row(p);
  const po = ordersR.rows.filter((o) => String(o.product_id) === pid);
  const ps = salesR.rows.filter((s) => String(s.product_id) === pid);
  const dbOrders = po.reduce((s, o) => s + Number(o.quantity ?? 1), 0);
  const dbPurch = ps.filter((s) => !s.is_return).reduce((s, x) => s + Number(x.quantity ?? 1), 0);
  const dbRev = ps.filter((s) => !s.is_return).reduce((s, x) => s + Number(x.revenue), 0);
  const dbCost = ps
    .filter((s) => !s.is_return)
    .reduce((s, sale) => s + (costMap.get(pid) ?? 0) * Number(sale.quantity ?? 1), 0);

  const checks = [
    ["orders", v3.orders, dbOrders],
    ["purchases", v3.purchases, dbPurch],
    ["revenue", v3.revenue, dbRev],
    ["productCost", v3.productCost, dbCost],
    ["commission", v3.commission, p.commission],
    ["totalLogistics", v3.totalLogistics, p.purchaseLogistics + p.excludedLogistics],
    ["operationalProfit", v3.operationalProfit, buildProductOperationalMetrics(p).operationalProfit],
  ];
  let ok = true;
  for (const [name, a, b] of checks) {
    if (Math.abs(a - b) > 0.02) {
      mismatches.push({ article: p.modelCode, name, analytics: a, db: b, delta: a - b });
      ok = false;
    }
  }
  console.log(`${p.modelCode}: ${ok ? "OK" : "MISMATCH"}`);
}

const v3Sample = pick.map((p) => toProductAnalyticsV3Row(p));
const sampleTotals = {
  orders: v3Sample.reduce((s, r) => s + r.orders, 0),
  purchases: v3Sample.reduce((s, r) => s + r.purchases, 0),
  revenue: v3Sample.reduce((s, r) => s + r.revenue, 0),
  purchaseLogistics: v3Sample.reduce((s, r) => s + r.purchaseLogistics, 0),
  excludedLogistics: v3Sample.reduce((s, r) => s + r.excludedLogistics, 0),
  operationalProfit: v3Sample.reduce((s, r) => s + r.operationalProfit, 0),
};
const internalCheck = verifyProductAnalyticsV3Totals(prof, sampleTotals);
console.log("Portfolio V3 reconciliation (full service): run verify-product-analytics.mjs");
console.log("Sample internal V3 row vs prof:", internalCheck.ok ? "OK" : JSON.stringify(internalCheck.deltas));

console.log("\nMismatches:", mismatches.length);
for (const m of mismatches) {
  console.log(`  ${m.article}.${m.name}: analytics=${m.analytics.toFixed(2)} db=${m.db.toFixed(2)} delta=${m.delta.toFixed(2)}`);
}

// Parent vs SKU for ALEXASIYAH01
if (alex && prof.find((p) => p.modelCode === "ALEXASIYAH01")) {
  const parent = prof.find((p) => p.modelCode === "ALEXASIYAH01");
  const { getProductSkuAnalytics } = await import("../src/services/product-sku-analytics-service.ts");
  const sku = await getProductSkuAnalytics(String(alex.id), { from, to }, 0);
  console.log("\n--- PARENT vs SKU (ALEXASIYAH01) ---");
  console.log("Parent orders:", parent.orders, "purchases:", parent.purchases);
  if (sku) {
    console.log(
      "SKU sum orders:",
      sku.skus.reduce((s, x) => s + x.orders, 0),
      "purchases:",
      sku.skus.reduce((s, x) => s + x.purchases, 0)
    );
  }
}

console.log("\n=== AUDIT COMPLETE ===");
