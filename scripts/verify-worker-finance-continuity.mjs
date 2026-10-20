import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowsVerifiedFinanceResume } from "../src/lib/finance-incremental/permission.ts";
import { emptyFinanceIncrementalState } from "../src/lib/finance-incremental/week-planner.ts";
import { resolveFinanceKernelWait } from "../src/lib/commercial-continuity/persist-outcome.ts";
import { classifyCommercialError } from "../src/lib/commercial-continuity/classify.ts";
import { runSyncWorkerTick } from "../src/worker/run-worker-tick.ts";

assert.equal(resolveFinanceKernelWait("finance", "awaiting_publication").status, "external_delay");
assert.equal(resolveFinanceKernelWait("finance", "reports_timing_gate:2026-10-20T10:00:00.000Z").status, "warning");
for (const error of ["awaiting_publication:evidence_unavailable", "FINANCE_HTTP_429", "permission denied", "reports_timing_gate:invalid", "other failure"]) {
  assert.equal(resolveFinanceKernelWait("finance", error), null, `Real failure was hidden: ${error}`);
}
assert.equal(resolveFinanceKernelWait("orders", "awaiting_publication"), null);
assert.equal(classifyCommercialError("FINANCE_HTTP_429").status, "rate_limited");

for (const id of ["1", "2", "6"]) {
  const period = { from: "2026-10-12", to: "2026-10-18", completedAt: "2026-10-20T09:32:40Z", lastRevalidatedAt: null,
    publicationEvidence: { source: "wb_sales_reports_list", marketplaceAccountId: id, from: "2026-10-12", through: "2026-10-18", reportIds: [123], observedBefore: "2026-10-20T09:32:39Z" } };
  const state = { ...emptyFinanceIncrementalState(id), completedWeeks: { "2026-10-12:2026-10-18": period } };
  const options = { accountId: id, readState: async () => state };
  assert.equal(await allowsVerifiedFinanceResume(options), true);
  // Manual and headless sync share the same proof gate; neither depends on clock time.
  assert.equal(await allowsVerifiedFinanceResume({ accountId: id, readState: async () => state }), true);
  for (const broken of [
    { ...period, publicationEvidence: undefined },
    { ...period, publicationEvidence: { ...period.publicationEvidence, marketplaceAccountId: "999" } },
    { ...period, publicationEvidence: { ...period.publicationEvidence, reportIds: [] } },
    { ...period, publicationEvidence: { ...period.publicationEvidence, through: "2026-10-17" } },
    { ...period, publicationEvidence: { ...period.publicationEvidence, observedBefore: "2026-10-21T00:00:00Z" } },
  ]) assert.equal(await allowsVerifiedFinanceResume({ ...options, readState: async () => ({ ...state, completedWeeks: { "2026-10-12:2026-10-18": broken } }) }), false);
  assert.equal(await allowsVerifiedFinanceResume({ ...options, readState: async () => emptyFinanceIncrementalState(id) }), false);
  assert.equal(await allowsVerifiedFinanceResume({ ...options, readState: async () => ({ ...state, marketplaceAccountId: "999" }) }), false);
  await assert.rejects(allowsVerifiedFinanceResume({ ...options, readState: async () => { throw Error("DB unavailable"); } }), /DB unavailable/);
}
const logger = { log() {}, info() {}, warn() {}, error() {} };
const result = await runSyncWorkerTick({ tasks: ["commercial"], accountIds: ["1", "2", "6"], skipEnvironmentCheck: true, logger,
  deps: { commercial: { advanceOnboarding: async () => [], readCursor: async () => ({ rrdId: 0 }),
    runTick: async ({ marketplaceAccountId: id }) => ({ accountsConsidered: 1, results: [{ marketplaceAccountId: id, accountName: id,
      skipped: false, entities: [{ entity: "finance", status: resolveFinanceKernelWait("finance", "awaiting_publication").status, latestDataDate: "2026-10-18", error: "awaiting_publication" }] }] }),
  } } });
assert.equal(result.exitCode, 0, "An unpublished future period must not fail the production worker");
assert.equal(result.accountsConsidered, 3);
const service = readFileSync("src/services/dashboard-sync-service.ts", "utf8");
assert.match(service, /allowsVerifiedFinanceResume/);
assert.match(service, /if \(!request\.headless\) scheduleAccountLifecycle/);
assert.match(readFileSync("src/services/commercial-continuity-service.ts", "utf8"), /headless: true/);
// Prevent the actual production double-capture regression: every commercial
// entity is headless, while the explicit inventory task remains the sole owner.
const job = readFileSync("src/services/sync-job-service.ts", "utf8");
const blocking = job.slice(job.indexOf("export async function runBlockingDashboardSync"));
assert.match(blocking, /if \(result\.lastSyncStatus !== "failed" && !request\.headless\) \{\s*scheduleDailyInventorySnapshot/);
console.log("PASS worker Finance continuity: publication waits/cooldowns are non-failures; real HTTP/evidence failures remain failures; manual and headless resume require persisted same-account publication proof; unverified new accounts remain blocked. No DB/API writes.");
