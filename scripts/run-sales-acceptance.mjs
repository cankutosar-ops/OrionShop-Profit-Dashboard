#!/usr/bin/env node
/**
 * Sales Persistence Acceptance — full validation report for both accounts.
 * Writes: exports/sales-backfill/acceptance-report.json
 *
 * Usage: npx tsx scripts/run-sales-acceptance.mjs [from] [to]
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
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { loadProgress, progressPath } from "./lib/sales-backfill-recovery.mjs";

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

function r(n) {
  return Math.round(n * 100) / 100;
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

async function validateAccount(client, account) {
  const rows = await fetchSalesRows(client, account.id);
  const nonReturns = rows.filter((row) => !row.is_return);
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

  const scope = { marketplaceAccountId: account.id, companyId: "", from, to };
  const serviceResolution = await resolveNetSales(scope, rows);
  const dash = await getDashboardData(scope);

  const progress = existsSync(progressPath(account.id)) ? loadProgress(account.id) : null;

  const diffApiDb = apiBreakdown
    ? r(apiBreakdown.netSales - dbBreakdown.netSales)
    : null;
  const diffDashDb = r(dash.overview.modelBProfit.netSales - dbBreakdown.netSales);

  return {
    accountId: account.id,
    label: account.label,
    backfill: progress
      ? {
          completedWindows: Object.keys(progress.completedWindows ?? {}).length,
          failedWindows: Object.keys(progress.failedWindows ?? {}).length,
          pendingQueue: (progress.pendingQueue ?? []).length,
        }
      : null,
    rows: {
      total: rows.length,
      nonReturns: nonReturns.length,
      withDisc: nonReturns.length - missingDisc,
      withForPay: rows.length - missingForPay,
      missingDisc,
      missingForPay,
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
      },
      diffApiDb,
      diffDashDb,
    },
    checks: {
      backfillComplete: progress
        ? Object.keys(progress.failedWindows ?? {}).length === 0 &&
          (progress.pendingQueue ?? []).length === 0
        : true,
      missingDiscZero: missingDisc === 0,
      missingForPayZero: missingForPay === 0,
      dbOnlySource: serviceResolution.dataSource === "db",
      noApiFallback: !netSalesNeedsApiFallback(rows),
      netSalesReady: serviceResolution.status === "ready",
      apiMatchesDb: diffApiDb !== null && Math.abs(diffApiDb) < 0.01,
      dashboardMatchesDb: Math.abs(diffDashDb) < 0.01,
      parityZero: diffApiDb !== null && Math.abs(diffApiDb) < 0.01 && Math.abs(diffDashDb) < 0.01,
    },
  };
}

async function main() {
  const client = createAdminClient();
  const report = {
    generatedAt: new Date().toISOString(),
    period: { from, to },
    accounts: [],
    acceptancePassed: false,
  };

  for (const account of ACCOUNTS) {
    report.accounts.push(await validateAccount(client, account));
  }

  report.acceptancePassed = report.accounts.every((a) =>
    Object.values(a.checks).every(Boolean)
  );

  const outPath = resolve("exports/sales-backfill/acceptance-report.json");
  mkdirSync(resolve("exports/sales-backfill"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("=== SALES PERSISTENCE ACCEPTANCE ===\n");
  for (const a of report.accounts) {
    console.log(`## ${a.label} (account ${a.accountId})`);
    console.log("| Check | Status |");
    console.log("|-------|--------|");
    for (const [k, v] of Object.entries(a.checks)) {
      console.log(`| ${k} | ${v ? "PASS" : "FAIL"} |`);
    }
    console.log(`| missingDisc | ${a.rows.missingDisc} |`);
    console.log(`| missingForPay | ${a.rows.missingForPay} |`);
    if (a.revenue.api) {
      console.log(`| API netSales | ${r(a.revenue.api.netSales)} |`);
    }
    console.log(`| DB netSales | ${r(a.revenue.db.netSales)} |`);
    console.log(`| Dashboard netSales | ${r(a.revenue.dashboard.netSales)} (${a.revenue.dashboard.status}) |`);
    console.log("");
  }

  console.log(`Report: ${outPath}`);
  console.log(`Acceptance: ${report.acceptancePassed ? "PASS" : "FAIL"}`);

  if (!report.acceptancePassed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
