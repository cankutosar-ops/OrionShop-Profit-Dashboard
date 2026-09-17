#!/usr/bin/env node
/** Lease and SQL contract regression. In-memory state only; no WB or DB access. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyFinanceIncrementalState } from "../src/lib/finance-incremental/week-planner.ts";
import { createMemoryFinanceIncrementalStateStore } from "../src/lib/finance-incremental/state.ts";
import { runFinanceReportsV1PageWake } from "../src/lib/finance-incremental/page-wake.ts";

let clock = Date.parse("2026-09-17T12:00:00Z");
const seeded = (id) => ({
  ...emptyFinanceIncrementalState(id), mode: "current_week", weekStatus: "in_progress",
  activeWeekFrom: "2026-09-07", activeWeekTo: "2026-09-13", lastPersistedRrdId: 5,
});
const store = createMemoryFinanceIncrementalStateStore({ "1": seeded("1"), "2": seeded("2") }, () => clock);
const ownerA = "00000000-0000-4000-8000-00000000000a";
const ownerB = "00000000-0000-4000-8000-00000000000b";
assert.ok(await store.acquireLease("1", ownerA)); // A
assert.equal(await store.acquireLease("1", ownerB), null); // B
assert.equal(await store.renewLease("1", ownerA), true); // C
assert.equal(await store.renewLease("1", ownerB), false); // D
assert.equal(await store.commitLease(seeded("1"), ownerB, true), false); // E
assert.ok(await store.acquireLease("2", ownerB)); // N
assert.equal((await store.read("1")).lockOwner, ownerA);
clock += 2 * 60 * 60 * 1000 + 1;
assert.ok(await store.acquireLease("1", ownerB)); // F
assert.equal(await store.commitLease({ ...seeded("1"), lastPersistedRrdId: 99 }, ownerA, true), false); // G
assert.equal(await store.commitLease({ ...seeded("1"), lastPersistedRrdId: 9 }, ownerB, false), true); // H
assert.equal((await store.read("1")).lastPersistedRrdId, 9);
assert.equal(await store.commitLease({ ...seeded("1"), weekStatus: "idle" }, ownerA, true), false); // I
assert.equal((await store.read("1")).weekStatus, "in_progress");
assert.equal(await store.commitLease({ ...seeded("1"), weekStatus: "idle" }, ownerB, true), true); // J owner-only state

const input = (accountId = "1", lockOwner = ownerA) => ({
  accountId, lockOwner, weekFrom: "2026-09-07", weekTo: "2026-09-13",
  rrdId: 5, mode: "current_week", nowMs: clock,
});
const page = (kind, extras = {}) => ({
  kind, httpStatus: kind === "terminal" ? 204 : kind === "failure" ? 429 : 200,
  apiRows: kind === "data" ? 1 : 0, persistedLines: kind === "data" ? 1 : 0,
  hasMore: kind === "data", isEmpty: kind !== "data", nextRrdId: kind === "data" ? 10 : null,
  reportIds: [], returnedFrom: null, returnedTo: null, errors: kind === "failure" ? ["[http 429]"] : [],
  remaining: null, limit: null, resetSeconds: null, retrySeconds: null, ...extras,
});
const deps = (memory, syncPage) => ({
  loadAccount: async (id) => ({ id, sellerId: id === "2" ? "68674" : null, apiKey: "offline" }),
  readState: (id) => memory.read(id),
  acquireLease: (id, owner) => memory.acquireLease(id, owner),
  renewLease: (id, owner) => memory.renewLease(id, owner),
  commitLease: (s, owner, release) => memory.commitLease(s, owner, release),
  assertLiveAllowed: () => {}, assertTokenReady: () => {}, syncPage,
});
let calls = 0;
assert.ok(await store.acquireLease("2", ownerB));
const busy = await runFinanceReportsV1PageWake(input("2", ownerA), deps(store, async () => { calls++; return page("data"); }));
assert.equal(busy.status, "lease_busy");
assert.equal(busy.error, null);
assert.equal(calls, 0); // K

const store429 = createMemoryFinanceIncrementalStateStore({ "1": seeded("1") }, () => clock);
const limited = await runFinanceReportsV1PageWake(input(), deps(store429, async () => page("failure")));
assert.equal(limited.status, "rate_limited");
assert.equal((await store429.read("1")).lastPersistedRrdId, 5);
assert.equal((await store429.read("1")).lockOwner, null);
assert.ok((await store429.read("1")).reportsNextRequestNotBefore); // L

const storeFailed = createMemoryFinanceIncrementalStateStore({ "1": seeded("1") }, () => clock);
const failed = await runFinanceReportsV1PageWake(input(), deps(storeFailed, async () => page("failure", {
  httpStatus: 500, errors: ["atomic upsert failed"],
})));
assert.equal(failed.status, "failed");
assert.equal((await storeFailed.read("1")).lastPersistedRrdId, 5); // M

const store204 = createMemoryFinanceIncrementalStateStore({ "1": seeded("1") }, () => clock);
const terminal = await runFinanceReportsV1PageWake(input(), deps(store204, async () => page("terminal")));
assert.equal(terminal.status, "week_complete");
assert.equal((await store204.read("1")).weekStatus, "idle"); // J terminal proof

let releaseSlow;
let slowStarted;
const slowStartedPromise = new Promise((resolve) => { slowStarted = resolve; });
const slowPage = new Promise((resolve) => { releaseSlow = resolve; });
const raceStore = createMemoryFinanceIncrementalStateStore({ "1": seeded("1") }, () => clock);
const stale = runFinanceReportsV1PageWake(input(), deps(raceStore, async () => {
  slowStarted(); return slowPage;
}));
await slowStartedPromise;
clock += 2 * 60 * 60 * 1000 + 1;
const newer = await runFinanceReportsV1PageWake(input("1", ownerB), deps(raceStore, async () => page("data", { nextRrdId: 20 })));
assert.equal(newer.status, "wake_ok");
releaseSlow(page("data", { nextRrdId: 10 }));
assert.equal((await stale).error, "lease_lost");
assert.equal((await raceStore.read("1")).lastPersistedRrdId, 20);

const sql = readFileSync("supabase/migrations/20260917120000_finance_incremental_atomic_lease.sql", "utf8");
const service = readFileSync("src/lib/wildberries/sync-service.ts", "utf8");
assert.match(sql, /ON CONFLICT \(marketplace_account_id\) DO UPDATE[\s\S]*WHERE s\.lock_owner IS NULL/);
assert.match(sql, /lock_owner = p_owner[\s\S]*lock_expires_at > clock_timestamp\(\)/);
assert.match(sql, /FOR UPDATE;[\s\S]*FINANCE_LEASE_LOST/);
assert.match(sql, /ON CONFLICT \(marketplace_account_id, source_key\) DO UPDATE/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.orion_finance_incremental_upsert_batch/);
assert.match(service, /leaseOwner[\s\S]*orion_finance_incremental_upsert_batch/);
assert.match(service, /onConflict: "marketplace_account_id,source_key"/);
console.log("PASS A–O atomic lease, renewal, fencing, terminal/429/failure, isolation, idempotent account-key upsert contract; offline only");
