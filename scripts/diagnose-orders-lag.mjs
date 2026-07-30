#!/usr/bin/env node
/**
 * Sprint 9.2 diagnostics ONLY — Orders API vs DB for a date window.
 * Does not sync, write, or mutate anything.
 *
 * Usage:
 *   npx tsx scripts/diagnose-orders-lag.mjs --account 1 --from 2026-07-13 --to 2026-07-24
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

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
  let from = "2026-07-13";
  let to = "2026-07-24";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--account" && args[i + 1]) account = args[++i];
    else if (args[i] === "--from" && args[i + 1]) from = args[++i];
    else if (args[i] === "--to" && args[i + 1]) to = args[++i];
  }
  return { account, from, to };
}

function toDateString(iso) {
  return String(iso).slice(0, 10);
}

function isWithin(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

function bump(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  loadEnv();
  const { account, from, to } = parseArgs();

  const { createClient } = await import("@supabase/supabase-js");
  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
  const { isWithinDateRange, toDateString: toDate } = await import(
    "../src/lib/wildberries/mappers.ts"
  );

  const wbAccount = await getMarketplaceAccountForSync(account);
  const api = new WbApiClient(wbAccount.apiKey);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log(`=== Orders lag diagnose ===`);
  console.log(`Account=${account} window=${from}→${to}`);
  console.log(`Fetch cursor dateFrom=${from}T00:00:00 flag=0 (same as syncOrders)`);

  const raw = await api.fetchOrders(`${from}T00:00:00`);
  const syncFilter = raw.filter(
    (o) =>
      isWithinDateRange(toDate(o.date), from, to) ||
      isWithinDateRange(toDate(o.lastChangeDate), from, to)
  );
  const byOrderDateInWindow = raw.filter((o) => isWithin(toDate(o.date), from, to));
  const byChangeDateInWindow = raw.filter((o) => isWithin(toDate(o.lastChangeDate), from, to));

  const orderDateHist = {};
  const changeDateHist = {};
  for (const o of raw) {
    bump(orderDateHist, toDate(o.date));
    bump(changeDateHist, toDate(o.lastChangeDate));
  }

  // DB extents
  const { data: minRow } = await supabase
    .from("wb_orders")
    .select("order_date,last_change_date")
    .eq("marketplace_account_id", account)
    .order("order_date", { ascending: true })
    .limit(1);
  const { data: maxRow } = await supabase
    .from("wb_orders")
    .select("order_date,last_change_date")
    .eq("marketplace_account_id", account)
    .order("order_date", { ascending: false })
    .limit(1);
  const { data: maxChange } = await supabase
    .from("wb_orders")
    .select("order_date,last_change_date")
    .eq("marketplace_account_id", account)
    .order("last_change_date", { ascending: false })
    .limit(1);
  const { count: totalDb } = await supabase
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account);
  const { count: dbOrderDateInWindow } = await supabase
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account)
    .gte("order_date", from)
    .lte("order_date", to);
  const { count: dbChangeInWindow } = await supabase
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account)
    .gte("last_change_date", from)
    .lte("last_change_date", to);

  // Sample API srids with order.date in window — are they in DB?
  const sample = byOrderDateInWindow.slice(0, 25).map((o) => ({
    srid: o.srid ?? o.gNumber ?? `${o.nmId}-${o.date}`,
    orderDate: toDate(o.date),
    lastChangeDate: toDate(o.lastChangeDate),
  }));
  const sampleSrids = sample.map((s) => s.srid).filter(Boolean);
  let presentInDb = [];
  if (sampleSrids.length) {
    const { data } = await supabase
      .from("wb_orders")
      .select("srid,order_date,last_change_date")
      .eq("marketplace_account_id", account)
      .in("srid", sampleSrids);
    presentInDb = data ?? [];
  }
  const presentSet = new Set(presentInDb.map((r) => r.srid));
  const missingSample = sample.filter((s) => !presentSet.has(s.srid));

  const report = {
    generatedAt: new Date().toISOString(),
    account,
    window: { from, to },
    api: {
      rawCount: raw.length,
      pagesObserved: "see sync logs (flag=0 stops when batch < 80000)",
      syncFilterWouldKeep: syncFilter.length,
      rowsWithOrderDateInWindow: byOrderDateInWindow.length,
      rowsWithLastChangeDateInWindow: byChangeDateInWindow.length,
      orderDateHistogram: Object.fromEntries(
        Object.entries(orderDateHist).sort(([a], [b]) => a.localeCompare(b))
      ),
      lastChangeDateHistogram: Object.fromEntries(
        Object.entries(changeDateHist).sort(([a], [b]) => a.localeCompare(b))
      ),
      earliestOrderDate: raw.length
        ? raw.map((o) => toDate(o.date)).sort()[0]
        : null,
      latestOrderDate: raw.length
        ? raw.map((o) => toDate(o.date)).sort().at(-1)
        : null,
      earliestChangeDate: raw.length
        ? raw.map((o) => toDate(o.lastChangeDate)).sort()[0]
        : null,
      latestChangeDate: raw.length
        ? raw.map((o) => toDate(o.lastChangeDate)).sort().at(-1)
        : null,
    },
    db: {
      totalRows: totalDb ?? 0,
      earliestOrderDate: minRow?.[0]?.order_date ?? null,
      latestOrderDate: maxRow?.[0]?.order_date ?? null,
      latestLastChangeDate: maxChange?.[0]?.last_change_date ?? null,
      rowsWithOrderDateInWindow: dbOrderDateInWindow ?? 0,
      rowsWithLastChangeDateInWindow: dbChangeInWindow ?? 0,
    },
    sampleProbe: {
      sampleSize: sample.length,
      presentInDb: presentInDb.length,
      missingFromDb: missingSample.length,
      missingExamples: missingSample.slice(0, 10),
      presentExamples: presentInDb.slice(0, 5),
    },
    conclusionHints: [],
  };

  if (report.api.rowsWithOrderDateInWindow > 0 && report.db.rowsWithOrderDateInWindow === 0) {
    report.conclusionHints.push(
      "API returns orders with order.date in the gap window, but DB has zero rows by order_date in that window → loss is AFTER fetch (filter/upsert/scheduling), or sync never persisted this window."
    );
  }
  if (report.api.rowsWithOrderDateInWindow > 0 && report.sampleProbe.missingFromDb > 0) {
    report.conclusionHints.push(
      "Sample API srids with order.date in-window are missing from DB → sync did not persist these rows."
    );
  }
  if (report.api.rawCount > 0 && report.api.rowsWithOrderDateInWindow === 0) {
    report.conclusionHints.push(
      "API returns rows for cursor but none have order.date in window (only lastChangeDate updates of older orders)."
    );
  }
  if (report.api.rawCount === 0) {
    report.conclusionHints.push("API returned zero rows for this cursor — upstream/API issue or dateFrom too new.");
  }

  const outDir = resolve(process.cwd(), "exports/browser-proof/sprint-9-2-orders-rca");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "orders-api-vs-db.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
