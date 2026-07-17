#!/usr/bin/env node
/**
 * Full Sales Persistence Sprint validation — schema, backfill status, API vs DB vs Dashboard.
 * Usage: npx tsx scripts/verify-sales-revenue-sprint.mjs [from] [to]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import {
  buildNetSalesFromApiSales,
  buildNetSalesFromDb,
  netSalesNeedsApiFallback,
  resolveNetSalesFromSources,
} from "../src/lib/sales-revenue-resolution.ts";
import { resolveNetSales } from "../src/services/sales-revenue-service.ts";
import { getDashboardData } from "../src/services/dashboard-service.ts";
import { buildFinanceBackfillWindows } from "../src/lib/wildberries/finance-history-backfill.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.argv[2] ?? "2026-01-01";
const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const ACCOUNTS = [
  { id: "1", label: "Default Company" },
  { id: "2", label: "Orion Shop" },
];

const PROGRESS_DIR = resolve("exports/sales-backfill");

function r(n) {
  return Math.round(n * 100) / 100;
}

function progressPath(accountId) {
  return resolve(PROGRESS_DIR, `progress-${accountId}.json`);
}

function loadProgress(accountId) {
  const path = progressPath(accountId);
  if (!existsSync(path)) {
    return { completedWindows: {}, failedWindows: {} };
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

async function fetchSalesRows(client, accountId) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_sales")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", from)
      .lte("sale_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function countDuplicates(rows) {
  const seen = new Map();
  let duplicates = 0;
  for (const row of rows) {
    const key = `${row.marketplace_account_id}:${row.srid}`;
    if (seen.has(key)) duplicates += 1;
    else seen.set(key, row.id);
  }
  return { unique: seen.size, duplicates };
}

function missingWindows(progress, strategy = "monthly") {
  const windows = buildFinanceBackfillWindows(from, to, strategy);
  const completed = progress.completedWindows ?? {};
  return windows.filter((w) => !completed[`${w.from}:${w.to}`]);
}

async function validateAccount(client, account) {
  const probeDisc = await client.from("wb_sales").select("price_with_disc").limit(1);
  const probePay = await client.from("wb_sales").select("for_pay").limit(1);
  const rows = await fetchSalesRows(client, account.id);
  const progress = loadProgress(account.id);
  const dupes = countDuplicates(rows);

  const nonReturns = rows.filter((row) => !row.is_return);
  const returns = rows.filter((row) => row.is_return);
  const withDisc = nonReturns.filter((row) => Number(row.price_with_disc) > 0).length;
  const withForPay = rows.filter((row) => Number(row.for_pay) > 0).length;
  const missingDisc = nonReturns.filter((row) => Number(row.price_with_disc) <= 0).length;
  const missingForPay = rows.filter((row) => Number(row.for_pay) <= 0).length;

  const dbBreakdown = buildNetSalesFromDb(rows);
  const dbResolution = resolveNetSalesFromSources({
    sales: rows,
    scopeFrom: from,
    scopeTo: to,
  });

  let apiBreakdown = null;
  let apiError = null;
  try {
    const wbAccount = await getMarketplaceAccountForSync(account.id);
    const wb = new WbApiClient(wbAccount.apiKey);
    const apiSales = await wb.fetchSales(`${from}T00:00:00`);
    apiBreakdown = buildNetSalesFromApiSales(apiSales, from, to);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  } catch (err) {
    apiError = err instanceof Error ? err.message : String(err);
  }

  const scope = {
    marketplaceAccountId: account.id,
    companyId: "",
    from,
    to,
  };
  const serviceResolution = await resolveNetSales(scope, rows);
  const dash = await getDashboardData(scope);

  const revenueDiff =
    apiBreakdown && dbBreakdown.netSales > 0
      ? r(apiBreakdown.netSales - dbBreakdown.netSales)
      : null;
  const dashboardDiff = r(dash.overview.modelBProfit.netSales - dbBreakdown.netSales);

  return {
    accountId: account.id,
    label: account.label,
    schema: {
      price_with_disc: !probeDisc.error,
      for_pay: !probePay.error,
      probeErrors: {
        price_with_disc: probeDisc.error?.message ?? null,
        for_pay: probePay.error?.message ?? null,
      },
    },
    rows: {
      total: rows.length,
      nonReturns: nonReturns.length,
      returns: returns.length,
      withDisc,
      withForPay,
      missingDisc,
      missingForPay,
      uniqueSrids: dupes.unique,
      duplicateRows: dupes.duplicates,
    },
    backfill: {
      completedWindows: Object.keys(progress.completedWindows ?? {}).length,
      failedWindows: Object.keys(progress.failedWindows ?? {}).length,
      pendingWindows: missingWindows(progress).map((w) => w.label),
      failedWindowDetails: progress.failedWindows ?? {},
    },
    revenue: {
      api: apiBreakdown,
      apiError,
      db: dbBreakdown,
      dashboard: {
        grossSales: dash.overview.modelBProfit.grossSales,
        returnedSales: dash.overview.modelBProfit.returnedSales,
        netSales: dash.overview.modelBProfit.netSales,
        status: dash.overview.modelBProfit.netSalesStatus,
      },
      serviceResolution: {
        dataSource: serviceResolution.dataSource,
        status: serviceResolution.status,
        netSales: serviceResolution.netSales,
      },
      diffApiDb: revenueDiff,
      diffDashboardDb: dashboardDiff,
    },
    checks: {
      schemaReady: !probeDisc.error && !probePay.error,
      discPopulated: nonReturns.length === 0 || withDisc / nonReturns.length >= 0.95,
      forPayPopulated: rows.length === 0 || withForPay / rows.length >= 0.95,
      noApiFallback: !netSalesNeedsApiFallback(rows),
      dbOnlySource: serviceResolution.dataSource === "db",
      netSalesReady: serviceResolution.status === "ready",
      apiMatchesDb: revenueDiff !== null && Math.abs(revenueDiff) < 0.01,
      dashboardMatchesDb: Math.abs(dashboardDiff) < 0.01,
      noDuplicates: dupes.duplicates === 0,
    },
  };
}

function allYes(checks) {
  return Object.values(checks).every(Boolean);
}

async function main() {
  const client = createAdminClient();
  const report = {
    generatedAt: new Date().toISOString(),
    period: { from, to },
    accounts: [],
    sprintComplete: false,
  };

  for (const account of ACCOUNTS) {
    report.accounts.push(await validateAccount(client, account));
  }

  report.sprintComplete = report.accounts.every((a) => allYes(a.checks));

  mkdirSync(PROGRESS_DIR, { recursive: true });
  const outPath = resolve(PROGRESS_DIR, "validation-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("=== SALES PERSISTENCE SPRINT VALIDATION ===");
  console.log(`Period: ${from} → ${to}\n`);

  for (const a of report.accounts) {
    console.log(`## ${a.label} (account ${a.accountId})`);
    console.log("| Check | Status |");
    console.log("|-------|--------|");
    console.log(`| Schema (price_with_disc, for_pay) | ${a.checks.schemaReady ? "PASS" : "FAIL"} |`);
    console.log(`| price_with_disc populated | ${a.checks.discPopulated ? "PASS" : "FAIL"} (${a.rows.withDisc}/${a.rows.nonReturns}) |`);
    console.log(`| for_pay populated | ${a.checks.forPayPopulated ? "PASS" : "FAIL"} (${a.rows.withForPay}/${a.rows.total}) |`);
    console.log(`| No API fallback needed | ${a.checks.noApiFallback ? "PASS" : "FAIL"} |`);
    console.log(`| DB-only data source | ${a.checks.dbOnlySource ? "PASS" : "FAIL"} |`);
    console.log(`| netSales ready | ${a.checks.netSalesReady ? "PASS" : "FAIL"} |`);
    console.log(
      `| API = DB netSales | ${a.revenue.apiError ? `SKIP (${a.revenue.apiError})` : a.checks.apiMatchesDb ? "PASS" : `FAIL (diff ${a.revenue.diffApiDb})`} |`
    );
    console.log(
      `| Dashboard = DB | ${a.checks.dashboardMatchesDb ? "PASS" : `FAIL (diff ${a.revenue.diffDashboardDb})`} |`
    );
    console.log(`| No duplicate SRIDs | ${a.checks.noDuplicates ? "PASS" : "FAIL"} |`);
    console.log(`| Backfill windows completed | ${a.backfill.completedWindows} |`);
    console.log(`| Backfill windows failed | ${a.backfill.failedWindows} |`);
    console.log(`| Pending windows | ${a.backfill.pendingWindows.length} |`);
    if (a.revenue.db) {
      console.log(`\nGross Sales: ${r(a.revenue.db.grossSales)}`);
      console.log(`Returned Sales: ${r(a.revenue.db.returnedSales)}`);
      console.log(`Net Sales (DB): ${r(a.revenue.db.netSales)}`);
      if (a.revenue.api) {
        console.log(`Net Sales (API): ${r(a.revenue.api.netSales)}`);
      }
      console.log(`Net Sales (Dashboard): ${r(a.revenue.dashboard.netSales)} (${a.revenue.dashboard.status})`);
    }
    console.log("");
  }

  console.log(`Report written: ${outPath}`);
  console.log(`\nSprint complete: ${report.sprintComplete ? "YES" : "NO"}`);

  if (!report.sprintComplete) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
