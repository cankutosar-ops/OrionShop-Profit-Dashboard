#!/usr/bin/env node
/**
 * Audit wb_orders.price vs wb_sales and compute Orders vs Purchases KPIs.
 * Usage: node scripts/audit-wb-orders.mjs [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function fetchAllInDateRange(client, table, column, from, to) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .gte(column, from)
      .lte(column, to)
      .range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function sumQty(rows) {
  return rows.reduce((s, r) => s + Number(r.quantity ?? 1), 0);
}

function sumOrderAmount(rows) {
  return rows.reduce((s, r) => s + Number(r.price) * Number(r.quantity ?? 1), 0);
}

function sumPurchaseAmount(rows) {
  return rows.reduce((s, r) => s + Number(r.revenue), 0);
}

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const [orders, sales] = await Promise.all([
    fetchAllInDateRange(client, "wb_orders", "order_date", from, to),
    fetchAllInDateRange(client, "wb_sales", "sale_date", from, to),
  ]);

  const active = orders.filter((o) => o.status === "active");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const otherStatus = orders.filter((o) => o.status !== "active" && o.status !== "cancelled");
  const purchases = sales.filter((s) => !s.is_return);

  const activeCount = sumQty(active);
  const cancelledCount = sumQty(cancelled);
  const purchasesCount = sumQty(purchases);

  const activeAmount = sumOrderAmount(active);
  const cancelledAmount = sumOrderAmount(cancelled);
  const purchasesAmount = sumPurchaseAmount(purchases);

  const conversionRate = activeCount > 0 ? (purchasesCount / activeCount) * 100 : 0;

  const avgActiveOrderPrice = activeCount > 0 ? activeAmount / activeCount : 0;
  const avgPurchaseRevenue = purchasesCount > 0 ? purchasesAmount / purchasesCount : 0;

  console.log("wb_orders audit");
  console.log("================");
  console.log(`Date range: order_date / sale_date [${from} .. ${to}]`);
  console.log("");
  console.log("1. Meaning of wb_orders.price");
  console.log("   Sync maps: wb_orders.price ← WB API orders.totalPrice");
  console.log("   (see src/lib/wildberries/mappers.ts mapApiOrderToDb)");
  console.log("");
  console.log("   Wildberries documents totalPrice as the BASE retail price");
  console.log("   BEFORE seller discountPercent (list price), NOT the final");
  console.log("   customer price. Discounted price requires:");
  console.log("   totalPrice × (100 - discountPercent) / 100 × ...");
  console.log("");
  console.log("   wb_sales.revenue maps from finishedPrice / forPay (actual sale).");
  console.log("   → Orders Amount is list-price based; Purchases Amount is paid revenue.");
  console.log("");
  console.log("2. Price comparison (active orders vs purchases)");
  console.log(`   Avg active order price (totalPrice): ${avgActiveOrderPrice.toFixed(2)} ₽`);
  console.log(`   Avg purchase revenue (finishedPrice): ${avgPurchaseRevenue.toFixed(2)} ₽`);
  console.log(`   Ratio purchase/order: ${avgActiveOrderPrice > 0 ? (avgPurchaseRevenue / avgActiveOrderPrice * 100).toFixed(1) : "n/a"}%`);
  console.log("");
  console.log("3. KPI recalculation (status-filtered)");
  console.log(`   Active orders:     ${activeCount} units · ${activeAmount.toFixed(2)} ₽`);
  console.log(`   Cancelled orders:  ${cancelledCount} units · ${cancelledAmount.toFixed(2)} ₽`);
  if (otherStatus.length) {
    console.log(`   Other status:      ${sumQty(otherStatus)} units (${otherStatus.map((o) => o.status).join(", ")})`);
  }
  console.log(`   Purchases:         ${purchasesCount} units · ${purchasesAmount.toFixed(2)} ₽`);
  console.log("");
  console.log(`   Conversion rate:   ${conversionRate.toFixed(1)}%  (purchases ÷ active orders)`);
  console.log("");
  console.log("4. Row counts");
  console.log(`   wb_orders rows: ${orders.length} (active ${active.length}, cancelled ${cancelled.length})`);
  console.log(`   wb_sales rows:  ${sales.length} (purchases ${purchases.length}, returns ${sales.length - purchases.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
