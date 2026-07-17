#!/usr/bin/env node
/**
 * Sprint 6.17 — API coverage vs persisted DB verification.
 * Usage: npx tsx scripts/verify-api-coverage.mjs [--account 1] [--days 90]
 *        npx tsx scripts/verify-api-coverage.mjs --from 2026-04-11 --to 2026-07-09 --account 1
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

function parseArgs() {
  const args = process.argv.slice(2);
  let account = "1";
  let days = 90;
  let from = null;
  let to = null;
  let skipSync = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--account" && args[i + 1]) account = args[++i];
    else if (args[i] === "--days" && args[i + 1]) days = Number(args[++i]);
    else if (args[i] === "--from" && args[i + 1]) from = args[++i];
    else if (args[i] === "--to" && args[i + 1]) to = args[++i];
    else if (args[i] === "--skip-sync") skipSync = true;
  }

  if (!from || !to) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    from = from ?? start.toISOString().slice(0, 10);
    to = to ?? end.toISOString().slice(0, 10);
  }

  return { account, from, to, skipSync };
}

function toDateString(iso) {
  return String(iso).slice(0, 10);
}

function isWithinDateRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

function dateStats(rows, getDate) {
  if (!rows.length) {
    return { count: 0, earliest: null, latest: null };
  }
  const dates = rows.map((r) => getDate(r)).filter(Boolean).sort();
  return {
    count: rows.length,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };
}

async function dbExtent(client, table, dateCol, accountId, from, to) {
  const base = () => client.from(table).select(dateCol).eq("marketplace_account_id", accountId);

  const { data: minRow } = await base().order(dateCol, { ascending: true }).limit(1);
  const { data: maxRow } = await base().order(dateCol, { ascending: false }).limit(1);
  const { count: total } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  const { count: inRange } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte(dateCol, from)
    .lte(dateCol, to);

  return {
    earliest: minRow?.[0]?.[dateCol] ? toDateString(minRow[0][dateCol]) : null,
    latest: maxRow?.[0]?.[dateCol] ? toDateString(maxRow[0][dateCol]) : null,
    totalRows: total ?? 0,
    rowsInRange: inRange ?? 0,
  };
}

async function dbStockExtent(client, accountId) {
  const { count: total } = await client
    .from("wb_stock")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  const { data: minRow } = await client
    .from("wb_stock")
    .select("last_synced_at")
    .eq("marketplace_account_id", accountId)
    .order("last_synced_at", { ascending: true })
    .limit(1);
  const { data: maxRow } = await client
    .from("wb_stock")
    .select("last_synced_at")
    .eq("marketplace_account_id", accountId)
    .order("last_synced_at", { ascending: false })
    .limit(1);
  return {
    earliest: minRow?.[0]?.last_synced_at ? toDateString(minRow[0].last_synced_at) : null,
    latest: maxRow?.[0]?.last_synced_at ? toDateString(maxRow[0].last_synced_at) : null,
    totalRows: total ?? 0,
    rowsInRange: total ?? 0,
  };
}

function compareStatus(api, db, field = "count") {
  const apiVal = api[field];
  const dbVal = db[field === "count" ? "rowsInRange" : field];
  if (apiVal == null || dbVal == null) return "N/A";
  if (field === "earliest" || field === "latest") {
    return apiVal === dbVal ? "MATCH" : "MISMATCH";
  }
  const ratio = dbVal / Math.max(apiVal, 1);
  if (ratio >= 0.95 && ratio <= 1.05) return "MATCH";
  if (dbVal < apiVal) return "MISMATCH (DB < API)";
  return "MISMATCH (DB > API)";
}

function printComparison(entity, api, db, notes = "") {
  console.log(`\n### ${entity}`);
  console.log("API:");
  console.log(`  Requested:     ${api.requested ?? "n/a"}`);
  console.log(`  Raw rows:      ${api.rawCount ?? "n/a"}`);
  console.log(`  In-scope rows: ${api.count}`);
  console.log(`  Earliest:      ${api.earliest ?? "none"}`);
  console.log(`  Latest:        ${api.latest ?? "none"}`);
  console.log("DB (full account):");
  console.log(`  Total rows:    ${db.totalRows}`);
  console.log(`  In-range rows: ${db.rowsInRange}`);
  console.log(`  Earliest:      ${db.earliest ?? "none"}`);
  console.log(`  Latest:        ${db.latest ?? "none"}`);
  console.log(`Status (in-range count): ${compareStatus(api, db)}`);
  console.log(`Status (earliest):       ${compareStatus(api, db, "earliest")}`);
  console.log(`Status (latest):         ${compareStatus(api, db, "latest")}`);
  if (notes) console.log(`Notes: ${notes}`);
}

async function main() {
  loadEnv();
  const { account, from, to, skipSync } = parseArgs();

  console.log("=== Sprint 6.17 API Coverage vs Persisted DB ===\n");
  console.log(`Account: ${account}`);
  console.log(`URL scope: dateFrom=${from} dateTo=${to}\n`);

  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");

  const wbAccount = await getMarketplaceAccountForSync(account);
  const api = new WbApiClient(wbAccount.apiKey);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log("--- Step 1: Wildberries API probe (before sync) ---\n");

  const ordersRaw = await api.fetchOrders(`${from}T00:00:00`);
  const ordersFiltered = ordersRaw.filter((o) =>
    isWithinDateRange(toDateString(o.date), from, to)
  );
  const ordersApi = {
    requested: `${from} → ${to} (fetchOrders dateFrom=${from}T00:00:00, client filter to dateTo)`,
    rawCount: ordersRaw.length,
    ...dateStats(ordersFiltered, (o) => toDateString(o.date)),
  };

  const salesRaw = await api.fetchSales(`${from}T00:00:00`);
  const salesFiltered = salesRaw.filter((s) =>
    isWithinDateRange(toDateString(s.date), from, to)
  );
  const salesUniqueSrids = new Set(
    salesFiltered.map((s) => s.srid ?? s.saleID).filter(Boolean)
  );
  const salesApi = {
    requested: `${from} → ${to} (fetchSales dateFrom=${from}T00:00:00, client filter to dateTo)`,
    rawCount: salesRaw.length,
    uniqueCount: salesUniqueSrids.size,
    ...dateStats(salesFiltered, (s) => toDateString(s.date)),
    count: salesUniqueSrids.size,
  };

  const { mapFinanceRowsFromReport } = await import("../src/lib/wildberries/mappers.ts");

  const financeRaw = await api.fetchFinanceReport(from, to);
  let financeExpectedDbLines = 0;
  for (const row of financeRaw) {
    financeExpectedDbLines += mapFinanceRowsFromReport(row, null).length;
  }
  const financeApi = {
    requested: `${from} → ${to} (reportDetailByPeriod)`,
    rawCount: financeRaw.length,
    reportRows: financeRaw.length,
    expectedDbLines: financeExpectedDbLines,
    ...dateStats(financeRaw, (r) => (r.rr_dt ? toDateString(r.rr_dt) : toDateString(r.sale_dt ?? ""))),
    count: financeExpectedDbLines,
  };

  const stocksRaw = await api.fetchStocks();
  const stocksApi = {
    requested: "snapshot (fetchStocks dateFrom=2019-01-01 default, no URL range)",
    rawCount: stocksRaw.length,
    earliest: "n/a (snapshot)",
    latest: "n/a (snapshot)",
    count: stocksRaw.length,
  };

  console.log("Orders API:", ordersApi);
  console.log("Sales API:", salesApi);
  console.log("Finance API:", financeApi);
  console.log("Inventory API:", stocksApi);
  console.log("Ads API: NOT IMPLEMENTED in sync pipeline");

  const dbBefore = {
    orders: await dbExtent(supabase, "wb_orders", "order_date", account, from, to),
    sales: await dbExtent(supabase, "wb_sales", "sale_date", account, from, to),
    finance: await dbExtent(supabase, "wb_finance", "operation_date", account, from, to),
    stock: await dbStockExtent(supabase, account),
  };

  console.log("\n--- DB snapshot BEFORE sync ---");
  console.log(JSON.stringify(dbBefore, null, 2));

  if (!skipSync) {
    console.log("\n--- Step 2: Full blocking sync with URL scope ---\n");
    const syncService = await createWbSyncService(account);
    const results = await syncService.syncAll({
      marketplaceAccountId: account,
      dateFrom: from,
      dateTo: to,
      entities: ["orders", "sales", "finance", "stock"],
    });
    console.log("Sync results:", JSON.stringify(results, null, 2));
  } else {
    console.log("\n--- Step 2: SKIPPED (--skip-sync) ---\n");
  }

  const dbAfter = {
    orders: await dbExtent(supabase, "wb_orders", "order_date", account, from, to),
    sales: await dbExtent(supabase, "wb_sales", "sale_date", account, from, to),
    finance: await dbExtent(supabase, "wb_finance", "operation_date", account, from, to),
    stock: await dbStockExtent(supabase, account),
  };

  console.log("\n--- Step 3: DB snapshot AFTER sync ---");
  console.log(JSON.stringify(dbAfter, null, 2));

  console.log("\n--- Step 4: Comparison table ---");

  printComparison(
    "Orders",
    ordersApi,
    dbAfter.orders,
    ordersApi.rawCount > ordersApi.count
      ? `${ordersApi.rawCount - ordersApi.count} API rows outside dateTo filter`
      : ""
  );

  printComparison(
    "Sales",
    salesApi,
    dbAfter.sales,
    `${salesFiltered.length} API rows in scope → ${salesUniqueSrids.size} unique srid keys (sync dedupes to this count)`
  );

  printComparison(
    "Finance (expanded fee lines)",
    financeApi,
    dbAfter.finance,
    `API ${financeApi.reportRows} report rows → ${financeExpectedDbLines} expected DB fee lines`
  );

  printComparison(
    "Inventory (stock snapshot)",
    stocksApi,
    dbAfter.stock,
    "Stock is point-in-time snapshot; DB row count reflects matched products only"
  );

  console.log("\n--- Step 5: Conclusion ---\n");

  const apiOrdersEarliest = ordersApi.earliest;
  const apiSalesEarliest = salesApi.earliest;
  const apiFinanceEarliest = financeApi.earliest;

  if (
    apiOrdersEarliest &&
    apiOrdersEarliest > from &&
    dbAfter.orders.earliest === apiOrdersEarliest
  ) {
    console.log(
      `✓ Orders: Wildberries API earliest (${apiOrdersEarliest}) is AFTER requested from (${from}). DB matches API — API does not provide older orders.`
    );
  } else if (ordersApi.count > dbAfter.orders.rowsInRange * 1.05) {
    console.log(
      `✗ Orders: Sync pipeline may be dropping rows (API in-scope ${ordersApi.count} vs DB in-range ${dbAfter.orders.rowsInRange})`
    );
  } else {
    console.log(
      `✓ Orders: API in-scope ${ordersApi.count}, DB in-range ${dbAfter.orders.rowsInRange} — pipeline aligned`
    );
  }

  if (
    apiSalesEarliest &&
    apiSalesEarliest > from &&
    dbAfter.sales.earliest === apiSalesEarliest
  ) {
    console.log(
      `✓ Sales: Wildberries API earliest (${apiSalesEarliest}) is AFTER requested from (${from}). DB matches API — API does not provide older sales.`
    );
  } else if (salesApi.count > dbAfter.sales.rowsInRange * 1.05) {
    console.log(
      `✗ Sales: Sync pipeline may be dropping rows (API in-scope ${salesApi.count} vs DB in-range ${dbAfter.sales.rowsInRange})`
    );
  } else {
    console.log(
      `✓ Sales: API in-scope ${salesApi.count}, DB in-range ${dbAfter.sales.rowsInRange} — pipeline aligned`
    );
  }

  if (
    apiFinanceEarliest &&
    apiFinanceEarliest > from &&
    dbAfter.finance.earliest === apiFinanceEarliest
  ) {
    console.log(
      `✓ Finance: Wildberries API earliest (${apiFinanceEarliest}) is AFTER requested from (${from}). DB matches API.`
    );
  } else if (financeExpectedDbLines > dbAfter.finance.rowsInRange * 1.05) {
    console.log(
      `✗ Finance: Sync pipeline may be dropping rows (API expected ${financeExpectedDbLines} fee lines vs DB in-range ${dbAfter.finance.rowsInRange})`
    );
  } else if (dbAfter.finance.rowsInRange > financeExpectedDbLines * 1.05) {
    console.log(
      `✗ Finance: DB has more rows than API expansion predicts (${dbAfter.finance.rowsInRange} vs ${financeExpectedDbLines})`
    );
  } else {
    console.log(
      `✓ Finance: API expected ${financeExpectedDbLines} fee lines, DB in-range ${dbAfter.finance.rowsInRange} — pipeline aligned`
    );
  }

  console.log("\nAds: not synced — N/A");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
