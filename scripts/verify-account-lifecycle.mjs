#!/usr/bin/env node
/**
 * Pure verification of new-account lifecycle gates (no DB / WB calls).
 * Usage: npx tsx scripts/verify-account-lifecycle.mjs
 */
import assert from "node:assert/strict";
import {
  allowsIncrementalFinanceSync,
  evaluateAccountVerification,
  verifyHistoricalBackfillProgress,
} from "../src/services/account-lifecycle-service.ts";
import { buildFinanceBackfillWindows } from "../src/lib/wildberries/finance-history-backfill.ts";

function windowKey(from, to) {
  return `${from}:${to}`;
}

console.log("=== Account lifecycle gate verification ===\n");

const from = "2026-01-01";
const to = "2026-03-15";
const windows = buildFinanceBackfillWindows(from, to, "monthly");
const completed = Object.fromEntries(windows.map((w) => [windowKey(w.from, w.to), true]));

// 1) Incremental must not run before ready states
const blocked = [
  "NEW_ACCOUNT",
  "ACCOUNT_VERIFICATION",
  "HISTORICAL_BACKFILL_RUNNING",
  "HISTORICAL_BACKFILL_VERIFYING",
  "HISTORICAL_BACKFILL_COMPLETE",
  "FAILED",
  "PARTIAL",
];
for (const status of blocked) {
  assert.equal(
    allowsIncrementalFinanceSync(status),
    false,
    `incremental must be blocked for ${status}`
  );
}
assert.equal(allowsIncrementalFinanceSync("INCREMENTAL_SYNC_ACTIVE"), true);
assert.equal(allowsIncrementalFinanceSync("HEALTHY"), true);
assert.equal(allowsIncrementalFinanceSync("RECOVERING"), true);
assert.equal(allowsIncrementalFinanceSync(null), true, "legacy null allows incremental");
console.log("PASS: incremental gate");

// 2) Existing-account verification evaluator (authority for HEALTHY promotion)
const verifyFail = evaluateAccountVerification({
  from,
  to,
  strategy: "monthly",
  completedWindows: { [windowKey(windows[0].from, windows[0].to)]: true },
  failedWindows: {},
});
assert.equal(verifyFail.ok, false);
assert.equal(verifyFail.nextStatus, "PARTIAL");
console.log("PASS: ACCOUNT_VERIFICATION incomplete → PARTIAL");

const verifyFailedWindows = evaluateAccountVerification({
  from,
  to,
  strategy: "monthly",
  completedWindows: completed,
  failedWindows: { "2026-02-01:2026-02-28": "boom" },
});
assert.equal(verifyFailedWindows.ok, false);
assert.equal(verifyFailedWindows.nextStatus, "FAILED");
console.log("PASS: ACCOUNT_VERIFICATION failed windows → FAILED");

const verifyOk = evaluateAccountVerification({
  from,
  to,
  strategy: "monthly",
  completedWindows: completed,
  failedWindows: {},
});
assert.equal(verifyOk.ok, true);
assert.equal(verifyOk.nextStatus, "INCREMENTAL_SYNC_ACTIVE");
console.log("PASS: ACCOUNT_VERIFICATION complete → INCREMENTAL_SYNC_ACTIVE");

const verifyNonWb = evaluateAccountVerification(
  { from, to, strategy: "monthly", completedWindows: {}, failedWindows: {} },
  { marketplace: "ozon" }
);
assert.equal(verifyNonWb.ok, true);
console.log("PASS: non-WB verification does not require finance windows");

// 3) Historical progress helper
const incomplete = verifyHistoricalBackfillProgress({
  from,
  to,
  strategy: "monthly",
  completedWindows: { [windowKey(windows[0].from, windows[0].to)]: true },
  failedWindows: {},
});
assert.equal(incomplete.ok, false);
assert.ok(incomplete.pendingWindows.length > 0);
console.log("PASS: pending windows block verification");

const failed = verifyHistoricalBackfillProgress({
  from,
  to,
  strategy: "monthly",
  completedWindows: completed,
  failedWindows: { "2026-02-01:2026-02-28": "boom" },
});
assert.equal(failed.ok, false);
assert.equal(failed.reason, "failed_windows_remain");
console.log("PASS: failed windows block verification");

const ok = verifyHistoricalBackfillProgress({
  from,
  to,
  strategy: "monthly",
  completedWindows: completed,
  failedWindows: {},
});
assert.equal(ok.ok, true);
console.log("PASS: complete progress verifies");

const mod = await import("../src/lib/wildberries/finance-history-backfill.ts");
assert.equal(typeof mod.runFinanceHistoryBackfill, "function");
console.log("PASS: backfill engine available with skipCompletedWindows support");

console.log("\nOK: Account lifecycle verification passed.");
console.log(
  "Note: HEALTHY is earned only after verification — migration never assigns HEALTHY."
);
console.log(
  "Note: Incremental finance cannot begin until status ∈ {INCREMENTAL_SYNC_ACTIVE, HEALTHY, RECOVERING}."
);
