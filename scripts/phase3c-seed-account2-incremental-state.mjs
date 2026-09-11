#!/usr/bin/env node
/**
 * PHASE 3C — Seed Account 2 finance_incremental_sync_state only.
 * No Wildberries HTTP. No Account 1 writes. No wb_finance writes.
 *
 * Usage:
 *   npx tsx scripts/phase3c-seed-account2-incremental-state.mjs --precheck
 *   npx tsx scripts/phase3c-seed-account2-incremental-state.mjs --seed
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const ACCOUNT2 = "2";
const EXPECTED_SELLER = "68674";
const PROGRESS = "exports/finance-backfill/account-2-recovery-progress.json";

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

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function financeSnap(sb, id) {
  const { count, error: cErr } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", id);
  if (cErr) throw cErr;
  const { data: maxRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: minRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    min: minRow?.operation_date ? String(minRow.operation_date).slice(0, 10) : null,
    max: maxRow?.operation_date ? String(maxRow.operation_date).slice(0, 10) : null,
  };
}

async function dupKeys(sb, id) {
  const keys = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", id)
      .range(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const k = r.source_key ?? "__NULL__";
      keys.set(k, (keys.get(k) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  let dup = 0;
  let nullKeys = keys.get("__NULL__") ?? 0;
  for (const [k, n] of keys) if (k !== "__NULL__" && n > 1) dup += 1;
  return { unique: keys.size - (nullKeys ? 1 : 0), dupKeys: dup, nullKeys };
}

function buildCompletedWeeksFromProgress() {
  const progress = JSON.parse(readFileSync(resolve(PROGRESS), "utf8"));
  if (String(progress.accountId) !== ACCOUNT2) {
    throw new Error(`Progress accountId=${progress.accountId}`);
  }
  if (progress.campaignStatus !== "completed") {
    throw new Error(`campaignStatus=${progress.campaignStatus}`);
  }
  if (progress.activeChunk != null) {
    throw new Error("activeChunk is not null");
  }
  if (progress.recoveryActive) {
    throw new Error("recoveryActive is true");
  }
  const completed = {};
  for (const [key, chunk] of Object.entries(progress.completedChunks ?? {})) {
    const from = String(chunk.from ?? key.split(":")[0]).slice(0, 10);
    const to = String(chunk.to ?? key.split(":")[1]).slice(0, 10);
    completed[`${from}:${to}`] = {
      from,
      to,
      completedAt: chunk.completedAt ?? progress.campaignCompletedAt ?? new Date().toISOString(),
      lastRevalidatedAt: null,
    };
  }
  return { progress, completed };
}

async function precheck(sb) {
  const { data: acc, error: accErr } = await sb
    .from("marketplace_accounts")
    .select("id,seller_id,account_name")
    .eq("id", ACCOUNT2)
    .maybeSingle();
  if (accErr) throw accErr;

  const { data: a2state, error: stErr } = await sb
    .from("finance_incremental_sync_state")
    .select("*")
    .eq("marketplace_account_id", ACCOUNT2)
    .maybeSingle();

  const { data: a1state } = await sb
    .from("finance_incremental_sync_state")
    .select("marketplace_account_id,mode,week_status,lock_owner,active_week_from,active_week_to")
    .eq("marketplace_account_id", 1)
    .maybeSingle();

  const a2 = await financeSnap(sb, ACCOUNT2);
  const a1 = await financeSnap(sb, "1");
  const dups = await dupKeys(sb, ACCOUNT2);
  const { progress, completed } = buildCompletedWeeksFromProgress();

  const { nextWeeklyReportsPeriod } = await import(
    "../src/lib/finance-recovery/reports-ingestion.ts"
  );
  const { planFinanceIncrementalWork } = await import(
    "../src/lib/finance-incremental/week-planner.ts"
  );

  const lastKey = "2026-08-24:2026-08-28";
  if (!completed[lastKey]) {
    throw new Error(`Missing completed recovery key ${lastKey}`);
  }
  const next = nextWeeklyReportsPeriod({
    periodFrom: "2026-08-24",
    periodTo: "2026-08-28",
  });

  const out = {
    tableVisible: !stErr,
    tableError: stErr?.message ?? null,
    account2: acc,
    a2state: a2state ?? null,
    a1state: a1state ?? null,
    a2,
    a1,
    dups,
    recovery: {
      campaignStatus: progress.campaignStatus,
      activeChunk: progress.activeChunk,
      recoveryActive: progress.recoveryActive,
      completedKeys: Object.keys(completed).sort(),
    },
    derivedNext: next,
    invariants: {
      seller68674: String(acc?.seller_id) === EXPECTED_SELLER,
      a2Id2: String(acc?.id) === ACCOUNT2,
      a2Count29809: a2.count === 29809,
      a2Min0528: a2.min === "2026-05-28",
      a2Max0830: a2.max === "2026-08-30",
      a2Dup0: dups.dupKeys === 0 && dups.nullKeys === 0,
      a1Count74819: a1.count === 74819,
      a1Max0830: a1.max === "2026-08-30",
      campaignCompleted: progress.campaignStatus === "completed",
      activeChunkNull: progress.activeChunk == null,
      recoveryInactive: !progress.recoveryActive,
      next0829_0904: next.key === "2026-08-29:2026-09-04" && next.rrdId === 0,
      completedCount10: Object.keys(completed).length === 10,
      tableOk: !stErr,
      noA2StateYet: a2state == null,
    },
  };

  // Planner preview on intended seed
  out.plannerPreview = planFinanceIncrementalWork({
    state: {
      marketplaceAccountId: ACCOUNT2,
      mode: "current_week",
      weekStatus: "in_progress",
      activeWeekFrom: next.from,
      activeWeekTo: next.to,
      lastPersistedRrdId: 0,
      overlapRevalidateQueue: [],
      completedWeeks: completed,
      reportsLastRequestAt: null,
      reportsNextRequestNotBefore: null,
      reportsServerRetryUntil: null,
      reportsLastRateLimitSnapshot: null,
      lockOwner: null,
      lockHeartbeatAt: null,
      lockStartedAt: null,
      latestSuccessfulDataDate: a2.max,
      lastHttpStatus: null,
      lastWakeAt: null,
      lastError: null,
      lastCursorBefore: null,
      lastCursorAfter: null,
      lastRowsReceived: null,
      lastRowsPersisted: null,
      lastHasMore: null,
      updatedAt: new Date().toISOString(),
    },
    today: "2026-09-06",
  });

  return { out, completed, next, a2, a1 };
}

async function seed(sb) {
  const { out, completed, next, a2, a1 } = await precheck(sb);
  console.log(JSON.stringify({ phase: "precheck", ...out }, null, 2));

  const failed = Object.entries(out.invariants).filter(([, v]) => !v);
  if (failed.length) {
    console.error("PRECHECK FAILED", failed.map(([k]) => k));
    process.exit(2);
  }

  if (out.a2state) {
    const s = out.a2state;
    if (s.lock_owner || s.lock_heartbeat_at || s.lock_started_at) {
      console.error("BLOCKED: existing A2 state has active lock");
      process.exit(2);
    }
    if (s.week_status === "in_progress" || s.mode === "current_week") {
      console.error(
        JSON.stringify({
          verdict: "BLOCKED — Account 2 state already exists (in_progress/current_week); refuse overwrite",
          existing: s,
        }, null, 2)
      );
      process.exit(2);
    }
    console.error(
      JSON.stringify({
        verdict: "BLOCKED — Account 2 state already exists; refuse blind overwrite",
        existing: s,
      }, null, 2)
    );
    process.exit(2);
  }

  if (
    out.plannerPreview.kind !== "continue_active" ||
    out.plannerPreview.week?.key !== "2026-08-29:2026-09-04" ||
    out.plannerPreview.rrdId !== 0
  ) {
    console.error("BLOCKED: planner preview unexpected", out.plannerPreview);
    process.exit(2);
  }

  // overlap: empty for in_progress active week seed (planner rebuilds after week complete)
  const row = {
    marketplace_account_id: Number(ACCOUNT2),
    mode: "current_week",
    week_status: "in_progress",
    active_week_from: next.from,
    active_week_to: next.to,
    last_persisted_rrd_id: 0,
    overlap_revalidate_queue: [],
    completed_weeks: completed,
    reports_last_request_at: null,
    reports_next_request_not_before: null,
    reports_server_retry_until: null,
    reports_last_rate_limit_snapshot: null,
    lock_owner: null,
    lock_heartbeat_at: null,
    lock_started_at: null,
    latest_successful_data_date: a2.max,
    last_http_status: null,
    last_wake_at: null,
    last_error: null,
    last_cursor_before: null,
    last_cursor_after: null,
    last_rows_received: null,
    last_rows_persisted: null,
    last_has_more: null,
    updated_at: new Date().toISOString(),
  };

  const { error: writeErr } = await sb
    .from("finance_incremental_sync_state")
    .upsert(row, { onConflict: "marketplace_account_id" });
  if (writeErr) {
    console.error("WRITE FAILED", writeErr.message);
    process.exit(1);
  }

  const { data: seeded, error: readErr } = await sb
    .from("finance_incremental_sync_state")
    .select("*")
    .eq("marketplace_account_id", ACCOUNT2)
    .maybeSingle();
  if (readErr) throw readErr;

  const a2After = await financeSnap(sb, ACCOUNT2);
  const a1After = await financeSnap(sb, "1");
  const dupsAfter = await dupKeys(sb, ACCOUNT2);

  const { planFinanceIncrementalWork } = await import(
    "../src/lib/finance-incremental/week-planner.ts"
  );
  const { mapRowToState } = await import("../src/lib/finance-incremental/state.ts").catch(
    () => ({ mapRowToState: null })
  );

  // Manual map if helper naming differs
  let planState;
  try {
    const stateMod = await import("../src/lib/finance-incremental/state.ts");
    if (typeof stateMod.rowToFinanceIncrementalState === "function") {
      planState = stateMod.rowToFinanceIncrementalState(seeded);
    } else if (typeof stateMod.mapDbRowToState === "function") {
      planState = stateMod.mapDbRowToState(seeded);
    }
  } catch {
    planState = null;
  }
  if (!planState) {
    planState = {
      marketplaceAccountId: String(seeded.marketplace_account_id),
      mode: seeded.mode,
      weekStatus: seeded.week_status,
      activeWeekFrom: seeded.active_week_from
        ? String(seeded.active_week_from).slice(0, 10)
        : null,
      activeWeekTo: seeded.active_week_to
        ? String(seeded.active_week_to).slice(0, 10)
        : null,
      lastPersistedRrdId: Number(seeded.last_persisted_rrd_id ?? 0),
      overlapRevalidateQueue: seeded.overlap_revalidate_queue ?? [],
      completedWeeks: seeded.completed_weeks ?? {},
      reportsLastRequestAt: seeded.reports_last_request_at,
      reportsNextRequestNotBefore: seeded.reports_next_request_not_before,
      reportsServerRetryUntil: seeded.reports_server_retry_until,
      reportsLastRateLimitSnapshot: seeded.reports_last_rate_limit_snapshot,
      lockOwner: seeded.lock_owner,
      lockHeartbeatAt: seeded.lock_heartbeat_at,
      lockStartedAt: seeded.lock_started_at,
      latestSuccessfulDataDate: seeded.latest_successful_data_date
        ? String(seeded.latest_successful_data_date).slice(0, 10)
        : null,
      lastHttpStatus: seeded.last_http_status,
      lastWakeAt: seeded.last_wake_at,
      lastError: seeded.last_error,
      lastCursorBefore: seeded.last_cursor_before,
      lastCursorAfter: seeded.last_cursor_after,
      lastRowsReceived: seeded.last_rows_received,
      lastRowsPersisted: seeded.last_rows_persisted,
      lastHasMore: seeded.last_has_more,
      updatedAt: seeded.updated_at,
    };
  }

  const plan = planFinanceIncrementalWork({ state: planState, today: "2026-09-06" });

  const checks = {
    accountId: String(seeded.marketplace_account_id) === ACCOUNT2,
    mode: seeded.mode === "current_week",
    weekStatus: seeded.week_status === "in_progress",
    from: String(seeded.active_week_from).slice(0, 10) === "2026-08-29",
    to: String(seeded.active_week_to).slice(0, 10) === "2026-09-04",
    rrd0: Number(seeded.last_persisted_rrd_id) === 0,
    latest: String(seeded.latest_successful_data_date).slice(0, 10) === "2026-08-30",
    locksNull:
      seeded.lock_owner == null &&
      seeded.lock_heartbeat_at == null &&
      seeded.lock_started_at == null,
    rlNull:
      seeded.reports_last_request_at == null &&
      seeded.reports_next_request_not_before == null &&
      seeded.reports_server_retry_until == null &&
      seeded.reports_last_rate_limit_snapshot == null,
    completed10: Object.keys(seeded.completed_weeks ?? {}).length === 10,
    hasLast: Boolean(seeded.completed_weeks?.["2026-08-24:2026-08-28"]),
    overlapEmpty: Array.isArray(seeded.overlap_revalidate_queue)
      ? seeded.overlap_revalidate_queue.length === 0
      : false,
    a2Unchanged: a2After.count === a2.count && a2After.max === a2.max,
    a1Unchanged: a1After.count === a1.count && a1After.max === a1.max,
    dups0: dupsAfter.dupKeys === 0,
    planContinue:
      plan.kind === "continue_active" &&
      plan.week?.key === "2026-08-29:2026-09-04" &&
      plan.rrdId === 0,
    planNotMonSun: plan.week?.key !== "2026-08-31:2026-09-06",
  };

  const result = {
    phase: "seed",
    seeded: {
      marketplace_account_id: seeded.marketplace_account_id,
      mode: seeded.mode,
      week_status: seeded.week_status,
      active_week_from: seeded.active_week_from,
      active_week_to: seeded.active_week_to,
      last_persisted_rrd_id: seeded.last_persisted_rrd_id,
      latest_successful_data_date: seeded.latest_successful_data_date,
      completed_weeks_keys: Object.keys(seeded.completed_weeks ?? {}).sort(),
      overlap_revalidate_queue: seeded.overlap_revalidate_queue,
      reports_last_request_at: seeded.reports_last_request_at,
      reports_next_request_not_before: seeded.reports_next_request_not_before,
      reports_server_retry_until: seeded.reports_server_retry_until,
      reports_last_rate_limit_snapshot: seeded.reports_last_rate_limit_snapshot,
      lock_owner: seeded.lock_owner,
      lock_heartbeat_at: seeded.lock_heartbeat_at,
      lock_started_at: seeded.lock_started_at,
    },
    before: { a2, a1 },
    after: { a2: a2After, a1: a1After, dups: dupsAfter },
    planner: {
      kind: plan.kind,
      week: plan.week,
      rrdId: plan.rrdId,
      reason: plan.reason,
    },
    checks,
    safety: {
      supabaseWrites: "1 state row Account 2 only",
      wb_finance_writes: 0,
      wildberries_http: 0,
      finance_api: 0,
      statistics_v5: 0,
      reports_list: 0,
      reservation_release: 0,
      live_wake: 0,
    },
  };

  const ok = Object.values(checks).every(Boolean);
  result.verdict = ok
    ? "READY FOR PHASE 3D — PRELIVE REVIEW"
    : "BLOCKED — post-seed verification failed";
  console.log(JSON.stringify(result, null, 2));
  if (!ok) process.exit(2);
}

async function main() {
  loadEnv();
  const args = new Set(process.argv.slice(2));
  const sb = admin();
  if (args.has("--precheck")) {
    const { out } = await precheck(sb);
    console.log(JSON.stringify(out, null, 2));
    const failed = Object.entries(out.invariants).filter(([, v]) => !v);
    if (failed.length) {
      console.error("PRECHECK FAILED", failed.map(([k]) => k));
      process.exit(2);
    }
    return;
  }
  if (args.has("--seed")) {
    await seed(sb);
    return;
  }
  console.error("Usage: --precheck | --seed");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
