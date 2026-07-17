#!/usr/bin/env node
/**
 * Part 1 — Finance API investigation: date-range behavior + DB for_pay coverage.
 * Usage: npx tsx scripts/audit-finance-api-history.mjs [accountId]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { sumNetForPayFromFinance, countFinanceForPayLines } from "../src/lib/wb-settlement.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const MONTHS = [
  { label: "January", from: "2026-01-01", to: "2026-01-31" },
  { label: "February", from: "2026-02-01", to: "2026-02-28" },
  { label: "March", from: "2026-03-01", to: "2026-03-31" },
  { label: "April", from: "2026-04-01", to: "2026-04-30" },
  { label: "May", from: "2026-05-01", to: "2026-05-31" },
  { label: "June", from: "2026-06-01", to: "2026-06-30" },
  { label: "July", from: "2026-07-01", to: "2026-07-12" },
];

const API_PROBE_RANGES = [
  { label: "Jan 2026 (full month)", from: "2026-01-01", to: "2026-01-31" },
  { label: "Mar 2026 (full month)", from: "2026-03-01", to: "2026-03-31" },
  { label: "Jan 1 → Jul 12 (YTD single request)", from: "2026-01-01", to: "2026-07-12" },
  { label: "Last 30 days", from: "2026-06-13", to: "2026-07-12" },
  { label: "90-day window", from: "2026-04-14", to: "2026-07-12" },
];

function summarizeApiRows(rows) {
  const withForPay = rows.filter((r) => r.ppvz_for_pay && Math.abs(r.ppvz_for_pay) > 0);
  const rrDates = rows.map((r) => r.rr_dt?.slice(0, 10)).filter(Boolean);
  const minDate = rrDates.length ? rrDates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = rrDates.length ? rrDates.reduce((a, b) => (a > b ? a : b)) : null;
  const sumForPay =
    withForPay.reduce((s, r) => {
      const isReturn = r.doc_type_name === "Возврат" || r.supplier_oper_name === "Возврат";
      const amt = Math.abs(r.ppvz_for_pay);
      return s + (isReturn ? -amt : amt);
    }, 0);
  return {
    totalRows: rows.length,
    forPayRows: withForPay.length,
    sumPpvzForPay: sumForPay,
    minRrDt: minDate,
    maxRrDt: maxDate,
    reportIds: [...new Set(rows.map((r) => r.realizationreport_id))].sort((a, b) => a - b),
  };
}

async function fetchAllFinanceInDb(client, accountId) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_finance")
      .select("operation_date, amount, source_key")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", "2026-01-01")
      .lte("operation_date", "2026-07-12")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function dbMonthlyStats(client, accountId) {
  const all = await fetchAllFinanceInDb(client, accountId);
  const table = [];

  for (const m of MONTHS) {
    const monthRows = all.filter(
      (r) => r.operation_date >= m.from && r.operation_date <= m.to
    );
    const forPayRows = monthRows.filter(
      (r) => parseWbSourceSuffix(r.source_key, null) === "for_pay"
    );
    table.push({
      month: m.label,
      financeRows: monthRows.length,
      forPayRows: forPayRows.length,
      revenueNetForPay: sumNetForPayFromFinance(monthRows),
    });
  }

  const allForPay = all.filter(
    (r) => parseWbSourceSuffix(r.source_key, null) === "for_pay"
  );
  const forPayDates = allForPay.map((r) => r.operation_date).sort();
  return {
    table,
    earliestForPay: forPayDates[0] ?? null,
    latestForPay: forPayDates[forPayDates.length - 1] ?? null,
    totalFinanceRows: all.length,
    totalForPayLines: allForPay.length,
  };
}

async function main() {
  loadEnv();
  const accountId = process.argv[2] ?? "1";
  const account = await getMarketplaceAccountForSync(accountId);
  const api = new WbApiClient(account.apiKey);
  const db = createAdminClient();

  console.log("=== Part 1: Finance API Investigation ===\n");
  console.log(`Account: ${accountId}\n`);

  // DB coverage
  console.log("--- DB: for_pay coverage by month (2026) ---");
  const dbStats = await dbMonthlyStats(db, accountId);
  console.table(dbStats.table);
  console.log("Earliest for_pay operation_date in DB:", dbStats.earliestForPay);
  console.log("Latest for_pay operation_date in DB:", dbStats.latestForPay);
  console.log("Total finance rows (YTD):", dbStats.totalFinanceRows);
  console.log("Total for_pay lines (YTD):", dbStats.totalForPayLines);

  // Check if for_pay suffix exists on older finance rows (any suffix distribution)
  const { data: suffixSample } = await db
    .from("wb_finance")
    .select("operation_date, source_key")
    .eq("marketplace_account_id", accountId)
    .lt("operation_date", "2026-06-08")
    .limit(5);
  console.log("\nSample finance rows BEFORE 2026-06-08:", suffixSample?.length ?? 0);
  if (suffixSample?.length) {
    console.log("  Examples:", suffixSample.map((r) => r.source_key).slice(0, 3));
  }

  const { count: preJunFinanceCount } = await db
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .lt("operation_date", "2026-06-08");

  const { count: preJunForPayCount } = await db
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .lt("operation_date", "2026-06-08")
    .like("source_key", "%:for_pay");

  console.log(`Finance rows before 2026-06-08: ${preJunFinanceCount ?? 0}`);
  console.log(`for_pay rows before 2026-06-08: ${preJunForPayCount ?? 0}`);

  // API probes
  console.log("\n--- API: reportDetailByPeriod probes ---");
  const apiResults = [];

  for (const probe of API_PROBE_RANGES) {
    console.log(`\nProbing: ${probe.label} (${probe.from} → ${probe.to})`);
    const url = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${probe.from}&dateTo=${probe.to}&limit=100000&rrdid=0`;
    console.log(`  GET ${url}`);

    let rows;
    let error = null;
    try {
      rows = await api.fetchFinanceReport(probe.from, probe.to);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      rows = [];
    }

    const summary = error
      ? { error, totalRows: 0 }
      : summarizeApiRows(rows);
    apiResults.push({ ...probe, ...summary });
    console.log("  Result:", JSON.stringify(summary, null, 2));
  }

  const outDir = resolve("exports/finance-api-investigation");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "investigation-summary.json"),
    JSON.stringify({ accountId, dbStats, apiResults, probedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`\nWrote ${outDir}/investigation-summary.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
