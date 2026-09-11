#!/usr/bin/env node
/**
 * Account 2 lock state & commercial continuity precheck (read-mostly).
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const ACCOUNT_ID = process.argv[2] ?? "2";
const TARGET = "2026-08-27";
const NOW = Date.now();

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const {
  getMarketplaceAccountSyncState,
  releaseStaleSyncLockIfNeeded,
  SYNC_LOCK_TTL_MS,
} = await import("../src/services/marketplace-account-service.ts");
const { commercialEntityStateAvailable, listCommercialEntityStates } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);
const { getAccountCommercialFreshness } = await import(
  "../src/services/commercial-continuity-service.ts"
);
const { getLatestSyncRun } = await import("../src/services/sync-run-service.ts");
const { isSyncJobRunning } = await import("../src/lib/wildberries/sync-runtime.ts");
const { readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);

const sb = createAdminClient();

function ageMs(iso) {
  if (!iso) return null;
  return NOW - new Date(iso).getTime();
}

function fmtAge(ms) {
  if (ms == null) return "n/a";
  const m = Math.round(ms / 60000);
  return `${m}m ago`;
}

function classifyLock(state) {
  if (!state || state.last_sync_status !== "running") {
    return state?.last_sync_status ?? "unknown";
  }
  const lockExpired =
    state.sync_lock_expires_at != null &&
    new Date(state.sync_lock_expires_at).getTime() < NOW;
  const heartbeatStale =
    state.sync_heartbeat_at != null &&
    NOW - new Date(state.sync_heartbeat_at).getTime() > SYNC_LOCK_TTL_MS;
  const legacyStale =
    state.sync_heartbeat_at == null &&
    state.last_sync_at != null &&
    NOW - new Date(state.last_sync_at).getTime() > SYNC_LOCK_TTL_MS;

  if (lockExpired || heartbeatStale || legacyStale) return "orphaned_stale_running";
  return "genuinely_running";
}

async function inspectAccount(id, label) {
  const state = await getMarketplaceAccountSyncState(id);
  const inMemoryRunning = isSyncJobRunning(id);
  const lockClass = classifyLock(state);

  const entityStateAvailable = await commercialEntityStateAvailable();
  let entityStates = [];
  if (entityStateAvailable) {
    entityStates = await listCommercialEntityStates(id);
  }

  let syncRuns = [];
  const { data: runs, error: runsErr } = await sb
    .from("sync_runs")
    .select(
      "id,entity,trigger,status,started_at,finished_at,heartbeat_at,requested_from,requested_to,records_processed,error_message"
    )
    .eq("marketplace_account_id", id)
    .order("started_at", { ascending: false })
    .limit(8);
  if (!runsErr) syncRuns = runs ?? [];

  let ticks = [];
  const { data: tickRows, error: tickErr } = await sb
    .from("commercial_sync_ticks")
    .select("id,trigger,started_at,finished_at,accounts_considered,accounts_synced,accounts_failed,error")
    .order("started_at", { ascending: false })
    .limit(5);
  if (!tickErr) ticks = tickRows ?? [];

  const freshness = await getAccountCommercialFreshness(id);
  const dbDates = {};
  for (const e of ["orders", "sales", "finance"]) {
    dbDates[e] = await readLatestDataDateFromDb(id, e);
  }

  return {
    label,
    id,
    state,
    inMemoryRunning,
    lockClass,
    entityStateAvailable,
    entityStates,
    syncRuns,
    ticks: id === ACCOUNT_ID ? ticks : undefined,
    freshness,
    dbDates,
  };
}

console.log("=== ACCOUNT 2 LOCK & COMMERCIAL PRECHECK ===\n");
console.log(`As-of: ${new Date().toISOString()} (target ${TARGET})\n`);

const before2 = await inspectAccount("2", "Account 2");
const before1 = await inspectAccount("1", "Account 1");

console.log("--- BEFORE: Account 2 sync metadata ---");
const s2 = before2.state;
console.log(JSON.stringify(
  {
    last_sync_status: s2?.last_sync_status,
    last_sync_at: s2?.last_sync_at,
    last_sync_at_age: fmtAge(ageMs(s2?.last_sync_at)),
    last_successful_sync_at: s2?.last_successful_sync_at,
    sync_heartbeat_at: s2?.sync_heartbeat_at,
    sync_heartbeat_age: fmtAge(ageMs(s2?.sync_heartbeat_at)),
    sync_lock_expires_at: s2?.sync_lock_expires_at,
    lock_expired:
      s2?.sync_lock_expires_at != null
        ? new Date(s2.sync_lock_expires_at).getTime() < NOW
        : null,
    finance_latest_operation_date: s2?.finance_latest_operation_date,
    finance_gap_days: s2?.finance_gap_days,
    finance_recovery_needed: s2?.finance_recovery_needed,
    sync_lifecycle_status: s2?.sync_lifecycle_status,
  },
  null,
  2
));

console.log("\n--- Lock classification (Account 2) ---");
console.log({
  inMemoryRunningThisProcess: before2.inMemoryRunning,
  lockClass: before2.lockClass,
  SYNC_LOCK_TTL_MS,
  legacyStaleEvidence:
    s2?.last_sync_status === "running" && s2?.sync_heartbeat_at == null
      ? {
          last_sync_at: s2.last_sync_at,
          ageMs: ageMs(s2.last_sync_at),
          ttlMs: SYNC_LOCK_TTL_MS,
          exceedsTtl: ageMs(s2.last_sync_at) > SYNC_LOCK_TTL_MS,
        }
      : null,
});

console.log("\n--- Recent sync_runs (Account 2) ---");
if (before2.syncRuns.length === 0) console.log("(none or table missing)");
else console.log(JSON.stringify(before2.syncRuns, null, 2));

console.log("\n--- commercial_entity_sync_state (Account 2) ---");
if (!before2.entityStateAvailable) console.log("(table not present — migration unapplied)");
else console.log(JSON.stringify(before2.entityStates, null, 2));

console.log("\n--- DB latest_data_date (Account 2) ---");
console.log(before2.dbDates);

// Lock action
let lockAction = "none";
if (before2.lockClass === "orphaned_stale_running") {
  const released = await releaseStaleSyncLockIfNeeded("2");
  lockAction = released ? "released_stale_lock_via_releaseStaleSyncLockIfNeeded" : "release_attempt_no_change";
} else if (before2.lockClass === "genuinely_running") {
  lockAction = "no_action_sync_still_active";
} else {
  lockAction = "no_action_not_running";
}

console.log("\n--- Lock action ---");
console.log(lockAction);

const after2 = await inspectAccount("2", "Account 2 after");
const after1 = await inspectAccount("1", "Account 1 after");

console.log("\n--- AFTER: Account 2 sync metadata ---");
console.log(JSON.stringify(
  {
    last_sync_status: after2.state?.last_sync_status,
    last_sync_at: after2.state?.last_sync_at,
    last_successful_sync_at: after2.state?.last_successful_sync_at,
  },
  null,
  2
));

console.log("\n--- AFTER: Account 2 commercial freshness ---");
console.log(JSON.stringify(after2.freshness, null, 2));

console.log("\n--- Account 1 isolation check ---");
console.log(JSON.stringify(
  {
    last_sync_status: after1.state?.last_sync_status,
    inMemoryRunning: after1.inMemoryRunning,
    lockClass: after1.lockClass,
    freshness: after1.freshness.map((f) => ({
      entity: f.entity,
      status: f.status,
      freshnessLabel: f.freshnessLabel,
      latestDataDate: f.latestDataDate,
    })),
  },
  null,
  2
));

const finance = after2.freshness.find((f) => f.entity === "finance");
const financeSafe =
  after2.lockClass !== "genuinely_running" &&
  after2.state?.last_sync_status !== "running" &&
  finance?.status !== "running";

console.log("\n--- Recovery readiness ---");
console.log({
  financeRecoverySafeToStartManually: financeSafe,
  financeStatus: finance?.status,
  financeNextRetryAt: finance?.nextRetryAt,
  financeRetryCount: finance?.retryCount,
  note: finance?.nextRetryAt
    ? "Commercial continuity has scheduled retry"
    : "No automatic retry scheduled in commercial_entity_sync_state",
});

console.log("\n--- RECOMMENDED NEXT COMMAND (when rate limits allow) ---");
console.log(
  "npx tsx scripts/run-finance-chunked-recovery.mjs 2 2026-06-21 2026-08-27 14 300000"
);
