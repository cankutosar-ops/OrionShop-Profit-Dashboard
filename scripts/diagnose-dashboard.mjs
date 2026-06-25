#!/usr/bin/env node
/**
 * Replays dashboard-service queries and reports row counts + date ranges.
 * Usage: node scripts/diagnose-dashboard.mjs
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

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function sampleDates(rows, field) {
  if (!rows.length) return [];
  const vals = rows.slice(0, 3).map((r) => r[field]);
  const all = rows.map((r) => String(r[field]).slice(0, 10)).sort();
  return {
    samples: vals,
    min: all[0],
    max: all[all.length - 1],
  };
}

async function countQuery(client, table, filters = {}) {
  let q = client.from(table).select("*", { count: "exact", head: true });
  for (const [col, [op, val]] of Object.entries(filters)) {
    if (op === "gte") q = q.gte(col, val);
    if (op === "lte") q = q.lte(col, val);
  }
  const { count, error } = await q;
  return { count: count ?? 0, error: error?.message ?? null };
}

async function fetchQuery(client, table, filters = {}, limit = 5) {
  let q = client.from(table).select("*");
  for (const [col, [op, val]] of Object.entries(filters)) {
    if (op === "gte") q = q.gte(col, val);
    if (op === "lte") q = q.lte(col, val);
  }
  const { data, error } = await q.limit(limit);
  return { rows: data ?? [], error: error?.message ?? null };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const range = getDefaultDateRange();

  console.log("=== Dashboard query diagnosis ===\n");
  console.log("Default date range (dashboard):", range);

  for (const label of ["anon", "service_role"]) {
    const key = label === "anon" ? anonKey : serviceKey;
    const client = createClient(url, key, { auth: { persistSession: false } });

    console.log(`\n--- Client: ${label} ---`);

    // isDatabaseEmpty check (dashboard-service.ts)
    const emptyCheck = await Promise.all([
      countQuery(client, "wb_sales"),
      countQuery(client, "wb_finance"),
      countQuery(client, "wb_ads"),
      countQuery(client, "products"),
    ]);
    const [salesTotal, financeTotal, adsTotal, productsTotal] = emptyCheck.map((r) => r.count);
    const emptySum = salesTotal + financeTotal + adsTotal + productsTotal;
    console.log("isDatabaseEmpty inputs:", {
      wb_sales: salesTotal,
      wb_finance: financeTotal,
      wb_ads: adsTotal,
      products: productsTotal,
      sum: emptySum,
      wouldShowEmpty: emptySum === 0,
    });

    // Exact dashboard range queries
    const salesRange = await countQuery(client, "wb_sales", {
      sale_date: ["gte", range.from],
      sale_date_lte: ["lte", range.to],
    });
    // fix - countQuery doesn't support duplicate keys. do manually:
    const salesRangeQ = await client
      .from("wb_sales")
      .select("*", { count: "exact", head: true })
      .gte("sale_date", range.from)
      .lte("sale_date", range.to);
    const financeRangeQ = await client
      .from("wb_finance")
      .select("*", { count: "exact", head: true })
      .gte("operation_date", range.from)
      .lte("operation_date", range.to);
    const adsRangeQ = await client
      .from("wb_ads")
      .select("*", { count: "exact", head: true })
      .gte("campaign_date", range.from)
      .lte("campaign_date", range.to);
    const productsAllQ = await client.from("products").select("*", { count: "exact", head: true });
    const costHistoryQ = await client
      .from("product_cost_history")
      .select("*", { count: "exact", head: true });
    const ordersRangeQ = await client
      .from("wb_orders")
      .select("*", { count: "exact", head: true })
      .gte("order_date", range.from)
      .lte("order_date", range.to);

    console.log("\nDashboard queries (exact filters):");
    console.log(`  products (no date filter):        ${productsAllQ.count ?? 0}`);
    console.log(
      `  wb_sales sale_date [${range.from}..${range.to}]: ${salesRangeQ.count ?? 0}${salesRangeQ.error ? ` ERROR: ${salesRangeQ.error.message}` : ""}`
    );
    console.log(
      `  wb_finance operation_date [${range.from}..${range.to}]: ${financeRangeQ.count ?? 0}${financeRangeQ.error ? ` ERROR: ${financeRangeQ.error.message}` : ""}`
    );
    console.log(
      `  wb_ads campaign_date [${range.from}..${range.to}]: ${adsRangeQ.count ?? 0}${adsRangeQ.error ? ` ERROR: ${adsRangeQ.error.message}` : ""}`
    );
    console.log(`  product_cost_history (all):       ${costHistoryQ.count ?? 0}`);
    console.log(
      `  wb_orders order_date [${range.from}..${range.to}] (NOT used by dashboard metrics): ${ordersRangeQ.count ?? 0}`
    );

    // Fetch samples for date inspection
    const { rows: salesSample } = await fetchQuery(client, "wb_sales", {}, 500);
    const { rows: financeSample } = await fetchQuery(client, "wb_finance", {}, 500);
    const { rows: ordersSample } = await fetchQuery(client, "wb_orders", {}, 500);

    if (salesSample.length) {
      const dates = sampleDates(salesSample, "sale_date");
      const returns = salesSample.filter((s) => s.is_return).length;
      const revenueSum = salesSample
        .filter((s) => !s.is_return)
        .reduce((sum, s) => sum + (s.revenue ?? 0), 0);
      console.log("\n  wb_sales date field inspection (sample up to 500 rows):");
      console.log("    sale_date type sample:", typeof salesSample[0].sale_date, salesSample[0].sale_date);
      console.log("    min/max (date portion):", dates.min, "..", dates.max);
      console.log("    is_return count in sample:", returns, "/", salesSample.length);
      console.log("    revenue sum (non-returns in sample):", revenueSum);
    }

    if (financeSample.length) {
      const dates = sampleDates(financeSample, "operation_date");
      console.log("\n  wb_finance operation_date inspection:");
      console.log("    type sample:", typeof financeSample[0].operation_date, financeSample[0].operation_date);
      console.log("    min/max:", dates.min, "..", dates.max);
    }

    if (ordersSample.length) {
      const dates = sampleDates(ordersSample, "order_date");
      console.log("\n  wb_orders order_date inspection:");
      console.log("    type sample:", typeof ordersSample[0].order_date, ordersSample[0].order_date);
      console.log("    min/max:", dates.min, "..", dates.max);
    }

    // Timestamp vs date edge case: lte on last day
    const lastDayEnd = `${range.to}T23:59:59.999Z`;
    const salesRangeExtended = await client
      .from("wb_sales")
      .select("*", { count: "exact", head: true })
      .gte("sale_date", range.from)
      .lte("sale_date", lastDayEnd);
    console.log(
      `\n  Timestamp edge test: sale_date <= '${lastDayEnd}': ${salesRangeExtended.count ?? 0}`
    );

    // product_id type check
    const { data: products } = await client.from("products").select("id").limit(3);
    const { data: salesWithProduct } = await client
      .from("wb_sales")
      .select("product_id, sale_date, revenue, is_return")
      .limit(3);
    if (products?.length && salesWithProduct?.length) {
      console.log("\n  product_id join compatibility:");
      console.log("    products.id type:", typeof products[0].id, products[0].id);
      console.log(
        "    wb_sales.product_id type:",
        typeof salesWithProduct[0].product_id,
        salesWithProduct[0].product_id
      );
      const productIds = new Set(products.map((p) => p.id));
      const strictMatch = salesWithProduct.filter((s) => productIds.has(s.product_id)).length;
      const looseMatch = salesWithProduct.filter((s) =>
        productIds.has(String(s.product_id))
      ).length;
      console.log("    strict === match in sample:", strictMatch, "/", salesWithProduct.length);
      console.log("    String() match in sample:", looseMatch, "/", salesWithProduct.length);
    }

    // Simulate hasActivity
    const { data: rangeSales } = await client
      .from("wb_sales")
      .select("*")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to);
    const { data: rangeAds } = await client
      .from("wb_ads")
      .select("*")
      .gte("campaign_date", range.from)
      .lte("campaign_date", range.to);
    const { data: allProducts } = await client
      .from("products")
      .select("*, brand:brands(*), category:categories(*)");

    const completedSales = (rangeSales ?? []).filter((s) => !s.is_return);
    const overviewRevenue = completedSales.reduce((sum, s) => sum + (s.revenue ?? 0), 0);
    const overviewAdvertising = (rangeAds ?? []).reduce((sum, a) => sum + (a.spend ?? 0), 0);

    const productMetrics = (allProducts ?? [])
      .map((product) => {
        const productSales = (rangeSales ?? []).filter((s) => s.product_id === product.id);
        const rev = productSales.filter((s) => !s.is_return).reduce((sum, s) => sum + (s.revenue ?? 0), 0);
        return { id: product.id, rev };
      })
      .filter((p) => p.rev > 0);

    const hasActivity =
      overviewRevenue > 0 || overviewAdvertising > 0 || productMetrics.length > 0;

    console.log("\n  Simulated hasActivity check:");
    console.log("    overview.revenue:", overviewRevenue);
    console.log("    overview.advertising:", overviewAdvertising);
    console.log("    products with revenue > 0:", productMetrics.length);
    console.log("    hasActivity:", hasActivity);
    console.log(
      "    → would show sample data:",
      !hasActivity ? "YES — 'No data found for the selected date range'" : "NO"
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
