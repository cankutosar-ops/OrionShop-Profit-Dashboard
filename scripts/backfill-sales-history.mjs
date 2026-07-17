#!/usr/bin/env node
/**
 * Windowed historical Sales backfill — persists price_with_disc and for_pay.
 *
 * For historical recovery, use weekly checkpoints (recommended):
 *   npm run backfill:sales-resume -- 2 2026-01-01 2026-07-13
 *
 * Usage:
 *   npx tsx scripts/backfill-sales-history.mjs [accountId] [from] [to] [strategy]
 *
 * strategy: rolling30 | monthly | single  (legacy — prefer backfill:sales-resume weekly runner)
 *
 * Progress: exports/sales-backfill/progress-{accountId}.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { buildFinanceBackfillWindows } from "../src/lib/wildberries/finance-history-backfill.ts";
import { buildNetSalesFromDb, netSalesNeedsApiFallback } from "../src/lib/sales-revenue-resolution.ts";
import { acquireLock, releaseLock } from "./lib/sales-backfill-recovery.mjs";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const PROGRESS_DIR = resolve("exports/sales-backfill");

function progressPath(accountId) {
  return resolve(PROGRESS_DIR, `progress-${accountId}.json`);
}

function loadProgress(accountId) {
  const path = progressPath(accountId);
  if (!existsSync(path)) {
    return { completedWindows: {}, failedWindows: {} };
  }
  const state = JSON.parse(readFileSync(path, "utf8"));
  state.completedWindows ??= {};
  state.failedWindows ??= {};
  return state;
}

function saveProgress(accountId, state) {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(accountId), JSON.stringify(state, null, 2));
}

function isNonFatalSalesWarning(message) {
  return (
    message.includes("price_with_disc column missing") ||
    message.includes("apply-wb-sales-revenue-migration")
  );
}

function hasFatalErrors(errors) {
  return errors.some((e) => !isNonFatalSalesWarning(e));
}

function windowKey(window) {
  return `${window.from}:${window.to}`;
}

async function countSalesState(client, accountId, from, to) {
  const probe = await client.from("wb_sales").select("price_with_disc, for_pay").limit(1);
  if (probe.error) {
    return { columnsMissing: true, error: probe.error.message };
  }

  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_sales")
      .select("price_with_disc, for_pay, is_return, quantity")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", from)
      .lte("sale_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }

  const nonReturns = rows.filter((r) => !r.is_return);
  const withDisc = nonReturns.filter((r) => Number(r.price_with_disc) > 0).length;
  const withForPay = rows.filter((r) => Number(r.for_pay) > 0).length;
  const netSales = buildNetSalesFromDb(rows).netSales;

  return {
    columnsMissing: false,
    totalRows: rows.length,
    nonReturns: nonReturns.length,
    withDisc,
    withForPay,
    netSales,
    needsApiFallback: netSalesNeedsApiFallback(rows),
  };
}

async function runBackfill(accountId, from, to, strategy) {
  const client = createAdminClient();
  const sync = await createWbSyncService(accountId);
  const windows = buildFinanceBackfillWindows(from, to, strategy);
  const progress = loadProgress(accountId);

  console.log(`\n=== Sales backfill account ${accountId} ===`);
  console.log(`Period: ${from} → ${to}  Strategy: ${strategy}  Windows: ${windows.length}`);

  const before = await countSalesState(client, accountId, from, to);
  console.log("Before:", before);
  if (before.columnsMissing) {
    throw new Error(
      "wb_sales.price_with_disc / for_pay columns missing — run apply-wb-sales-revenue-migration.mjs first"
    );
  }

  const results = [];
  const failedKeys = new Set(Object.keys(progress.failedWindows ?? {}));

  for (const window of windows) {
    const key = windowKey(window);
    if (progress.completedWindows[key]) {
      console.log(`SKIP (already done): ${window.label}`);
      results.push({ window: window.label, skipped: true });
      continue;
    }

    const isRetry = failedKeys.has(key);
    console.log(`\nWindow: ${window.label}${isRetry ? " (retry)" : ""}`);

    let result;
    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        result = await sync.syncSales(window.from, window.to);
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isRateLimited =
          message.includes("429") || message.toLowerCase().includes("too many requests");

        progress.failedWindows[key] = {
          failedAt: new Date().toISOString(),
          error: message,
          label: window.label,
          attempts,
        };
        saveProgress(accountId, progress);

        if (isRateLimited && attempts < 10) {
          const cooldownMs = 15 * 60_000;
          console.log("  RATE LIMITED:", message);
          console.log(`  Cooldown ${cooldownMs / 1000}s then retry same window...`);
          await new Promise((resolveDelay) => setTimeout(resolveDelay, cooldownMs));
          continue;
        }

        results.push({ window: window.label, failed: true, error: message });
        console.log("  FAILED:", message);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 60_000));
        result = null;
        break;
      }
    }
    if (!result) continue;

    console.log("  processed:", result.recordsProcessed, "updated:", result.recordsUpdated);
    if (result.errors.length) {
      console.log("  errors:", result.errors.slice(0, 3));
    }

    if (hasFatalErrors(result.errors)) {
      const message = result.errors.filter((e) => !isNonFatalSalesWarning(e)).join("; ");
      progress.failedWindows[key] = {
        failedAt: new Date().toISOString(),
        error: message,
        label: window.label,
        processed: result.recordsProcessed,
        updated: result.recordsUpdated,
      };
      delete progress.completedWindows[key];
      saveProgress(accountId, progress);
      results.push({ window: window.label, failed: true, error: message });
      console.log("  FAILED:", message);
      const isRateLimited = message.includes("429") || message.toLowerCase().includes("too many requests");
      const cooldownMs = isRateLimited ? 600_000 : 15_000;
      console.log(`  Cooldown ${cooldownMs / 1000}s before next window...`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, cooldownMs));
      continue;
    }

    progress.completedWindows[key] = {
      completedAt: new Date().toISOString(),
      processed: result.recordsProcessed,
      updated: result.recordsUpdated,
    };
    delete progress.failedWindows[key];
    saveProgress(accountId, progress);
    results.push({
      window: window.label,
      processed: result.recordsProcessed,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 60_000));
  }

  const after = await countSalesState(client, accountId, from, to);
  console.log("\nAfter:", after);
  return { before, after, results };
}

async function main() {
  const accountId = process.argv[2];
  const from = process.argv[3] ?? "2026-01-01";
  const to = process.argv[4] ?? new Date().toISOString().slice(0, 10);
  const strategy = process.argv[5] ?? "monthly";

  if (!accountId) {
    console.error("Usage: npx tsx scripts/backfill-sales-history.mjs <accountId> [from] [to] [strategy]");
    process.exit(1);
  }

  acquireLock(accountId);
  try {
    await runBackfill(accountId, from, to, strategy);
    console.log("\nOK: sales backfill complete");
  } finally {
    releaseLock(accountId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
