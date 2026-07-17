#!/usr/bin/env node
/**
 * Weekly sales backfill — one week at a time with per-week DB persistence.
 *
 * Replaces the previous monthly recovery strategy. Monthly windows are never
 * retried; only missing calendar weeks are imported.
 *
 * Usage:
 *   npx tsx scripts/resume-sales-backfill.mjs <accountId> [from] [to]
 *
 * On HTTP 429: saves progress, exponential backoff, retries the same week until
 * RECOVERY_DEFAULTS.maxSyncAttempts; only then exits. Non-429 failures still stop.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { buildNetSalesFromDb, netSalesNeedsApiFallback } from "../src/lib/sales-revenue-resolution.ts";
import {
  RECOVERY_DEFAULTS,
  acquireLock,
  releaseLock,
  loadProgress,
  saveProgress,
  isRateLimitedError,
  backoffMs,
  sleep,
} from "./lib/sales-backfill-recovery.mjs";
import {
  WEEKLY_DEFAULTS,
  buildWeeklyWindows,
  seedWeeklyFromLegacy,
  getPendingWeeks,
  checkpointWeekSuccess,
  checkpointWeekFailure,
} from "./lib/sales-backfill-weekly.mjs";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
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

function save429Progress(accountId, week, attempt) {
  const progress = loadProgress(accountId);
  progress.meta ??= {};
  progress.meta.last429At = new Date().toISOString();
  progress.meta.last429Week = week.label;
  progress.meta.retryAttempt = attempt;
  saveProgress(accountId, progress);
}

async function syncWeekWithRetry(sync, accountId, week, startingRetries = 0) {
  let rateLimitAttempts = 0;
  let retries = startingRetries;

  while (true) {
    retries += 1;

    let result;
    try {
      result = await sync.syncSales(week.from, week.to);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRateLimitedError(message)) {
        rateLimitAttempts += 1;
        save429Progress(accountId, week, rateLimitAttempts);
        if (rateLimitAttempts >= RECOVERY_DEFAULTS.maxSyncAttempts) {
          checkpointWeekFailure(accountId, loadProgress(accountId), week, message, { retries });
          return { ok: false, message, retries, rateLimitAttempts, rateLimitExhausted: true };
        }
        const wait = backoffMs(rateLimitAttempts);
        console.log(
          `  HTTP 429 — saved progress, waiting ${Math.round(wait / 1000)}s (attempt ${rateLimitAttempts}/${RECOVERY_DEFAULTS.maxSyncAttempts})...`
        );
        await sleep(wait);
        continue;
      }
      checkpointWeekFailure(accountId, loadProgress(accountId), week, message, { retries });
      return { ok: false, message, retries, rateLimitAttempts, rateLimitExhausted: false };
    }

    if (hasFatalErrors(result.errors)) {
      const message = result.errors.filter((e) => !isNonFatalSalesWarning(e)).join("; ");
      if (isRateLimitedError(message)) {
        rateLimitAttempts += 1;
        save429Progress(accountId, week, rateLimitAttempts);
        if (rateLimitAttempts >= RECOVERY_DEFAULTS.maxSyncAttempts) {
          checkpointWeekFailure(accountId, loadProgress(accountId), week, message, { retries });
          return { ok: false, message, retries, rateLimitAttempts, rateLimitExhausted: true };
        }
        const wait = backoffMs(rateLimitAttempts);
        console.log(
          `  HTTP 429 — saved progress, waiting ${Math.round(wait / 1000)}s (attempt ${rateLimitAttempts}/${RECOVERY_DEFAULTS.maxSyncAttempts})...`
        );
        await sleep(wait);
        continue;
      }
      checkpointWeekFailure(accountId, loadProgress(accountId), week, message, { retries });
      return { ok: false, message, retries, rateLimitAttempts, rateLimitExhausted: false };
    }

    return { ok: true, result, retries: retries - 1, rateLimitAttempts };
  }
}

async function countSalesState(client, accountId, from, to) {
  const probe = await client.from("wb_sales").select("price_with_disc, for_pay").limit(1);
  if (probe.error) return { columnsMissing: true, error: probe.error.message };

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
  return {
    columnsMissing: false,
    totalRows: rows.length,
    nonReturns: nonReturns.length,
    withDisc: nonReturns.filter((r) => Number(r.price_with_disc) > 0).length,
    withForPay: rows.filter((r) => Number(r.for_pay) > 0).length,
    netSales: buildNetSalesFromDb(rows).netSales,
    needsApiFallback: netSalesNeedsApiFallback(rows),
  };
}

async function runWeeklyBackfill(accountId, from, to) {
  acquireLock(accountId);

  try {
    const client = createAdminClient();
    const sync = await createWbSyncService(accountId);
    const progress = loadProgress(accountId);

    progress.meta ??= {};
    progress.meta.strategy = "weekly";
    progress.meta.range = { from, to };
    progress.meta.runStartedAt = new Date().toISOString();
    saveProgress(accountId, progress);

    const seeded = seedWeeklyFromLegacy(accountId, progress, from, to);
    const allWeeks = buildWeeklyWindows(from, to);
    const pending = getPendingWeeks(accountId, from, to, loadProgress(accountId));

    const before = await countSalesState(client, accountId, from, to);

    console.log("\n=== Sales Backfill (Weekly) ===");
    console.log(`Account: ${accountId}  Range: ${from} → ${to}`);
    console.log(`Total weeks in range: ${allWeeks.length}`);
    console.log(`Legacy week files seeded: ${seeded}`);
    console.log(`Pending weeks: ${pending.length}`);
    console.log("Before:", before);

    if (before.columnsMissing) {
      throw new Error("wb_sales.price_with_disc / for_pay columns missing");
    }

    if (pending.length === 0) {
      console.log("\nAll weeks complete — nothing to import.");
      return {
        before,
        after: before,
        runLog: [],
        remaining: 0,
        stoppedOn429: false,
        total429Events: 0,
        totalRowsUpdated: 0,
        totalRowsProcessed: 0,
        currentWeek: null,
      };
    }

    const runLog = [];
    let stoppedOn429 = false;
    let total429Events = 0;
    let totalRowsUpdated = 0;
    let totalRowsProcessed = 0;

    for (let i = 0; i < pending.length; i += 1) {
      const { week, resolved } = pending[i];
      const startingRetries = resolved.failedEntry?.retries ?? resolved.weekFile?.retries ?? 0;

      console.log(`\n[${i + 1}/${pending.length}] Week: ${week.label} (${week.month}/${week.weekFile})`);
      if (resolved.status === "failed") {
        console.log(`  Retrying previously failed week`);
      }

      const outcome = await syncWeekWithRetry(sync, accountId, week, startingRetries);
      total429Events += outcome.rateLimitAttempts ?? 0;

      if (!outcome.ok) {
        runLog.push({
          week: week.label,
          status: "failed",
          error: outcome.message,
          retries: outcome.retries,
          rateLimitAttempts: outcome.rateLimitAttempts,
        });
        if (outcome.rateLimitExhausted) {
          console.log(`  HTTP 429 retry limit reached for ${week.label}.`);
          stoppedOn429 = true;
        } else {
          console.log(`  FAILED: ${outcome.message.slice(0, 300)}`);
        }
        break;
      }

      const { result } = outcome;
      totalRowsUpdated += result.recordsUpdated ?? 0;
      totalRowsProcessed += result.recordsProcessed ?? 0;

      console.log(
        `  OK: processed=${result.recordsProcessed} updated=${result.recordsUpdated} inserted=${result.recordsInserted ?? 0}`
      );
      if (outcome.rateLimitAttempts > 0) {
        console.log(`  (succeeded after ${outcome.rateLimitAttempts} HTTP 429 retry wait(s))`);
      }
      checkpointWeekSuccess(accountId, loadProgress(accountId), week, result, {
        retries: outcome.retries,
      });
      runLog.push({
        week: week.label,
        status: "completed",
        processed: result.recordsProcessed,
        updated: result.recordsUpdated,
        rateLimitAttempts: outcome.rateLimitAttempts,
      });

      if (i < pending.length - 1) {
        console.log(`  Cooldown ${WEEKLY_DEFAULTS.successCooldownMs / 1000}s before next week...`);
        await sleep(WEEKLY_DEFAULTS.successCooldownMs);
      }
    }

    const progressAfter = loadProgress(accountId);
    const remaining = getPendingWeeks(accountId, from, to, progressAfter);
    const after = await countSalesState(client, accountId, from, to);

    progressAfter.meta.runEndedAt = new Date().toISOString();
    progressAfter.meta.remainingWeeks = remaining.length;
    saveProgress(accountId, progressAfter);

    console.log("\nAfter:", after);
    console.log(`Remaining weeks: ${remaining.length}`);
    if (remaining.length > 0) {
      console.log("Next:", remaining.slice(0, 5).map((p) => p.week.label).join(", "));
    }

    return {
      before,
      after,
      runLog,
      remaining: remaining.length,
      stoppedOn429,
      total429Events,
      totalRowsUpdated,
      totalRowsProcessed,
      currentWeek: runLog.at(-1)?.week ?? null,
    };
  } finally {
    releaseLock(accountId);
  }
}

async function main() {
  loadEnv();

  const accountId = process.argv[2];
  const from = process.argv[3] ?? "2026-01-01";
  const to = process.argv[4] ?? new Date().toISOString().slice(0, 10);

  if (!accountId) {
    console.error("Usage: npx tsx scripts/resume-sales-backfill.mjs <accountId> [from] [to]");
    process.exit(1);
  }

  const summary = await runWeeklyBackfill(accountId, from, to);

  const reportPath = resolve(`exports/sales-backfill/weekly-run-${accountId}.json`);
  mkdirSync(resolve("exports/sales-backfill"), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), accountId, from, to, strategy: "weekly", ...summary }, null, 2)
  );
  console.log(`\nReport: ${reportPath}`);

  if (summary.remaining > 0) {
    console.log("\nWeekly backfill incomplete — re-run the same command to continue.");
    process.exit(summary.stoppedOn429 ? 2 : 1);
  }

  console.log("\nOK: weekly sales backfill complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
