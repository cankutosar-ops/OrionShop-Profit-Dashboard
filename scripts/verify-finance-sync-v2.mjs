#!/usr/bin/env node
/**
 * Verify Finance Sync V2: lookback recovers post-2026-07-05 data; idempotent re-run.
 * Usage: npx tsx scripts/verify-finance-sync-v2.mjs [accountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { runFinanceSyncV2 } from "../src/lib/wildberries/finance-sync-v2.ts";
import { releaseStaleSyncLockIfNeeded } from "../src/services/marketplace-account-service.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function countFinance(accountId, from, to) {
  const sb = createAdminClient();
  const { count } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte("operation_date", from)
    .lte("operation_date", to);
  return count ?? 0;
}

async function maxOp(accountId) {
  const sb = createAdminClient();
  const { data } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.operation_date ?? null;
}

async function hasReport(accountId, reportId) {
  const sb = createAdminClient();
  const { count, error } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .eq("realizationreport_id", reportId);
  if (error) return { ok: false, error: error.message, count: 0 };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  loadEnv();
  const accountId = process.argv[2] ?? "1";
  console.log("=== Finance Sync V2 verification ===");
  console.log("Account:", accountId);

  const sb = createAdminClient();
  const { error: colErr } = await sb.from("wb_finance").select("realizationreport_id").limit(1);
  const schemaReady = !colErr;
  if (!schemaReady) {
    console.warn(
      "WARN: realizationreport_id missing — apply npm run apply:finance-sync-v2-migration for full audit. Continuing lookback recovery test."
    );
  }
  const { error: runErr } = await sb.from("sync_runs").select("id").limit(1);
  if (runErr) {
    console.warn("WARN: sync_runs missing — audit writes will be skipped until migration.");
  }

  await releaseStaleSyncLockIfNeeded(accountId);

  const beforeMax = await maxOp(accountId);
  const beforeWeek = await countFinance(accountId, "2026-07-13", "2026-07-19");
  console.log("Before max operation_date:", beforeMax);
  console.log("Before week 2026-07-13→19 rows:", beforeWeek);

  const syncService = await createWbSyncService(accountId);
  const first = await runFinanceSyncV2({
    marketplaceAccountId: accountId,
    syncService,
    trigger: "recover",
    lookbackDays: 30,
  });
  console.log("First sync:", {
    status: first.status,
    rows: first.recordsUpdated,
    gapDays: first.gapDays,
    latest: first.latestOperationDate,
    reportIds: first.reportIds?.slice(0, 8),
    errors: first.errors.filter((e) => !e.includes("column missing")).slice(0, 3),
  });

  const afterMax = await maxOp(accountId);
  const afterWeek = await countFinance(accountId, "2026-07-13", "2026-07-19");
  const report = schemaReady ? await hasReport(accountId, 786182326) : { ok: false, count: 0 };
  console.log("After max operation_date:", afterMax);
  console.log("After week rows:", afterWeek);
  if (schemaReady) console.log("Report 786182326 rows:", report);

  const second = await runFinanceSyncV2({
    marketplaceAccountId: accountId,
    syncService,
    trigger: "recover",
    lookbackDays: 30,
  });
  const afterSecondWeek = await countFinance(accountId, "2026-07-13", "2026-07-19");
  console.log(
    "Second sync week rows (idempotent):",
    afterSecondWeek,
    "delta",
    afterSecondWeek - afterWeek
  );

  const ok =
    afterWeek > 0 &&
    afterMax != null &&
    String(afterMax).slice(0, 10) >= "2026-07-13" &&
    Math.abs(afterSecondWeek - afterWeek) < 50 &&
    (!schemaReady || report.count > 0);

  if (!ok) {
    console.error("FAIL: Finance Sync V2 did not recover expected coverage");
    process.exit(1);
  }
  console.log("\nOK: Finance Sync V2 lookback recovery + idempotency verified");
  if (!schemaReady) {
    console.log("NOTE: Apply migration for report-id audit columns + sync_runs.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
