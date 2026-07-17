#!/usr/bin/env node
/**
 * Transaction-level sales persistence trace (read-only).
 * Usage: npx tsx scripts/trace-sales-persistence.mjs [accountId] [srid]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { mapApiSaleToDb } from "../src/lib/wildberries/mappers.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { buildNetSalesFromDb, resolveNetSalesFromSources } from "../src/lib/sales-revenue-resolution.ts";
import { resolveNetSales } from "../src/services/sales-revenue-service.ts";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "1";
const targetSrid =
  process.argv[3] ?? "eAd.i1e4a7f58b951f0ac66e6980516136199.0.0";

const client = createAdminClient();

// Step 0: schema probe (same as sync-service salesSchemaHasRevenueColumns)
const schemaProbe = await client.from("wb_sales").select("price_with_disc, for_pay").limit(1);
const schemaHasRevenueColumns = !schemaProbe.error;

console.log("=== STEP 0: Schema ===");
console.log(`price_with_disc / for_pay columns queryable: ${schemaHasRevenueColumns}`);
if (schemaProbe.error) console.log(`  probe error: ${schemaProbe.error.message}`);

// Step 1: DB row
const { data: dbRows, error: dbErr } = await client
  .from("wb_sales")
  .select("*")
  .eq("marketplace_account_id", accountId)
  .eq("srid", targetSrid)
  .limit(1);

if (dbErr) throw dbErr;
const dbRow = dbRows?.[0];
if (!dbRow) {
  console.error(`No wb_sales row for srid ${targetSrid}`);
  process.exit(1);
}

console.log("\n=== STEP 4: Database (wb_sales) ===");
console.log(JSON.stringify({
  srid: dbRow.srid,
  sale_date: dbRow.sale_date,
  revenue: dbRow.revenue,
  price_with_disc: dbRow.price_with_disc,
  for_pay: dbRow.for_pay,
  is_return: dbRow.is_return,
  quantity: dbRow.quantity,
}, null, 2));

const saleDate = String(dbRow.sale_date).slice(0, 10);
const account = await getMarketplaceAccountForSync(accountId);
const wb = new WbApiClient(account.apiKey);

console.log("\n=== STEP 1: Wildberries Sales API ===");
console.log(`GET statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${saleDate}T00:00:00&flag=0`);
const apiSales = await wb.fetchSales(`${saleDate}T00:00:00`);

const apiRow =
  apiSales.find((s) => (s.srid ?? s.saleID) === targetSrid) ??
  apiSales.find((s) => s.saleID === targetSrid.split(".")[0]);

if (!apiRow) {
  console.log(`No API row matched srid ${targetSrid} in ${apiSales.length} sales from ${saleDate}`);
  // try wider window
  const wider = await wb.fetchSales("2026-04-01T00:00:00");
  const apiRow2 = wider.find((s) => (s.srid ?? s.saleID) === targetSrid);
  if (!apiRow2) {
    console.log("Still not found in April+ fetch");
    process.exit(1);
  }
  Object.assign(apiRow ?? {}, apiRow2);
}

const matched =
  apiSales.find((s) => (s.srid ?? s.saleID) === targetSrid) ??
  (await wb.fetchSales("2026-04-01T00:00:00")).find((s) => (s.srid ?? s.saleID) === targetSrid);

console.log("\n=== STEP 2: JSON Response (raw API object) ===");
console.log(JSON.stringify({
  saleID: matched.saleID,
  srid: matched.srid,
  date: matched.date,
  priceWithDisc: matched.priceWithDisc,
  finishedPrice: matched.finishedPrice,
  forPay: matched.forPay,
  totalPrice: matched.totalPrice,
  discountPercent: matched.discountPercent,
  spp: matched.spp,
}, null, 2));

console.log("\n=== STEP 3: Mapper (mapApiSaleToDb) ===");
const mapped = mapApiSaleToDb(matched, String(dbRow.product_id));
console.log(JSON.stringify({
  revenue: mapped.revenue,
  price_with_disc: mapped.price_with_disc,
  for_pay: mapped.for_pay,
  mapper_note: {
    revenue: "Math.abs(sale.finishedPrice ?? sale.forPay ?? 0)",
    price_with_disc: "Math.abs(sale.priceWithDisc ?? 0)",
    for_pay: "Math.abs(sale.forPay ?? 0)",
  },
}, null, 2));

console.log("\n=== STEP 5: Dashboard / Model B read path ===");
const scope = {
  marketplaceAccountId: accountId,
  companyId: "",
  from: "2026-04-14",
  to: "2026-07-12",
};

const { data: allSales } = await client
  .from("wb_sales")
  .select("*")
  .eq("marketplace_account_id", accountId)
  .gte("sale_date", scope.from)
  .lte("sale_date", scope.to);

const fromDb = buildNetSalesFromDb(allSales ?? []);
const resolvedNoApi = resolveNetSalesFromSources({
  sales: allSales ?? [],
  scopeFrom: scope.from,
  scopeTo: scope.to,
});
const resolvedWithApi = await resolveNetSales(scope, allSales ?? []);

console.log("buildNetSalesFromDb (period):", fromDb);
console.log("resolveNetSalesFromSources (no apiSales arg):", {
  netSales: resolvedNoApi.netSales,
  status: resolvedNoApi.status,
  dataSource: resolvedNoApi.dataSource,
});
console.log("resolveNetSales (dashboard path, with API fallback):", {
  netSales: resolvedWithApi.netSales,
  status: resolvedWithApi.status,
  dataSource: resolvedWithApi.dataSource,
});

console.log("\n=== GAP ANALYSIS ===");
const gaps = [];
if (Number(matched.priceWithDisc) > 0 && Number(dbRow.price_with_disc) === 0) {
  gaps.push({
    field: "price_with_disc",
    api: matched.priceWithDisc,
    db: dbRow.price_with_disc,
    likely_cause:
      "DB row predates migration (DEFAULT 0) OR sync ran with toSalesUpsertRow stripping revenue columns",
  });
}
if (Number(matched.forPay) > 0 && Number(dbRow.for_pay) === 0) {
  gaps.push({
    field: "for_pay",
    api: matched.forPay,
    db: dbRow.for_pay,
    likely_cause: "same as price_with_disc",
  });
}
if (Number(dbRow.revenue) > 0 && Number(matched.finishedPrice) > 0) {
  gaps.push({
    field: "revenue",
    api_finishedPrice: matched.finishedPrice,
    db_revenue: dbRow.revenue,
    note: "revenue WAS persisted (legacy column) — proves sync ran before revenue columns added",
  });
}
console.log(JSON.stringify(gaps, null, 2));
