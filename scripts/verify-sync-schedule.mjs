import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { validateWorkerSchedule } from "./check-worker-schedule.mjs";
import { runFinancePublicationWorkerTask, publicationSnapshotRows, PUBLICATION_REFRESH_MS } from "../src/worker/tasks/finance-publication-task.ts";
import { createMemoryFinanceIncrementalStateStore } from "../src/lib/finance-incremental/state.ts";
import { emptyFinanceIncrementalState } from "../src/lib/finance-incremental/week-planner.ts";

for (const enabled of [undefined, "", "false"]) assert.throws(() => validateWorkerSchedule({ eventName: "schedule", enabled, accounts: "1,2,6" }), /disabled/);
assert.throws(() => validateWorkerSchedule({ eventName: "schedule", enabled: "true", accounts: "" }), /explicit/);
for (const accounts of ["0", "1,0", "1;echo", "1,2,x"]) assert.throws(() => validateWorkerSchedule({ eventName: "schedule", enabled: "true", accounts }), /positive integers/);
validateWorkerSchedule({ eventName: "schedule", enabled: "true", accounts: "1,2,6" });
validateWorkerSchedule({ eventName: "workflow_dispatch", enabled: "false", accounts: "6" });
const workflow = load(readFileSync(".github/workflows/sync-worker.yml", "utf8"));
assert.equal(workflow.jobs.sync.if, undefined, "A disabled schedule must fail visibly instead of skipping the job");
assert.equal((workflow.on ?? workflow[true]).schedule[0].cron, "20 */4 * * *");
const steps = workflow.jobs.sync.steps;
const gate = steps.findIndex(step => step.run?.includes("check-worker-schedule.mjs"));
assert.ok(gate >= 0 && gate < steps.findIndex(step => step.run?.includes("npm ci")), "Stop/configuration validation runs before installation or sync");
assert.match(steps.find(step => step.id === "worker").run, /finance-publication,commercial,inventory/);
assert.match(workflow.jobs.sync.env.WORKER_ACCOUNT_IDS, /SYNC_WORKER_ACCOUNT_IDS/);
assert.equal(workflow.concurrency["cancel-in-progress"], false);

const now = Date.parse("2026-10-20T10:00:00Z");
const logger = { log() {}, info() {}, warn() {}, error() {} };
const report = { reportId: 123, dateFrom: "2026-10-12", dateTo: "2026-10-18", createDate: "2026-10-19", forPaySum: "-12.50" };
const record = { id: "1", companyId: "1", apiKey: "fixture-not-a-real-key" };
const rows = publicationSnapshotRows([report], record, "2026-09-29", "2026-10-20", new Date(now).toISOString());
assert.equal(rows[0].for_pay_sum, -12.5);
assert.equal(rows[0].meta.source, "wb_sales_reports_list");
for (const malformed of [null, {}, Array(1000).fill(report), [report, report], [{ ...report, reportId: 0 }], [{ ...report, forPaySum: "bad" }], [{ ...report, dateTo: "2026-02-30" }]]) {
  assert.throws(() => publicationSnapshotRows(malformed, record, "2026-09-29", "2026-10-20", new Date(now).toISOString()));
}
assert.deepEqual(publicationSnapshotRows([], record, "2026-09-29", "2026-10-20", new Date(now).toISOString()), []);

async function fixture({ ids = ["1", "2", "6"], observed = null, status = 200, failFirst = false, cooldown = false, stealLease = false } = {}) {
  const seed = Object.fromEntries(ids.map(id => [id, { ...emptyFinanceIncrementalState(id),
    activeWeekFrom: "2026-10-12", activeWeekTo: "2026-10-18", lastPersistedRrdId: 123456,
    completedWeeks: { "2026-10-05:2026-10-11": { from: "2026-10-05", to: "2026-10-11", completedAt: "2026-10-12T00:00:00Z", lastRevalidatedAt: null } },
    ...(cooldown ? { reportsNextRequestNotBefore: new Date(now + 60000).toISOString() } : {}) }]));
  const store = createMemoryFinanceIncrementalStateStore(seed, () => now);
  const requests = [], saved = [];
  const result = await runFinancePublicationWorkerTask({ deadlineMs: now + 120000, logger,
    deps: { store: stealLease ? { ...store, renewLease: async () => false } : store, now: () => now,
      listAccounts: async () => ids.map(id => ({ id, accountName: `Fixture ${id}` })),
      recoveryActive: () => false, assertAccess: () => {},
      loadAccount: async id => ({ ...record, id, companyId: id === "6" ? "3" : id }),
      lastObservedAt: async () => observed,
      request: async (token, from, to) => {
        assert.equal(token, record.apiKey); assert.equal(from, "2026-09-29"); assert.equal(to, "2026-10-20");
        requests.push({ from, to });
        return Response.json(failFirst && requests.length === 1 ? { error: "unavailable" } : [report],
          { status: failFirst && requests.length === 1 ? 503 : status, headers: status === 429 ? { "Retry-After": "300" } : {} });
      },
      saveReports: async rows => saved.push(...rows),
    } });
  for (const id of ids) {
    const after = store.dump()[id];
    assert.equal(after.lastPersistedRrdId, seed[id].lastPersistedRrdId, "Publication cannot reset/advance the Finance cursor");
    assert.deepEqual(after.completedWeeks, seed[id].completedWeeks, "Previously completed periods stay unchanged");
    assert.equal(after.activeWeekFrom, seed[id].activeWeekFrom);
    assert.equal(after.lockOwner, null, "Lease must be released, including after errors");
  }
  return { result, requests, saved, store };
}
const ok = await fixture();
assert.equal(ok.requests.length, 3); assert.equal(ok.saved.length, 3);
assert.deepEqual(ok.saved.map(row => [row.marketplace_account_id, row.company_id]), [["1","1"],["2","2"],["6","3"]]);
assert.ok(ok.result.every(result => result.outcome === "success"));
for (const state of Object.values(ok.store.dump())) assert.ok(Date.parse(state.reportsNextRequestNotBefore) - now >= 70000);
assert.equal((await fixture({ observed: new Date(now - PUBLICATION_REFRESH_MS + 1).toISOString() })).requests.length, 0);
assert.equal((await fixture({ cooldown: true })).requests.length, 0);
const limited = await fixture({ ids: ["1"], status: 429 });
assert.equal(limited.requests.length, 1); assert.equal(limited.saved.length, 0);
assert.equal(limited.result[0].outcome, "retryable_failure");
assert.ok(Date.parse(limited.store.dump()["1"].reportsServerRetryUntil) >= now + 300000);
const isolated = await fixture({ failFirst: true });
assert.equal(isolated.result[0].outcome, "retryable_failure");
assert.ok(isolated.result.slice(1).every(result => result.outcome === "success"));
assert.equal(isolated.saved.length, 2);
const lost = await fixture({ ids: ["1"], stealLease: true });
assert.equal(lost.saved.length, 0); assert.equal(lost.result[0].outcome, "retryable_failure");
console.log("PASS scheduled sync: visible disabled gate, explicit account scope, four-hour cadence, bounded V1 publication refresh, 70s pacing, 429/no retries, fencing, unchanged Finance cursor/periods and company isolation. No DB/API writes.");
