/**
 * Phase 2.4 — Historical inventory retention purge must never run automatically.
 *
 * No retention policy is approved yet, so the destructive DELETE on
 * historical_inventory_snapshots is opt-in only. These checks execute the real
 * code (real Supabase client over a fake PostgREST server, real continuity
 * service, real worker task) rather than grepping for source patterns.
 *
 * No Wildberries calls and no production Supabase writes.
 */

import http from "node:http";

let failures = 0;
function check(label, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- Fake PostgREST: records every request the Supabase client puts on the wire ---
const requests = [];
const server = http.createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  res.writeHead(200, { "Content-Type": "application/json", "Content-Range": "*/0" });
  res.end("[]");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const snapshotService = await import("../src/services/inventory-daily-snapshot-service.ts");
const continuityService = await import("../src/services/inventory-snapshot-continuity-service.ts");
const inventoryTask = await import("../src/worker/tasks/inventory-task.ts");

const deletesOnSnapshots = () =>
  requests.filter(
    (r) => r.method === "DELETE" && r.url.includes("historical_inventory_snapshots")
  );

// =====================================================================
console.log("\n--- A. Default configuration: purge is fail-closed ---");
// =====================================================================
{
  requests.length = 0;
  const purged = await snapshotService.purgeExpiredInventorySnapshots("7", 90);
  check("No authorization → returns 0", purged === 0, `purged=${purged}`);
  check(
    "No authorization → zero HTTP requests issued (no DELETE on the wire)",
    requests.length === 0,
    `${requests.length} request(s)`
  );
}

// Anything short of a fully-formed authorization must also delete nothing.
for (const [label, auth] of [
  ["undefined", undefined],
  ["empty object", {}],
  ["authorized:false", { authorized: false, approvedBy: "ops" }],
  ["authorized:true without approver", { authorized: true, approvedBy: "" }],
  ["truthy-but-wrong authorized", { authorized: "yes", approvedBy: "ops" }],
]) {
  requests.length = 0;
  const purged = await snapshotService.purgeExpiredInventorySnapshots("7", 90, auth);
  check(
    `Malformed authorization (${label}) deletes nothing`,
    purged === 0 && deletesOnSnapshots().length === 0
  );
}

// =====================================================================
console.log("\n--- B. Production configuration: purge stays disabled ---");
// =====================================================================
{
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  requests.length = 0;
  const purged = await snapshotService.purgeExpiredInventorySnapshots("7", 90);
  check(
    "NODE_ENV=production → still no DELETE",
    purged === 0 && deletesOnSnapshots().length === 0
  );
  if (prevEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevEnv;
}

// =====================================================================
console.log("\n--- C/E. Real continuity service: snapshots persist, nothing is purged ---");
// =====================================================================
let purgeSpyCalls = [];
const fakeCapture = async () => ({
  marketplaceAccountId: "1",
  snapshotDate: "2026-09-08",
  status: "success",
  recordsRead: 12,
  rowsUpserted: 12,
  rowsSkipped: 0,
  missingDatesDetected: [],
  gapsFilled: [],
  message: null,
  auditId: null,
});
const fakeDeps = {
  resolveActivationDate: async () => "2026-01-01",
  detectMissing: async () => [],
  capture: fakeCapture,
  resolveRetentionDays: async () => 90,
  purge: async (...args) => {
    purgeSpyCalls.push(args);
    return 0;
  },
};

{
  purgeSpyCalls = [];
  requests.length = 0;
  const result = await continuityService.runInventorySnapshotContinuityForAccount("1", {
    trigger: "scheduled",
    deps: fakeDeps,
  });
  check("Default continuity tick never invokes purge", purgeSpyCalls.length === 0);
  check("Default continuity tick reports purgedRows=0", result.purgedRows === 0);
  check(
    "Snapshot persistence still runs (capture executed and upserted rows)",
    result.capture.status === "success" && result.capture.rowsUpserted === 12,
    `rowsUpserted=${result.capture.rowsUpserted}`
  );
  check("No DELETE reached the database", deletesOnSnapshots().length === 0);
}

// =====================================================================
console.log("\n--- C. Real worker inventory task → real continuity → no purge ---");
// =====================================================================
{
  purgeSpyCalls = [];
  requests.length = 0;
  const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    log: () => {},
  };

  const results = await inventoryTask.runInventoryWorkerTask({
    deadlineMs: Date.now() + 60_000,
    logger: silentLogger,
    deps: {
      listAccounts: async () => [
        { id: "1", accountName: "Account 1" },
        { id: "2", accountName: "Account 2" },
      ],
      // Real continuity service; only its I/O is faked. Whatever options the
      // worker passes are forwarded verbatim, so a future regression that starts
      // requesting a purge would surface here.
      runForAccount: (accountId, options) =>
        continuityService.runInventorySnapshotContinuityForAccount(accountId, {
          ...options,
          deps: fakeDeps,
        }),
    },
  });

  check("Worker processed both accounts", results.length === 2, `${results.length} result(s)`);
  check(
    "Worker inventory task invoked purge zero times",
    purgeSpyCalls.length === 0,
    `${purgeSpyCalls.length} invocation(s)`
  );
  check("Worker run issued no DELETE on snapshots", deletesOnSnapshots().length === 0);
  check(
    "Worker still records successful snapshot persistence",
    results.every((r) => r.outcome === "success")
  );
}

// =====================================================================
console.log("\n--- D/F. Explicit opt-in still works and stays account-scoped ---");
// =====================================================================
{
  requests.length = 0;
  await snapshotService.purgeExpiredInventorySnapshots("7", 30, {
    authorized: true,
    approvedBy: "phase-2.4-verification",
  });
  const deletes = deletesOnSnapshots();
  check("Explicit authorization issues exactly one DELETE", deletes.length === 1, `${deletes.length}`);
  const url = deletes[0]?.url ?? "";
  check(
    "DELETE is scoped to one marketplace_account_id",
    /marketplace_account_id=eq\.7(&|$)/.test(url),
    url
  );
  check("DELETE is bounded by a snapshot_date cutoff", /snapshot_date=lt\./.test(url), url);
  check(
    "DELETE targets only historical_inventory_snapshots",
    url.includes("historical_inventory_snapshots") &&
      !/wb_orders|wb_sales|wb_finance/.test(url)
  );
}

{
  purgeSpyCalls = [];
  const result = await continuityService.runInventorySnapshotContinuityForAccount("1", {
    trigger: "manual",
    retentionPurge: { authorized: true, approvedBy: "phase-2.4-verification" },
    deps: fakeDeps,
  });
  check("Continuity forwards an explicit opt-in to the purge", purgeSpyCalls.length === 1);
  check(
    "Forwarded call carries account id and authorization",
    purgeSpyCalls[0]?.[0] === "1" && purgeSpyCalls[0]?.[2]?.authorized === true,
    JSON.stringify(purgeSpyCalls[0]?.[2] ?? null)
  );
  check("Opt-in path still returns a numeric purgedRows", typeof result.purgedRows === "number");
}

// =====================================================================
console.log("\n--- Non-vacuity: the harness can actually observe a DELETE ---");
// =====================================================================
check(
  "Fake PostgREST recorded at least one DELETE during this run (assertions are meaningful)",
  requests.some((r) => r.method === "DELETE")
);

server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exitCode = failures === 0 ? 0 : 1;
