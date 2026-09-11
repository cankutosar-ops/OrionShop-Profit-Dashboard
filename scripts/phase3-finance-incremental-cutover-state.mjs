#!/usr/bin/env node
/**
 * PHASE 3 — Apply finance_incremental_sync_state + seed Account 2 + reconcile continuity.
 *
 * NO Wildberries HTTP.
 * NO reservation env changes.
 * NO Account 1 writes.
 * NO wb_finance row mutations.
 *
 * Usage:
 *   npx tsx scripts/phase3-finance-incremental-cutover-state.mjs --precheck
 *   npx tsx scripts/phase3-finance-incremental-cutover-state.mjs --apply
 *   npx tsx scripts/phase3-finance-incremental-cutover-state.mjs --seed
 *   npx tsx scripts/phase3-finance-incremental-cutover-state.mjs --reconcile
 *   npx tsx scripts/phase3-finance-incremental-cutover-state.mjs --all
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const MIGRATION =
  "supabase/migrations/20260906150000_finance_incremental_sync_state.sql";
const PROGRESS =
  "exports/finance-backfill/account-2-recovery-progress.json";
const ACCOUNT2 = "2";
const ACCOUNT1 = "1";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split("\n")) {
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

function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  try {
    return readFileSync(resolve(home, ".config/supabase/access-token"), "utf8").trim();
  } catch {
    return null;
  }
}

function buildDbUrlFromPassword() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) return null;
  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function applyViaManagementApi(sql) {
  const token = resolveAccessToken();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return { applied: false, reason: "no_access_token" };
  const ref = new URL(url).hostname.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 400)}` };
  }
  return { applied: true, via: "management_api" };
}

async function applyViaPg(sql) {
  const dbUrl =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? buildDbUrlFromPassword();
  if (!dbUrl) return { applied: false, reason: "no_db_url" };
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    return { applied: true, via: "postgres" };
  } finally {
    await client.end();
  }
}

async function applyMigration(sql) {
  for (const fn of [() => applyViaManagementApi(sql), () => applyViaPg(sql)]) {
    try {
      const result = await fn();
      if (result.applied) return result;
      console.warn("Apply attempt skipped:", result.reason);
    } catch (err) {
      console.warn("Apply attempt failed:", err instanceof Error ? err.message : err);
    }
  }
  return { applied: false };
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function financeSnapshot(sb, accountId) {
  const { count, error: cErr } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  if (cErr) throw cErr;
  const { data: maxRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: minRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    min: minRow?.operation_date ? String(minRow.operation_date).slice(0, 10) : null,
    max: maxRow?.operation_date ? String(maxRow.operation_date).slice(0, 10) : null,
  };
}

async function countDupSourceKeys(sb, accountId) {
  // Exact unique count vs row count via paging keys
  const keys = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", accountId)
      .range(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const k = r.source_key ?? "";
      keys.set(k, (keys.get(k) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  let dupKeys = 0;
  for (const n of keys.values()) if (n > 1) dupKeys += 1;
  return { unique: keys.size, dupKeys };
}

async function tableExists(sb) {
  const { error } = await sb.from("finance_incremental_sync_state").select("marketplace_account_id").limit(1);
  if (!error) return { exists: true, error: null };
  return { exists: false, error: error.message };
}

async function getCommercialFinance(sb, accountId) {
  const { data, error } = await sb
    .from("commercial_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .eq("entity", "finance")
    .maybeSingle();
  if (error) return { error: error.message };
  return { row: data };
}

function buildCompletedWeeksFromProgress() {
  const path = resolve(PROGRESS);
  if (!existsSync(path)) throw new Error(`Missing recovery progress: ${path}`);
  const progress = JSON.parse(readFileSync(path, "utf8"));
  if (String(progress.accountId) !== ACCOUNT2) {
    throw new Error(`Progress accountId=${progress.accountId}, expected ${ACCOUNT2}`);
  }
  if (progress.campaignStatus !== "completed") {
    throw new Error(`campaignStatus=${progress.campaignStatus}, expected completed`);
  }
  if (progress.activeChunk != null) {
    throw new Error("activeChunk is not null — refuse seed");
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

async function precheck() {
  const sb = admin();
  const a2 = await financeSnapshot(sb, ACCOUNT2);
  const a1 = await financeSnapshot(sb, ACCOUNT1);
  const dups = await countDupSourceKeys(sb, ACCOUNT2);
  const table = await tableExists(sb);
  const continuity = await getCommercialFinance(sb, ACCOUNT2);
  const { progress, completed } = buildCompletedWeeksFromProgress();

  const { nextWeeklyReportsPeriod } = await import(
    "../src/lib/finance-recovery/reports-ingestion.ts"
  );
  const { planFinanceIncrementalWork } = await import(
    "../src/lib/finance-incremental/week-planner.ts"
  );

  const lastKey = "2026-08-24:2026-08-28";
  if (!completed[lastKey]) {
    throw new Error(`completed_weeks missing last recovery key ${lastKey}`);
  }
  const next = nextWeeklyReportsPeriod({
    periodFrom: "2026-08-24",
    periodTo: "2026-08-28",
  });

  const reservationEnv = process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE ?? null;
  const liveEnv = process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED ?? null;

  const plannedSeed = {
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

  // Planner must resume this seed (in_progress), not jump Mon–Sun
  const plan = planFinanceIncrementalWork({
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
      updatedAt: plannedSeed.updated_at,
    },
    today: "2026-09-06",
  });

  const out = {
    table,
    a2,
    a1,
    dups,
    continuityBefore: continuity,
    recovery: {
      campaignStatus: progress.campaignStatus,
      activeChunk: progress.activeChunk,
      completedWeekCount: Object.keys(completed).length,
      lastCompletedKey: lastKey,
      derivedNext: next,
    },
    reservationEnv,
    liveEnv,
    plannedSeedSummary: {
      marketplace_account_id: plannedSeed.marketplace_account_id,
      mode: plannedSeed.mode,
      week_status: plannedSeed.week_status,
      active_week_from: plannedSeed.active_week_from,
      active_week_to: plannedSeed.active_week_to,
      last_persisted_rrd_id: plannedSeed.last_persisted_rrd_id,
      latest_successful_data_date: plannedSeed.latest_successful_data_date,
      completed_week_keys: Object.keys(completed).sort(),
      locks: null,
      reports_rate_limit: null,
    },
    plannerOnSeed: {
      kind: plan.kind,
      week: plan.week,
      rrdId: plan.rrdId,
      reason: plan.reason,
    },
    invariants: {
      a2MaxIs0828: a2.max === "2026-08-28",
      a2MinIs0528: a2.min === "2026-05-28",
      a2Count29451: a2.count === 29451,
      a2Dup0: dups.dupKeys === 0,
      a1Count73280: a1.count === 73280,
      a1Max0823: a1.max === "2026-08-23",
      nextIs0829_0904: next.key === "2026-08-29:2026-09-04",
      planResumesNextAt0:
        plan.kind === "continue_active" &&
        plan.week?.key === "2026-08-29:2026-09-04" &&
        plan.rrdId === 0,
      campaignCompleted: progress.campaignStatus === "completed",
    },
  };

  console.log(JSON.stringify(out, null, 2));

  const failed = Object.entries(out.invariants).filter(([, v]) => !v);
  if (failed.length) {
    console.error("PRECHECK INVARIANT FAILURES:", failed.map(([k]) => k));
    process.exit(2);
  }
  return out;
}

async function apply() {
  const sb = admin();
  const before = await tableExists(sb);
  if (before.exists) {
    console.log(JSON.stringify({ applied: false, reason: "already_exists", before }, null, 2));
    return { applied: false, reason: "already_exists" };
  }
  const sql = readFileSync(resolve(MIGRATION), "utf8");
  const result = await applyMigration(sql);
  if (!result.applied) {
    console.error("FAIL apply", result);
    process.exit(1);
  }
  const after = await tableExists(sb);
  // column probe via select *
  const { data, error } = await sb
    .from("finance_incremental_sync_state")
    .select("*")
    .limit(0);
  console.log(
    JSON.stringify(
      {
        applied: true,
        via: result.via,
        tableExists: after.exists,
        selectProbeError: error?.message ?? null,
        emptySelectOk: !error,
      },
      null,
      2
    )
  );
  if (!after.exists) {
    process.exit(1);
  }
  return result;
}

async function seed() {
  const sb = admin();
  const a2 = await financeSnapshot(sb, ACCOUNT2);
  const a1Before = await financeSnapshot(sb, ACCOUNT1);
  if (a2.max !== "2026-08-28" || a2.count !== 29451) {
    throw new Error(`Refuse seed: unexpected A2 snapshot ${JSON.stringify(a2)}`);
  }
  const { completed } = buildCompletedWeeksFromProgress();
  const { nextWeeklyReportsPeriod } = await import(
    "../src/lib/finance-recovery/reports-ingestion.ts"
  );
  const next = nextWeeklyReportsPeriod({
    periodFrom: "2026-08-24",
    periodTo: "2026-08-28",
  });
  if (next.key !== "2026-08-29:2026-09-04") {
    throw new Error(`Derived next unexpected: ${next.key}`);
  }

  const nowIso = new Date().toISOString();
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
    updated_at: nowIso,
  };

  const { error } = await sb
    .from("finance_incremental_sync_state")
    .upsert(row, { onConflict: "marketplace_account_id" });
  if (error) throw error;

  const { data: seeded, error: readErr } = await sb
    .from("finance_incremental_sync_state")
    .select("*")
    .eq("marketplace_account_id", ACCOUNT2)
    .maybeSingle();
  if (readErr) throw readErr;

  const a2After = await financeSnapshot(sb, ACCOUNT2);
  const a1After = await financeSnapshot(sb, ACCOUNT1);

  const checks = {
    accountId: String(seeded.marketplace_account_id) === ACCOUNT2,
    latest: String(seeded.latest_successful_data_date).slice(0, 10) === "2026-08-28",
    activeFrom: seeded.active_week_from === "2026-08-29",
    activeTo: seeded.active_week_to === "2026-09-04",
    rrd0: Number(seeded.last_persisted_rrd_id) === 0,
    mode: seeded.mode === "current_week",
    weekStatus: seeded.week_status === "in_progress",
    locksClear:
      seeded.lock_owner == null &&
      seeded.lock_heartbeat_at == null &&
      seeded.lock_started_at == null,
    reportsNull:
      seeded.reports_server_retry_until == null &&
      seeded.reports_next_request_not_before == null,
    completedHasLast: Boolean(seeded.completed_weeks?.["2026-08-24:2026-08-28"]),
    completedCount: Object.keys(seeded.completed_weeks ?? {}).length === 10,
    a2Unchanged: a2After.count === a2.count && a2After.max === a2.max,
    a1Unchanged: a1After.count === a1Before.count && a1After.max === a1Before.max,
  };

  console.log(
    JSON.stringify(
      {
        seeded: {
          marketplace_account_id: seeded.marketplace_account_id,
          mode: seeded.mode,
          week_status: seeded.week_status,
          active_week_from: seeded.active_week_from,
          active_week_to: seeded.active_week_to,
          last_persisted_rrd_id: seeded.last_persisted_rrd_id,
          latest_successful_data_date: seeded.latest_successful_data_date,
          completed_weeks_keys: Object.keys(seeded.completed_weeks ?? {}).sort(),
          lock_owner: seeded.lock_owner,
          reports_next_request_not_before: seeded.reports_next_request_not_before,
          reports_server_retry_until: seeded.reports_server_retry_until,
        },
        a2After,
        a1Before,
        a1After,
        checks,
      },
      null,
      2
    )
  );

  if (Object.values(checks).some((v) => !v)) {
    console.error("SEED VERIFY FAILED", checks);
    process.exit(1);
  }
}

async function reconcile() {
  const sb = admin();
  const before = await getCommercialFinance(sb, ACCOUNT2);
  const a2 = await financeSnapshot(sb, ACCOUNT2);
  const a1Before = await financeSnapshot(sb, ACCOUNT1);
  if (a2.max !== "2026-08-28") throw new Error(`Refuse reconcile: A2 max=${a2.max}`);

  const now = new Date().toISOString();
  const patch = {
    marketplace_account_id: Number(ACCOUNT2),
    entity: "finance",
    status: "success",
    failure_class: null,
    last_error: null,
    last_execution_at: now,
    last_successful_execution_at: now,
    latest_data_date: a2.max,
    retry_count: 0,
    next_retry_at: null,
    updated_at: now,
  };

  const { error } = await sb
    .from("commercial_entity_sync_state")
    .upsert(patch, { onConflict: "marketplace_account_id,entity" });
  if (error) throw error;

  const after = await getCommercialFinance(sb, ACCOUNT2);
  const a1After = await financeSnapshot(sb, ACCOUNT1);
  const a2After = await financeSnapshot(sb, ACCOUNT2);

  const checks = {
    latest: String(after.row?.latest_data_date).slice(0, 10) === "2026-08-28",
    status: after.row?.status === "success",
    errorCleared: after.row?.last_error == null,
    retry0: Number(after.row?.retry_count ?? -1) === 0,
    a1Unchanged: a1After.count === a1Before.count && a1After.max === a1Before.max,
    a2Unchanged: a2After.count === a2.count && a2After.max === a2.max,
  };

  console.log(
    JSON.stringify(
      {
        before: before.row
          ? {
              latest_data_date: before.row.latest_data_date,
              status: before.row.status,
              last_error: before.row.last_error,
              retry_count: before.row.retry_count,
            }
          : before,
        after: after.row
          ? {
              latest_data_date: after.row.latest_data_date,
              status: after.row.status,
              last_error: after.row.last_error,
              retry_count: after.row.retry_count,
            }
          : after,
        checks,
        reservationEnvUnchanged: process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE ?? null,
        liveEnv: process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED ?? null,
      },
      null,
      2
    )
  );

  if (Object.values(checks).some((v) => !v)) {
    console.error("RECONCILE VERIFY FAILED", checks);
    process.exit(1);
  }
}

async function main() {
  loadEnv();
  // Hard safety: never enable live in this script
  if (process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED === "true") {
    console.warn("NOTE: FINANCE_V1_LIVE_REQUESTS_ENABLED is true in env — this script still makes 0 WB calls");
  }

  const args = new Set(process.argv.slice(2));
  const runAll = args.has("--all");
  if (args.has("--precheck") || runAll) await precheck();
  if (args.has("--apply") || runAll) await apply();
  if (args.has("--seed") || runAll) await seed();
  if (args.has("--reconcile") || runAll) await reconcile();
  if (![...args].some((a) => a.startsWith("--"))) {
    console.error("Usage: --precheck | --apply | --seed | --reconcile | --all");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
