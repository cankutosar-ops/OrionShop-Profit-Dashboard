#!/usr/bin/env node
/**
 * PHASE 4 — Account 2 Finance Reports/V1 sequential catch-up (post-recovery).
 *
 * Starts at 2026-08-29 → 2026-09-04 @ rrdId=0, then nextWeeklyReportsPeriod chain.
 * Does NOT reopen historical recovery campaignStatus.
 * Does NOT release ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE.
 * Does NOT call V5 / list.
 * Does NOT require finance_incremental_sync_state (separate durable seed).
 * One HTTP page per loop; cursor advances only after successful UPSERT.
 *
 * Usage:
 *   npx tsx scripts/phase4-account2-finance-v1-catchup.mjs --once
 *   npx tsx scripts/phase4-account2-finance-v1-catchup.mjs --continue
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ACCOUNT_ID = "2";
const EXPECTED_SELLER = "68674";
const TODAY = "2026-09-06";
const FIRST_FROM = "2026-08-29";
const FIRST_TO = "2026-09-04";
const PROGRESS_PATH = resolve(
  "exports/finance-backfill/account-2-phase4-catchup-progress.json"
);
const A1_EXPECTED_ROWS = 73280;
const A1_EXPECTED_MAX = "2026-08-23";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(name), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
      }
    } catch {
      /* optional */
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultProgress() {
  return {
    accountId: ACCOUNT_ID,
    purpose: "phase4_post_recovery_v1_catchup",
    campaignStatus: "completed", // historical recovery stays completed
    activeWeek: { from: FIRST_FROM, to: FIRST_TO, key: `${FIRST_FROM}:${FIRST_TO}` },
    rrdId: 0,
    completedWeeks: {},
    reportsLastRequestAt: null,
    reportsNextRequestNotBefore: null,
    reportsServerRetryUntil: null,
    stats: {
      http: 0,
      v1: 0,
      v5: 0,
      list: 0,
      upserted: 0,
      status204: 0,
      status429: 0,
      failed: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) return defaultProgress();
  return { ...defaultProgress(), ...JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) };
}

function saveProgress(p) {
  mkdirSync(resolve("exports/finance-backfill"), { recursive: true });
  p.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

async function financeSnap(sb, id) {
  const { count } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", id);
  const { data: maxRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    max: maxRow?.operation_date ? String(maxRow.operation_date).slice(0, 10) : null,
  };
}

async function main() {
  loadEnv();
  const once = process.argv.includes("--once");
  const cont = process.argv.includes("--continue") || once;
  if (!cont) {
    console.error("Usage: --once | --continue");
    process.exit(1);
  }

  const { assertFinanceRecoveryOwnsQuota } = await import(
    "../src/lib/finance-recovery/reservation.ts"
  );
  const { assertFinanceV1LiveAllowed, assertFinanceV1TokenReady } = await import(
    "../src/lib/wildberries/finance-v1.ts"
  );
  const { nextWeeklyReportsPeriod } = await import(
    "../src/lib/finance-recovery/reports-ingestion.ts"
  );
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
  const {
    ensureReportsRequestGate,
    reportsRecoveryRequestBlockedUntil,
    recordReportsRecovery429Hint,
    FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  } = await import("../src/lib/finance-recovery/coordination.ts");

  const ownership = assertFinanceRecoveryOwnsQuota(ACCOUNT_ID, PROGRESS_PATH);
  if (!ownership.ok) {
    console.error("BLOCKED:", ownership.reason);
    process.exit(2);
  }
  assertFinanceV1LiveAllowed();

  const account = await getMarketplaceAccountForSync(ACCOUNT_ID);
  if (String(account.seller_id ?? "") !== EXPECTED_SELLER) {
    console.error(`BLOCKED: seller_id=${account.seller_id}, expected ${EXPECTED_SELLER}`);
    process.exit(2);
  }
  assertFinanceV1TokenReady(account.apiKey);

  const sb = createAdminClient();
  const a1Before = await financeSnap(sb, "1");
  if (a1Before.count !== A1_EXPECTED_ROWS || a1Before.max !== A1_EXPECTED_MAX) {
    console.warn("WARN A1 baseline drifted:", a1Before, "continuing A2-only writes");
  }

  let progress = loadProgress();
  // Gate from catchup progress only — do not import V5 fields from recovery JSON.
  const gate = ensureReportsRequestGate({ progress, progressPath: PROGRESS_PATH });
  progress = gate.state;
  saveProgress(progress);

  const svc = await createWbSyncService(ACCOUNT_ID);
  const safety = {
    http: 0,
    v1: 0,
    v5: 0,
    list: 0,
    status204: 0,
    status429: 0,
    failed: 0,
    upserted: 0,
    weeksCompleted: [],
  };

  // Cap loops to avoid runaway; --once does a single page.
  const maxLoops = once ? 1 : 40;
  for (let i = 0; i < maxLoops; i += 1) {
    const week = progress.activeWeek;
    if (!week?.from || !week?.to) break;
    if (week.from > TODAY) {
      console.log(JSON.stringify({ done: true, reason: "next_week_in_future", week }));
      break;
    }

    const blockedUntilIso = reportsRecoveryRequestBlockedUntil(progress);
    if (blockedUntilIso) {
      const waitMs = Math.max(0, Date.parse(blockedUntilIso) - Date.now());
      console.log(JSON.stringify({ waitMs, reason: "reports_gate", until: blockedUntilIso }));
      if (once) break;
      await sleep(Math.min(waitMs + 500, 120_000));
      progress = loadProgress();
      continue;
    }

    const rrdId = Number(progress.rrdId ?? 0);
    console.log(
      JSON.stringify({
        action: "wake",
        week: `${week.from}:${week.to}`,
        rrdId,
        loop: i + 1,
      })
    );

    const before = await financeSnap(sb, "2");
    let syncResult;
    try {
      syncResult = await svc.syncFinanceV1Page(week.from, week.to, rrdId, "weekly");
      safety.http += 1;
      safety.v1 += 1;
      progress.stats.http += 1;
      progress.stats.v1 += 1;
    } catch (err) {
      safety.failed += 1;
      progress.stats.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|rate.?limit/i.test(msg)) {
        safety.status429 += 1;
        progress.stats.status429 += 1;
        const retryMatch = msg.match(/retry(?:After)?[^\d]*(\d+)/i);
        const serverRetryAfterMs = retryMatch ? Number(retryMatch[1]) * 1000 : 60_000;
        progress = recordReportsRecovery429Hint({
          progress,
          progressPath: PROGRESS_PATH,
          serverRetryAfterMs,
        });
        saveProgress(progress);
        console.log(JSON.stringify({ error: "429", msg: msg.slice(0, 200), rrdIdUnchanged: rrdId }));
        break;
      }
      saveProgress(progress);
      console.error(JSON.stringify({ error: msg.slice(0, 400), rrdIdUnchanged: rrdId }));
      break;
    }

    const errors = syncResult.errors ?? [];
    const http429 = errors.some((e) => /\[http\s+429\]/i.test(String(e)) || /429/.test(String(e)));
    if (http429) {
      safety.status429 += 1;
      progress.stats.status429 += 1;
      progress = recordReportsRecovery429Hint({
        progress,
        progressPath: PROGRESS_PATH,
        serverRetryAfterMs: 60_000,
      });
      saveProgress(progress);
      console.log(JSON.stringify({ error: "429_in_result", rrdIdUnchanged: rrdId, errors }));
      break;
    }

    const page = syncResult.page;
    const processed = syncResult.recordsProcessed ?? 0;
    const upserted = syncResult.recordsUpdated ?? 0;
    safety.upserted += upserted;
    progress.stats.upserted += upserted;

    // Local min gap after every request attempt
    progress.reportsLastRequestAt = new Date().toISOString();
    const nextNotBefore = Date.now() + FINANCE_RECOVERY_MIN_PAGE_GAP_MS;
    progress.reportsNextRequestNotBefore = new Date(nextNotBefore).toISOString();

    const isEmpty = processed === 0 && !page?.hasMore;
    if (isEmpty) {
      safety.status204 += 1;
      progress.stats.status204 += 1;
      progress.completedWeeks[`${week.from}:${week.to}`] = {
        from: week.from,
        to: week.to,
        completedAt: new Date().toISOString(),
      };
      safety.weeksCompleted.push(`${week.from}:${week.to}`);
      const next = nextWeeklyReportsPeriod({ periodFrom: week.from, periodTo: week.to });
      progress.activeWeek = { from: next.from, to: next.to, key: next.key };
      progress.rrdId = 0;
      saveProgress(progress);
      const after = await financeSnap(sb, "2");
      console.log(
        JSON.stringify({
          outcome: "204_week_complete",
          week: `${week.from}:${week.to}`,
          next: next.key,
          before,
          after,
        })
      );
      if (once) break;
      continue;
    }

    // Successful non-empty page: advance cursor only after UPSERT (syncFinanceV1Page already upserted)
    if (page?.hasMore && page.lastRrdId != null) {
      progress.rrdId = page.lastRrdId;
      saveProgress(progress);
      const after = await financeSnap(sb, "2");
      console.log(
        JSON.stringify({
          outcome: "page_ok_has_more",
          week: `${week.from}:${week.to}`,
          nextRrdId: page.lastRrdId,
          processed,
          upserted,
          before,
          after,
        })
      );
      if (once) break;
      continue;
    }

    // Final page of week (hasMore false)
    progress.completedWeeks[`${week.from}:${week.to}`] = {
      from: week.from,
      to: week.to,
      completedAt: new Date().toISOString(),
      lastRrdId: page?.lastRrdId ?? rrdId,
    };
    safety.weeksCompleted.push(`${week.from}:${week.to}`);
    const next = nextWeeklyReportsPeriod({ periodFrom: week.from, periodTo: week.to });
    progress.activeWeek = { from: next.from, to: next.to, key: next.key };
    progress.rrdId = 0;
    saveProgress(progress);
    const after = await financeSnap(sb, "2");
    console.log(
      JSON.stringify({
        outcome: "week_complete_with_rows",
        week: `${week.from}:${week.to}`,
        next: next.key,
        processed,
        upserted,
        before,
        after,
      })
    );
    if (once) break;
  }

  const a1After = await financeSnap(sb, "1");
  const a2After = await financeSnap(sb, "2");
  console.log(
    JSON.stringify(
      {
        safety: { ...safety, v5: 0, list: 0 },
        a1: { before: a1Before, after: a1After, unchanged: a1Before.count === a1After.count && a1Before.max === a1After.max },
        a2: a2After,
        progress: {
          activeWeek: progress.activeWeek,
          rrdId: progress.rrdId,
          completedWeeks: Object.keys(progress.completedWeeks ?? {}),
        },
        reservationEnv: process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE ?? null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
