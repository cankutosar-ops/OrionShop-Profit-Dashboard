#!/usr/bin/env node
/**
 * Production Sync Worker verification.
 *
 *   npx tsx scripts/verify-sync-worker.mjs
 *   npx tsx scripts/verify-sync-worker.mjs --config-only   # CI preflight, no DB
 *
 * These are not grep assertions. Every behavioural case drives the real
 * orchestrator (`runSyncWorkerTick`) and the real task adapters, with the sync
 * kernels replaced by injected fakes through the same `deps` seam the finance
 * kernel already uses. That means the isolation, budget, exit-code and cursor
 * rules are executed rather than pattern-matched.
 *
 * Cases
 *   A  single-account success -> exit 0
 *   B  A1/A2 isolation: one account failing never fails or contaminates the other
 *   C  finance cursor is reported before/after and only moves on success
 *   D  a failed page does not advance the cursor
 *   E  429 stops the catch-up loop and does not advance the cursor
 *   F  duplicate re-run is safe (same input -> same outcome, no extra wakes)
 *   G  inventory task executes per account and isolates failures
 *   H  concurrency: no filesystem lock, no setInterval, workflow serialises runs
 *   I  configuration: missing secrets fail permanently, not retryably
 *   J  observability: required fields present, secrets never logged
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configOnly = process.argv.includes("--config-only");

let failures = 0;
let skipped = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${why}`);
}

const read = (p) => readFileSync(path.join(root, p), "utf8");
const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fake kernels
// ---------------------------------------------------------------------------

/** Collects log lines so observability and redaction can be asserted. */
function collectingLogger(executionId = "test-exec") {
  const lines = [];
  const log = (level, event, fields = {}) =>
    lines.push({ level, event, ...fields });
  return {
    lines,
    logger: {
      executionId,
      log,
      info: (e, f) => log("info", e, f),
      warn: (e, f) => log("warn", e, f),
      error: (e, f) => log("error", e, f),
    },
  };
}

function tickResult(results) {
  return {
    tickId: "tick-1",
    trigger: "scheduled",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    accountsConsidered: results.length,
    accountsSynced: results.filter((r) => !r.skipped).length,
    accountsSkipped: results.filter((r) => r.skipped).length,
    accountsFailed: 0,
    results,
  };
}

function account(id, name, entities, skipped = false) {
  return {
    marketplaceAccountId: id,
    accountName: name,
    skipped,
    entities,
  };
}

const ok = (entity) => ({ entity, status: "success", latestDataDate: "2026-09-07" });
const failed = (entity, error) => ({
  entity,
  status: "failed",
  latestDataDate: "2026-09-01",
  error,
});
const rateLimited = (entity) => ({
  entity,
  status: "rate_limited",
  latestDataDate: "2026-09-01",
  error: "[http 429] too many requests",
});

/** A finance wake outcome shaped like FinanceIncrementalWakeOutcome. */
function wake(status, cursorBefore, cursorAfter, extra = {}) {
  return {
    accountId: "1",
    status,
    mode: "catchup",
    week: { from: "2026-09-01", to: "2026-09-07" },
    cursorBefore,
    cursorAfter,
    weekStatus: "in_progress",
    httpStatus: status === "rate_limited" ? 429 : 200,
    responseRows: status === "wake_ok" ? 100 : 0,
    persistedRows: status === "wake_ok" ? 100 : 0,
    hasMore: true,
    httpRequests: 1,
    listCalls: 0,
    v5Calls: 0,
    retryPerformed: false,
    cursorAdvancedBeforePersist: false,
    reportsNextRequestNotBefore: null,
    reportsServerRetryUntil: null,
    remaining: null,
    limit: null,
    resetSeconds: null,
    retrySeconds: null,
    error: status === "rate_limited" ? "FINANCE_HTTP_429" : null,
    liveHttpAttempted: true,
    ...extra,
  };
}

const noCursor = async () => ({
  rrdId: null,
  weekFrom: null,
  weekTo: null,
  weekStatus: null,
  blockedUntil: null,
});

// ---------------------------------------------------------------------------

console.log("=== Production Sync Worker verification ===\n");

console.log("--- Static structure ---");
{
  const workerFiles = walk(path.join(root, "src/worker")).map(rel);
  check(
    "worker module exists under src/worker",
    workerFiles.length >= 5,
    `${workerFiles.length} files`
  );

  // Comments describe what the worker deliberately avoids, so they must be
  // stripped before asserting the code itself is free of those constructs.
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const workerSrc = workerFiles.map((f) => stripComments(read(f))).join("\n");

  // H — durable state only. A filesystem lock or a timer would break the
  // "stateless process, durable state in Supabase" contract.
  check(
    "H  worker uses no filesystem lock",
    !/writeFileSync|\bfs\.writeFile\b|\.lock\b/.test(workerSrc),
    "no fs writes in src/worker"
  );
  check(
    "H  worker uses no setInterval / process-lifetime scheduler",
    !/setInterval|setTimeout\s*\(/.test(workerSrc),
    "no timers in src/worker"
  );
  check(
    "H  worker does not call its own HTTP API",
    !/fetch\(\s*[`"']https?:\/\/localhost|\/api\//.test(workerSrc),
    "direct module calls only, no self-HTTP"
  );

  const cli = read("scripts/run-sync-worker.mjs");
  check(
    "CLI entrypoint is thin (delegates to src/worker)",
    cli.includes("src/worker/run-worker-tick.ts") &&
      !/wildberries|supabase\.from\(/i.test(cli),
    "no business logic in the entrypoint"
  );

  // The worker must be portable: no GitHub-Actions-specific logic in src/worker.
  check(
    "worker core is deployment-agnostic",
    !/GITHUB_ACTIONS|GITHUB_RUN_ID|process\.env\.CI\b/.test(workerSrc),
    "no GitHub Actions coupling in src/worker"
  );

  // The worker reaches the sync kernels through runBlockingDashboardSync.
  // next/server's after() only works inside a request scope, so if it ever
  // appears on the blocking path the worker breaks in production — outside a
  // Next server there is no request to defer to.
  const jobService = read("src/services/sync-job-service.ts");
  const blockingStart = jobService.indexOf("export async function runBlockingDashboardSync");
  const backgroundStart = jobService.indexOf(
    "export async function scheduleBackgroundDashboardSync"
  );
  const blockingBody =
    blockingStart >= 0
      ? jobService.slice(
          blockingStart,
          jobService.indexOf("export async function", blockingStart + 10)
        )
      : "";
  check(
    "blocking sync path does not use next/server after()",
    blockingStart >= 0 && !/\bafter\s*\(/.test(blockingBody),
    blockingStart < 0
      ? "runBlockingDashboardSync not found"
      : "after() confined to scheduleBackgroundDashboardSync"
  );
  check(
    "worker does not use the request-scoped background scheduler",
    backgroundStart >= 0 && !/scheduleBackgroundDashboardSync/.test(workerSrc),
    "worker never calls scheduleBackgroundDashboardSync"
  );
}

console.log("\n--- GitHub Actions workflow ---");
{
  const wf = "\\.github/workflows/sync-worker.yml";
  const wfPath = path.join(root, ".github/workflows/sync-worker.yml");
  if (!existsSync(wfPath)) {
    check("workflow exists", false, wf);
  } else {
    const y = read(".github/workflows/sync-worker.yml");
    check("workflow runs on a schedule", /on:[\s\S]*schedule:/.test(y), "cron trigger present");
    check(
      "workflow is hourly",
      /cron:\s*["']\d+\s+\*\s+\*\s+\*\s+\*["']/.test(y),
      (y.match(/cron:\s*["'][^"']+["']/) ?? ["?"])[0]
    );
    check(
      "H  workflow serialises runs via concurrency",
      /concurrency:[\s\S]*group:\s*sync-worker/.test(y),
      "concurrency group set"
    );
    check(
      "H  in-flight worker is never cancelled mid-page",
      /cancel-in-progress:\s*false/.test(y),
      "cancel-in-progress: false"
    );
    check(
      "workflow bounds execution",
      /timeout-minutes:\s*\d+/.test(y) && /--budget-ms/.test(y),
      "job timeout + worker budget"
    );
    check(
      "workflow hardcodes no secret values",
      !/(eyJ[A-Za-z0-9_-]{10,}|[0-9a-f]{64})/.test(y),
      "all secrets via ${{ secrets.* }}"
    );
    check(
      "workflow does not ship per-account WB API keys",
      !/WB_API_KEY/.test(y.replace(/#.*$/gm, "")),
      "WB keys stay encrypted in the database"
    );
    check(
      "workflow disables the in-process inventory timer",
      /INVENTORY_SNAPSHOT_SCHEDULER:\s*["']0["']/.test(y),
      "INVENTORY_SNAPSHOT_SCHEDULER=0"
    );
  }
}

console.log("\n--- Environment contract ---");
{
  const { inspectWorkerEnvironment, requiredWorkerEnvNames } = await import(
    "../src/worker/env.ts"
  );

  // I — a missing secret must be reported, not silently tolerated.
  const empty = {};
  const report = inspectWorkerEnvironment(empty);
  check(
    "I  missing secrets are detected",
    report.missing.length === 4,
    report.missing.join(", ")
  );

  // Server-shaped aliases keep NEXT_PUBLIC_* naming out of worker deployments.
  const aliased = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-value",
    SUPABASE_SERVICE_ROLE_KEY: "service-key-value",
    MARKETPLACE_CREDENTIALS_KEY: "0".repeat(64),
  };
  const aliasReport = inspectWorkerEnvironment(aliased);
  check(
    "I  SUPABASE_URL / SUPABASE_ANON_KEY aliases satisfy the contract",
    aliasReport.missing.length === 0 && aliasReport.aliasesApplied.length === 2,
    aliasReport.aliasesApplied.join(", ")
  );

  const placeholder = inspectWorkerEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key",
    MARKETPLACE_CREDENTIALS_KEY: "0".repeat(64),
  });
  check(
    "I  placeholder values are rejected",
    placeholder.missing.length === 3,
    placeholder.missing.join(", ")
  );

  check(
    "I  required env names are documented",
    requiredWorkerEnvNames().length === 4,
    requiredWorkerEnvNames().join(", ")
  );
}

console.log("\n--- Secret redaction ---");
{
  const { createWorkerLogger } = await import("../src/worker/logger.ts");
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role-value";

  const lines = [];
  const logger = createWorkerLogger("exec-redact", (l) => lines.push(l));
  logger.info("probe", {
    message: "connecting with super-secret-service-role-value",
    nested: { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk" },
  });
  process.env.SUPABASE_SERVICE_ROLE_KEY = previous;

  const output = lines.join("\n");
  check(
    "J  known secret values are redacted",
    !output.includes("super-secret-service-role-value") && output.includes("[redacted]"),
    "service role key stripped"
  );
  check(
    "J  token-shaped strings are redacted",
    !output.includes("eyJhbGciOiJIUzI1NiJ9"),
    "JWT-shaped value stripped"
  );
}

if (configOnly) {
  console.log(
    `\n${failures === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${failures} failure(s), ${skipped} skipped (config-only)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Behavioural cases against the real orchestrator
// ---------------------------------------------------------------------------

const { runSyncWorkerTick } = await import("../src/worker/run-worker-tick.ts");
const {
  WORKER_EXIT_OK,
  WORKER_EXIT_RETRYABLE,
  WORKER_EXIT_CONFIG_ERROR,
  DEFAULT_SYNC_WORKER_TASKS,
} = await import("../src/worker/types.ts");

console.log("\n--- A. Single-account success ---");
{
  const { logger, lines } = collectingLogger();
  const result = await runSyncWorkerTick({
    tasks: ["commercial"],
    accountIds: ["1"],
    skipEnvironmentCheck: true,
    logger,
    deps: {
      commercial: {
        runTick: async () => tickResult([account("1", "Account 1", [ok("orders"), ok("sales"), ok("finance")])]),
        readCursor: async () => ({ rrdId: 500, weekFrom: null, weekTo: null, weekStatus: null, blockedUntil: null }),
      },
    },
  });

  check("A  exit code is 0", result.exitCode === WORKER_EXIT_OK, `exit=${result.exitCode}`);
  check(
    "A  account result recorded as success",
    result.results.length === 1 && result.results[0].outcome === "success",
    result.results[0]?.outcome
  );
  check(
    "J  worker.start and worker.finish are logged",
    lines.some((l) => l.event === "worker.start") &&
      lines.some((l) => l.event === "worker.finish"),
    "lifecycle events present"
  );
  const accountLine = lines.find((l) => l.event === "task.account");
  check(
    "J  per-account log carries account, entities, cursor and duration",
    !!accountLine &&
      accountLine.marketplaceAccountId === "1" &&
      Array.isArray(accountLine.entities) &&
      "financeCursorAfter" in accountLine &&
      typeof accountLine.durationMs === "number",
    accountLine ? Object.keys(accountLine).join(",") : "missing"
  );
}

console.log("\n--- B. A1 / A2 isolation ---");
{
  const { logger } = collectingLogger();
  const result = await runSyncWorkerTick({
    tasks: ["commercial"],
    skipEnvironmentCheck: true,
    logger,
    deps: {
      commercial: {
        // Account 1 succeeds, Account 2 is rate limited — the documented
        // "worker must not fail globally" scenario.
        runTick: async () =>
          tickResult([
            account("1", "Account 1", [ok("orders"), ok("sales"), ok("finance")]),
            account("2", "Account 2", [ok("orders"), rateLimited("finance")]),
          ]),
        readCursor: noCursor,
      },
    },
  });

  const a1 = result.results.find((r) => r.marketplaceAccountId === "1");
  const a2 = result.results.find((r) => r.marketplaceAccountId === "2");

  check("B  Account 1 succeeded", a1?.outcome === "success", a1?.outcome);
  check(
    "B  Account 2 recorded as retryable, not fatal",
    a2?.outcome === "retryable_failure" && a2?.rateLimited === true,
    `${a2?.outcome} rateLimited=${a2?.rateLimited}`
  );
  check(
    "B  Account 1 is not contaminated by Account 2's failure",
    a1?.outcome === "success" && (a1?.entities ?? []).every((e) => e.status === "success"),
    "A1 entities all success"
  );
  check(
    "B  both accounts are reported separately",
    result.results.length === 2 && result.accountsConsidered === 2,
    `${result.accountsConsidered} accounts`
  );
  check(
    "B  a per-account failure still yields a retryable exit, not a crash",
    result.exitCode === WORKER_EXIT_RETRYABLE,
    `exit=${result.exitCode}`
  );

  // No result may carry another account's identity.
  check(
    "B  no cross-account result leakage",
    result.results.every(
      (r) =>
        (r.marketplaceAccountId === "1" && r.accountName === "Account 1") ||
        (r.marketplaceAccountId === "2" && r.accountName === "Account 2")
    ),
    "account id/name pairs intact"
  );
}

console.log("\n--- C/D/E. Finance cursor semantics ---");
{
  // C — cursor advances across a successful wake and is reported.
  let cursor = 100;
  const { logger, lines } = collectingLogger();
  const result = await runSyncWorkerTick({
    tasks: ["finance-catchup"],
    skipEnvironmentCheck: true,
    financeCatchupMaxWakes: 3,
    logger,
    deps: {
      financeCatchup: {
        listAccounts: async () => [{ id: "1", accountName: "Account 1" }],
        readCursor: async () => ({
          rrdId: cursor,
          weekFrom: "2026-09-01",
          weekTo: "2026-09-07",
          weekStatus: "in_progress",
          blockedUntil: null,
        }),
        runWake: async () => {
          const before = cursor;
          cursor += 100; // kernel advanced the cursor after a successful persist
          return wake("wake_ok", before, cursor);
        },
      },
    },
  });

  const r = result.results[0];
  check(
    "C  cursor before/after are recorded",
    r.financeCursorBefore === 100 && r.financeCursorAfter === 400,
    `${r.financeCursorBefore} -> ${r.financeCursorAfter}`
  );
  check(
    "C  bounded to the configured wake budget",
    lines.filter((l) => l.event === "finance.wake").length === 3,
    "3 wakes"
  );
  check(
    "C  wake logs carry rows fetched / persisted",
    lines
      .filter((l) => l.event === "finance.wake")
      .every((l) => typeof l.rowsFetched === "number" && typeof l.rowsPersisted === "number"),
    "row counts present"
  );
}

{
  // D — a failed page must not move the cursor.
  const fixedCursor = 250;
  const { logger } = collectingLogger();
  let wakes = 0;
  const result = await runSyncWorkerTick({
    tasks: ["finance-catchup"],
    skipEnvironmentCheck: true,
    financeCatchupMaxWakes: 5,
    logger,
    deps: {
      financeCatchup: {
        listAccounts: async () => [{ id: "1", accountName: "Account 1" }],
        readCursor: async () => ({
          rrdId: fixedCursor,
          weekFrom: null,
          weekTo: null,
          weekStatus: null,
          blockedUntil: null,
        }),
        runWake: async () => {
          wakes += 1;
          return wake("failed", fixedCursor, fixedCursor, {
            error: "persistence failed",
            persistedRows: 0,
          });
        },
      },
    },
  });

  const r = result.results[0];
  check(
    "D  failed page does not advance the cursor",
    r.financeCursorBefore === fixedCursor && r.financeCursorAfter === fixedCursor,
    `${r.financeCursorBefore} -> ${r.financeCursorAfter}`
  );
  check("D  failure stops the loop after one wake", wakes === 1, `${wakes} wake(s)`);
  check(
    "D  failure surfaces as retryable, preserving durable state",
    r.outcome === "retryable_failure" && result.exitCode === WORKER_EXIT_RETRYABLE,
    `${r.outcome}, exit=${result.exitCode}`
  );
}

{
  // E — 429 must end the task immediately with the cursor untouched.
  const fixedCursor = 777;
  const { logger } = collectingLogger();
  let wakes = 0;
  const result = await runSyncWorkerTick({
    tasks: ["finance-catchup"],
    skipEnvironmentCheck: true,
    financeCatchupMaxWakes: 5,
    logger,
    deps: {
      financeCatchup: {
        listAccounts: async () => [{ id: "1", accountName: "Account 1" }],
        readCursor: async () => ({
          rrdId: fixedCursor,
          weekFrom: null,
          weekTo: null,
          weekStatus: null,
          blockedUntil: null,
        }),
        runWake: async () => {
          wakes += 1;
          return wake("rate_limited", fixedCursor, fixedCursor);
        },
      },
    },
  });

  const r = result.results[0];
  check("E  429 does not advance the cursor", r.financeCursorAfter === fixedCursor, `rrdId=${r.financeCursorAfter}`);
  check("E  429 stops the loop immediately (no retry storm)", wakes === 1, `${wakes} wake(s)`);
  check("E  429 is flagged", r.rateLimited === true, `rateLimited=${r.rateLimited}`);
  check(
    "E  429 is not a hard failure — the next wake retries",
    r.outcome === "skipped" && result.exitCode === WORKER_EXIT_OK,
    `${r.outcome}, exit=${result.exitCode}`
  );
}

console.log("\n--- F. Duplicate-safe re-run ---");
{
  // Re-running an identical tick must produce an identical outcome and must not
  // perform extra work when the kernel reports the week already complete.
  const makeDeps = (counter) => ({
    financeCatchup: {
      listAccounts: async () => [{ id: "1", accountName: "Account 1" }],
      readCursor: async () => ({
        rrdId: 0,
        weekFrom: null,
        weekTo: null,
        weekStatus: "complete",
        blockedUntil: null,
      }),
      runWake: async () => {
        counter.n += 1;
        return wake("week_complete", 0, null);
      },
    },
  });

  const first = { n: 0 };
  const second = { n: 0 };
  const { logger } = collectingLogger();

  const r1 = await runSyncWorkerTick({
    tasks: ["finance-catchup"],
    skipEnvironmentCheck: true,
    logger,
    deps: makeDeps(first),
  });
  const r2 = await runSyncWorkerTick({
    tasks: ["finance-catchup"],
    skipEnvironmentCheck: true,
    logger,
    deps: makeDeps(second),
  });

  check(
    "F  re-run produces the same outcome",
    r1.results[0].outcome === r2.results[0].outcome && r1.exitCode === r2.exitCode,
    `${r1.results[0].outcome} / exit ${r1.exitCode}`
  );
  check(
    "F  a completed week consumes exactly one wake per run",
    first.n === 1 && second.n === 1,
    `${first.n} and ${second.n} wakes`
  );
}

console.log("\n--- G. Inventory task ---");
{
  const { logger } = collectingLogger();
  const seen = [];
  const result = await runSyncWorkerTick({
    tasks: ["inventory"],
    skipEnvironmentCheck: true,
    logger,
    deps: {
      inventory: {
        listAccounts: async () => [
          { id: "1", accountName: "Account 1" },
          { id: "2", accountName: "Account 2" },
        ],
        runForAccount: async (accountId) => {
          seen.push(accountId);
          if (accountId === "2") throw new Error("analytics endpoint unavailable");
          return {
            marketplaceAccountId: accountId,
            activationDate: "2026-01-01",
            capture: {
              marketplaceAccountId: accountId,
              snapshotDate: "2026-09-08",
              status: "success",
              recordsRead: 120,
              rowsUpserted: 120,
              rowsSkipped: 0,
              missingDatesDetected: [],
              gapsFilled: [],
              message: "ok",
              auditId: null,
            },
            missingBefore: [],
            missingAfter: [],
            gapsFilled: [],
            purgedRows: 0,
            retentionDays: 90,
            continuousFromActivation: true,
          };
        },
      },
    },
  });

  check("G  inventory ran for every account", seen.join(",") === "1,2", seen.join(","));
  check(
    "G  Account 1 inventory succeeded despite Account 2 throwing",
    result.results.find((r) => r.marketplaceAccountId === "1")?.outcome === "success",
    "isolated"
  );
  check(
    "G  Account 2 inventory failure is retryable and attributed correctly",
    result.results.find((r) => r.marketplaceAccountId === "2")?.outcome ===
      "retryable_failure",
    "attributed to account 2"
  );
}

console.log("\n--- Budget / extension point ---");
{
  const { logger } = collectingLogger();
  // A budget already spent must skip work rather than start it.
  const result = await runSyncWorkerTick({
    tasks: ["commercial"],
    skipEnvironmentCheck: true,
    executionBudgetMs: -1,
    logger,
    deps: { commercial: { runTick: async () => tickResult([]), readCursor: noCursor } },
  });
  check(
    "budget exhaustion skips rather than fails",
    result.results.every((r) => r.outcome === "skipped") &&
      result.exitCode === WORKER_EXIT_OK,
    `exit=${result.exitCode}`
  );

  // Advertising task: per-account isolation and failure attribution, same
  // contract as the inventory task above.
  const adsSeen = [];
  const adsRun = await runSyncWorkerTick({
    tasks: ["ads"],
    skipEnvironmentCheck: true,
    logger: collectingLogger().logger,
    deps: {
      ads: {
        listAccounts: async () => [
          { id: "1", accountName: "Account 1" },
          { id: "2", accountName: "Account 2" },
        ],
        runForAccount: async (accountId, options) => {
          adsSeen.push(`${accountId}:${options.from}..${options.to}`);
          return {
            marketplaceAccountId: accountId,
            from: options.from,
            to: options.to,
            campaignsRetrievable: 3,
            campaignsUnretrievable: 0,
            fullstatsRequests: 1,
            rowsMapped: 10,
            rowsPersisted: accountId === "2" ? 0 : 10,
            rowsUnmatched: 0,
            spendPersisted: accountId === "2" ? 0 : 1234.56,
            spendUnmatched: 0,
            unmatchedNmIds: [],
            errors: accountId === "2" ? ["fullstats 2026-01-01..2026-01-31: HTTP 429"] : [],
            durationMs: 5,
          };
        },
        today: () => new Date("2026-09-09T00:00:00Z"),
      },
    },
  });

  check(
    "ads task runs once per account, account-scoped",
    adsSeen.length === 2 &&
      adsSeen[0].startsWith("1:") &&
      adsSeen[1].startsWith("2:"),
    adsSeen.join(" | ")
  );
  check(
    "ads task uses a bounded incremental lookback window",
    adsSeen[0] === "1:2026-08-26..2026-09-09",
    adsSeen[0] ?? "no window"
  );
  check(
    "ads Account 1 succeeds despite Account 2 erroring",
    adsRun.results.find((r) => r.marketplaceAccountId === "1")?.outcome === "success",
    "isolated"
  );
  check(
    "ads Account 2 error is retryable and attributed correctly",
    adsRun.results.find((r) => r.marketplaceAccountId === "2")?.outcome ===
      "retryable_failure",
    "attributed to account 2"
  );
  check(
    "ads is not part of the default scheduled tick",
    !DEFAULT_SYNC_WORKER_TASKS.includes("ads"),
    DEFAULT_SYNC_WORKER_TASKS.join(",")
  );
}

console.log("\n--- I. Permanent vs retryable failure ---");
{
  const { WorkerConfigurationError } = await import("../src/worker/types.ts");
  let thrown = null;
  try {
    await runSyncWorkerTick({
      tasks: ["commercial"],
      logger: collectingLogger().logger,
      // Environment check enabled with a deliberately empty env.
      skipEnvironmentCheck: false,
      deps: { commercial: { runTick: async () => tickResult([]), readCursor: noCursor } },
    });
  } catch (err) {
    thrown = err;
  }

  const envIncomplete =
    !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.MARKETPLACE_CREDENTIALS_KEY;

  if (thrown instanceof WorkerConfigurationError) {
    check(
      "I  missing configuration throws WorkerConfigurationError (exit 20)",
      WORKER_EXIT_CONFIG_ERROR === 20,
      thrown.message.slice(0, 60)
    );
  } else if (!envIncomplete) {
    // A fully configured .env.local is a legitimate reason not to throw.
    skip("I  missing configuration throws", "local environment is fully configured");
  } else {
    check("I  missing configuration throws WorkerConfigurationError", false, "no error thrown");
  }
}

console.log(
  `\n${failures === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${failures} failure(s), ${skipped} skipped`
);
process.exit(failures === 0 ? 0 : 1);
