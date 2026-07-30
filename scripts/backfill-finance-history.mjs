#!/usr/bin/env node
/**
 * Backfill wb_finance history from Wildberries reportDetailByPeriod.
 *
 * Finance Sync V2: progress JSON is audit-only. Windows are always revalidated
 * (delayed WB realization reports must never be treated as permanently complete).
 *
 * Usage:
 *   npx tsx scripts/backfill-finance-history.mjs [accountId] [from] [to] [strategy]
 *
 * strategy: monthly (default) | rolling30 | single
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import {
  buildFinanceBackfillWindows,
  hasFatalSyncErrors,
  isNonFatalSyncWarning,
  runFinanceHistoryBackfill,
} from "../src/lib/wildberries/finance-history-backfill.ts";
import { parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const PROGRESS_DIR = resolve("exports/finance-backfill");

function progressPath(accountId) {
  return resolve(PROGRESS_DIR, `progress-${accountId}.json`);
}

function loadProgress(accountId) {
  const path = progressPath(accountId);
  if (!existsSync(path)) {
    return { completedWindows: {} };
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveProgress(accountId, state) {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(accountId), JSON.stringify(state, null, 2));
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

async function fetchFinanceInRange(db, accountId, from, to) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function monthlyValidationTable(db, accountId) {
  const table = [];
  for (const m of MONTHS) {
    const rows = await fetchFinanceInRange(db, accountId, m.from, m.to);
    const forPayRows = rows.filter(
      (r) => parseWbSourceSuffix(r.source_key, null) === "for_pay"
    );
    table.push({
      Month: m.label,
      "Finance Rows": rows.length,
      "for_pay Rows": forPayRows.length,
      "Revenue (netForPay)": Math.round(sumNetForPayFromFinance(rows) * 100) / 100,
    });
  }
  return table;
}

async function modelCRevenueCheck(db, accountId) {
  const ranges = [
    { label: "Last 30 Days", ...buildInclusiveDateRange(30) },
    { label: "Last 60 Days", ...buildInclusiveDateRange(60) },
    { label: "Last 90 Days", ...buildInclusiveDateRange(90) },
  ];

  const results = [];
  for (const range of ranges) {
    const finance = await fetchFinanceInRange(db, accountId, range.from, range.to);
    const forPayCount = finance.filter(
      (r) => parseWbSourceSuffix(r.source_key, null) === "for_pay"
    ).length;

    // Minimal Model C revenue (netForPay only for this check)
    const netForPay = sumNetForPayFromFinance(finance);
    const modelC = buildModelCProfitMetrics({
      netForPay,
      marketplaceFees: 0,
      logistics: 0,
      storage: 0,
      penalties: 0,
      deductions: 0,
      acceptance: 0,
      productCost: 0,
      advertising: 0,
    });

    results.push({
      Range: range.label,
      Period: `${range.from} → ${range.to}`,
      "for_pay Rows": forPayCount,
      "Model C Revenue": Math.round(modelC.revenue * 100) / 100,
    });
  }
  return results;
}

async function main() {
  loadEnv();

  const accountId = process.argv[2] ?? "1";
  const to = process.argv[4] ?? new Date().toISOString().slice(0, 10);
  const year = to.slice(0, 4);
  const from = process.argv[3] ?? `${year}-01-01`;
  const strategy = process.argv[5] ?? "monthly";

  console.log("=== Finance Historical Backfill ===");
  console.log(`Account:  ${accountId}`);
  console.log(`Period:   ${from} → ${to}`);
  console.log(`Strategy: ${strategy}\n`);

  const db = createAdminClient();
  const syncService = await createWbSyncService(accountId);
  const progress = loadProgress(accountId);
  const resumeMap = new Map(
    Object.entries(progress.completedWindows ?? {}).map(([k, v]) => [k, Boolean(v)])
  );

  const windows = buildFinanceBackfillWindows(from, to, strategy);
  console.log(`Windows to process: ${windows.length}\n`);

  const result = await runFinanceHistoryBackfill(syncService, {
    from,
    to,
    strategy,
    resumeFromProgress: resumeMap,
    fetchFinanceInRange: (windowFrom, windowTo) =>
      fetchFinanceInRange(db, accountId, windowFrom, windowTo),
    onPeriodComplete: (period) => {
      console.log(`Processing:\n${period.window.from} → ${period.window.to}`);
      if (period.skipped) {
        console.log("  (skipped — already complete)\n");
        return;
      }
      console.log(`  API rows:        ${period.apiRowsProcessed}`);
      console.log(`  Upserted lines:  ${period.financeLinesUpserted}`);
      console.log(`  for_pay before:  ${period.forPayLinesBefore}`);
      console.log(`  for_pay after:   ${period.forPayLinesAfter}`);
      console.log(`  for_pay added:   ${period.forPayLinesAdded}`);
      console.log(`  netForPay after: ${period.netForPayAfter.toFixed(2)} ₽`);
      if (period.errors.length) {
        const fatal = period.errors.filter((e) => !isNonFatalSyncWarning(e));
        if (fatal.length) {
          console.log(`  Errors:          ${fatal.slice(0, 3).join("; ")}`);
        } else {
          console.log(`  Warnings:        ${period.errors.slice(0, 2).join("; ")}`);
        }
      }
      console.log("");

      const canMarkComplete =
        period.errors.length === 0 || !hasFatalSyncErrors(period.errors);
      if (canMarkComplete) {
        progress.completedWindows = progress.completedWindows ?? {};
        progress.completedWindows[`${period.window.from}:${period.window.to}`] = true;
        progress.lastCompletedAt = new Date().toISOString();
        saveProgress(accountId, progress);
      }
    },
  });

  console.log("=== Backfill Summary ===");
  console.log(`Completed:           ${result.completed}`);
  if (result.stoppedAt) console.log(`Stopped at:          ${result.stoppedAt}`);
  console.log(`Total API rows:      ${result.totalApiRows}`);
  console.log(`Total upserted:      ${result.totalFinanceLinesUpserted}`);
  console.log(`Total for_pay added: ${result.totalForPayLinesAdded}\n`);

  console.log("=== Monthly Validation ===");
  console.table(await monthlyValidationTable(db, accountId));

  console.log("\n=== Model C Revenue Check ===");
  console.table(await modelCRevenueCheck(db, accountId));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
