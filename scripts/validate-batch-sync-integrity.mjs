#!/usr/bin/env node
/**
 * Data integrity: batch sync DB vs API-mapped payloads (old ≡ new mappers).
 * Product Analytics: DB (after batch) vs in-memory rebuild from expected payloads (before path).
 *
 * Usage: npx tsx scripts/validate-batch-sync-integrity.mjs [from] [to]
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

async function fetchAll(client, table, dateCol, from, to, marketplaceAccountId) {
  const rows = [];
  let offset = 0;
  while (true) {
    let q = client.from(table).select("*");
    if (marketplaceAccountId) q = q.eq("marketplace_account_id", marketplaceAccountId);
    if (dateCol) q = q.gte(dateCol, from).lte(dateCol, to);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function nearlyEqual(a, b, eps = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function pickOrderFields(row) {
  return {
    srid: row.srid,
    nm_id: row.nm_id,
    product_id: String(row.product_id),
    order_date: String(row.order_date).slice(0, 10),
    price: Number(row.price),
    quantity: Number(row.quantity),
    status: row.status,
    tech_size: row.tech_size ?? null,
    barcode: row.barcode ?? null,
  };
}

function pickFinanceFields(row) {
  return {
    source_key: row.source_key,
    product_id: row.product_id == null ? null : String(row.product_id),
    nm_id: row.nm_id ?? null,
    operation_date: String(row.operation_date).slice(0, 10),
    operation_type: row.operation_type,
    amount: Number(row.amount),
    srid: row.srid ?? null,
  };
}

function dedupeBySrid(rows) {
  const bySrid = new Map();
  for (const row of rows) {
    bySrid.set(row.srid, row);
  }
  return [...bySrid.values()];
}

function pickSaleFields(row) {
  return {
    srid: row.srid,
    nm_id: row.nm_id,
    product_id: String(row.product_id),
    sale_date: String(row.sale_date).slice(0, 10),
    revenue: Number(row.revenue),
    quantity: Number(row.quantity),
    is_return: Boolean(row.is_return),
    tech_size: row.tech_size ?? null,
    barcode: row.barcode ?? null,
  };
}

function withIds(rows) {
  return rows.map((row, index) => ({ ...row, id: String(index + 1) }));
}


function extractPaMetrics(totals) {
  return {
    ordersCount: totals.orders,
    salesCount: totals.purchases,
    financeRows: null,
    revenue: totals.revenue,
    commission: totals.commission,
    purchaseLogistics: totals.purchaseLogistics,
    excludedLogistics: totals.excludedLogistics,
    returnLogistics: totals.returnLogistics,
    productCost: totals.productCost,
    operationalProfit: totals.operationalProfit,
  };
}

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
  const { isWithinDateRange, mapApiOrderToDb, mapApiSaleToDb, mapFinanceRowsFromReport, toDateString } =
    await import("../src/lib/wildberries/mappers.ts");
  const { getProductProfitability } = await import("../src/services/dashboard-service.ts");
  const { fetchProductsWithRelations, fetchAdsInRange, fetchCostHistory } = await import(
    "../src/services/dashboard-service.ts"
  );

  const {
    buildProductAnalyticsTotals,
    buildProductAnalyticsV3Rows,
    verifyProductAnalyticsV3Totals,
    verifyProductAnalyticsOperationalTotals,
  } = await import("../src/lib/product-analytics.ts");
  const { buildProductProfitabilityRows } = await import(
    "../src/lib/product-profitability-builder.ts"
  );

  const { resolveMarketplaceAccountId } = await import("../src/services/marketplace-account-service.ts");

  console.log(`=== Batch sync integrity validation ===`);
  console.log(`Range: ${from} → ${to}\n`);

  const { marketplaceAccountId, companyId } = await resolveMarketplaceAccountId(null, null);
  console.log(`Marketplace account: ${marketplaceAccountId}\n`);

  const scope = { from, to, marketplaceAccountId, companyId };

  const api = new WbApiClient();
  const [apiOrders, apiSales, apiFinance] = await Promise.all([
    api.fetchOrders(`${from}T00:00:00`),
    api.fetchSales(`${from}T00:00:00`),
    api.fetchFinanceReport(from, to),
  ]);
  const [products, ads, costHistory] = await Promise.all([
    fetchProductsWithRelations(marketplaceAccountId, supabase),
    fetchAdsInRange(scope, supabase),
    fetchCostHistory(marketplaceAccountId, supabase),
  ]);

  const lookup = new Map(products.map((p) => [p.nm_id, String(p.id)]));

  const filteredOrders = apiOrders.filter((o) =>
    isWithinDateRange(toDateString(o.date), from, to)
  );
  const filteredSales = apiSales.filter((s) =>
    isWithinDateRange(toDateString(s.date), from, to)
  );

  const expectedOrderPayloads = [];
  for (const order of filteredOrders) {
    const productId = lookup.get(order.nmId);
    if (!productId) continue;
    expectedOrderPayloads.push(mapApiOrderToDb(order, productId));
  }

  const expectedSalePayloadsRaw = [];
  for (const sale of filteredSales) {
    const productId = lookup.get(sale.nmId);
    if (!productId) continue;
    expectedSalePayloadsRaw.push(mapApiSaleToDb(sale, productId));
  }
  const expectedSalePayloads = dedupeBySrid(expectedSalePayloadsRaw);
  const duplicateSaleRows = expectedSalePayloadsRaw.length - expectedSalePayloads.length;

  const expectedFinancePayloads = [];
  for (const row of apiFinance) {
    const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
    expectedFinancePayloads.push(...mapFinanceRowsFromReport(row, productId));
  }

  const expectedFinanceInRange = expectedFinancePayloads.filter((row) =>
    isWithinDateRange(String(row.operation_date).slice(0, 10), from, to)
  );

  const [dbOrders, dbSales, dbFinance] = await Promise.all([
    fetchAll(supabase, "wb_orders", "order_date", from, to, marketplaceAccountId),
    fetchAll(supabase, "wb_sales", "sale_date", from, to, marketplaceAccountId),
    fetchAll(supabase, "wb_finance", "operation_date", from, to, marketplaceAccountId),
  ]);

  const mismatches = [];

  function compareMetric(label, before, after) {
    if (before === null || after === null) return;
    const e = Number(before);
    const a = Number(after);
    if (!nearlyEqual(e, a)) {
      mismatches.push({ label, before: e, after: a, delta: a - e });
    }
  }

  // --- Sync payload integrity (old row-by-row ≡ new batch) ---
  compareMetric("Orders count (rows)", expectedOrderPayloads.length, dbOrders.length);
  compareMetric("Sales count (rows)", expectedSalePayloads.length, dbSales.length);
  compareMetric("Finance rows count", expectedFinanceInRange.length, dbFinance.length);

  const dbOrderBySrid = new Map(dbOrders.map((r) => [r.srid, r]));
  let orderFieldMismatches = 0;
  for (const expected of expectedOrderPayloads) {
    const db = dbOrderBySrid.get(expected.srid);
    if (!db) {
      orderFieldMismatches += 1;
      continue;
    }
    const exp = pickOrderFields(expected);
    const got = pickOrderFields(db);
    for (const key of Object.keys(exp)) {
      if (exp[key] !== got[key] && !nearlyEqual(exp[key], got[key])) {
        orderFieldMismatches += 1;
      }
    }
  }
  if (orderFieldMismatches > 0) {
    mismatches.push({
      label: "Order payload field mismatches",
      before: 0,
      after: orderFieldMismatches,
    });
  }

  const dbSaleBySrid = new Map(dbSales.map((r) => [r.srid, r]));
  let saleFieldMismatches = 0;
  const saleMismatchSamples = [];
  for (const expected of expectedSalePayloads) {
    const db = dbSaleBySrid.get(expected.srid);
    if (!db) {
      saleFieldMismatches += 1;
      continue;
    }
    const exp = pickSaleFields(expected);
    const got = pickSaleFields(db);
    for (const key of Object.keys(exp)) {
      if (exp[key] !== got[key] && !nearlyEqual(exp[key], got[key])) {
        saleFieldMismatches += 1;
        if (saleMismatchSamples.length < 5) {
          saleMismatchSamples.push({ srid: expected.srid, field: key, expected: exp[key], db: got[key] });
        }
      }
    }
  }
  if (saleFieldMismatches > 0) {
    mismatches.push({
      label: "Sale payload field mismatches",
      before: 0,
      after: saleFieldMismatches,
    });
  }

  const dbFinanceByKey = new Map(
    dbFinance.filter((r) => r.source_key).map((r) => [r.source_key, r])
  );
  let financeFieldMismatches = 0;
  for (const expected of expectedFinanceInRange) {
    if (!expected.source_key) continue;
    const db = dbFinanceByKey.get(expected.source_key);
    if (!db) {
      financeFieldMismatches += 1;
      continue;
    }
    const exp = pickFinanceFields(expected);
    const got = pickFinanceFields(db);
    for (const key of Object.keys(exp)) {
      if (exp[key] !== got[key] && !nearlyEqual(exp[key], got[key])) {
        financeFieldMismatches += 1;
      }
    }
  }
  if (financeFieldMismatches > 0) {
    mismatches.push({
      label: "Finance payload field mismatches",
      before: 0,
      after: financeFieldMismatches,
    });
  }

  // --- Product Analytics: before (expected payloads) vs after (DB) ---
  const expectedOrders = withIds(expectedOrderPayloads);
  const expectedSales = withIds(expectedSalePayloads);
  const expectedFinance = withIds(expectedFinanceInRange);

  const profitabilityBefore = buildProductProfitabilityRows({
    products,
    orders: expectedOrders,
    sales: expectedSales,
    finance: expectedFinance,
    ads,
    costHistory,
  });
  const totalsBefore = buildProductAnalyticsTotals(profitabilityBefore);

  const profitabilityAfter = await getProductProfitability(scope, supabase);
  const totalsAfter = buildProductAnalyticsTotals(profitabilityAfter);
  const v3After = buildProductAnalyticsV3Rows(profitabilityAfter);

  const profitabilityDbRows = buildProductProfitabilityRows({
    products,
    orders: withIds(dbOrders),
    sales: withIds(dbSales),
    finance: withIds(dbFinance),
    ads,
    costHistory,
  });
  const totalsDbRows = buildProductAnalyticsTotals(profitabilityDbRows);
  compareMetric("PA engine self-check (commission)", totalsDbRows.commission, totalsAfter.commission);
  compareMetric("PA engine self-check (operational profit)", totalsDbRows.operationalProfit, totalsAfter.operationalProfit);

  totalsBefore.financeRows = expectedFinanceInRange.length;
  totalsAfter.financeRows = dbFinance.length;

  const before = extractPaMetrics(totalsBefore);
  const after = extractPaMetrics(totalsAfter);
  before.financeRows = expectedFinanceInRange.length;
  after.financeRows = dbFinance.length;

  console.log("--- Sync counts (API mappers ≡ old sync ≡ new batch) ---");
  console.log(`Orders:  expected ${expectedOrderPayloads.length} | DB ${dbOrders.length}`);
  console.log(
    `Sales:   expected ${expectedSalePayloads.length} unique srids (${expectedSalePayloadsRaw.length} API rows, ${duplicateSaleRows} duplicate srids collapsed) | DB ${dbSales.length}`
  );
  console.log(`Finance: expected ${expectedFinanceInRange.length} | DB ${dbFinance.length}`);

  console.log("\n--- Payload field integrity ---");
  console.log(`Order field mismatches:  ${orderFieldMismatches}`);
  console.log(`Sale field mismatches:   ${saleFieldMismatches}`);
  if (saleMismatchSamples.length) {
    console.log(`Sale mismatch samples:   ${JSON.stringify(saleMismatchSamples)}`);
  }
  console.log(`Finance field mismatches: ${financeFieldMismatches}`);

  console.log("\n--- Product Analytics: before (expected payloads) vs after (DB batch sync) ---");
  console.log("metric                  | before               | after");
  console.log("------------------------|----------------------|----------------------");
  for (const key of Object.keys(before)) {
    if (key === "financeRows") {
      console.log(
        `${"Finance rows count".padEnd(23)} | ${String(before[key]).padStart(20)} | ${String(after[key]).padStart(20)}`
      );
      compareMetric("Finance rows count", before[key], after[key]);
      continue;
    }
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    console.log(
      `${label.padEnd(23)} | ${String(round(before[key])).padStart(20)} | ${String(round(after[key])).padStart(20)}`
    );
    compareMetric(label, before[key], after[key]);
  }

  const v3Check = verifyProductAnalyticsV3Totals(v3After, totalsAfter);
  const opsCheck = verifyProductAnalyticsOperationalTotals(v3After, totalsAfter);
  if (!v3Check.ok) {
    mismatches.push({ label: "PA internal V3 funnel check", before: 0, after: JSON.stringify(v3Check.deltas) });
  }
  if (!opsCheck.ok) {
    mismatches.push({ label: "PA internal operational check", before: 0, after: JSON.stringify(opsCheck.deltas) });
  }

  console.log("\n=== RESULT ===");
  if (mismatches.length === 0) {
    console.log("PASS — every metric matches exactly.");
  } else {
    console.log("FAIL — mismatches found:\n");
    for (const m of mismatches) {
      console.log(`  ${m.label}: before ${m.before}, after ${m.after} (delta ${m.delta})`);
    }
    process.exit(1);
  }
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
