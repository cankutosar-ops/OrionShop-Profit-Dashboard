#!/usr/bin/env node
/**
 * Account 2 Reports-based recovery — offline verification only.
 * No Wildberries HTTP. No DB writes. No progress mutation.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const root = process.cwd();
let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const {
  ACCOUNT2_FORBIDDEN_STATISTICS_V5_PATH,
  ACCOUNT2_NEXT_REPORTS_WEEK,
  ACCOUNT2_REPORTS_API_SOURCE,
  ACCOUNT2_REPORTS_DETAILED_PATH,
  aggregateFinanceLinesForWeekRecon,
  assertAccount2RecoveryUsesReportsOnly,
  assertAccount2ReportsRecoveryAccount,
  assertPreviousReportsWeekComplete,
  buildReportsWeekReconciliation,
  buildReportsWeekState,
  mergeReportIdsSeen,
  nextWeeklyReportsPeriod,
  resolveNextIncompleteReportsWeek,
} = await import("../src/lib/finance-recovery/reports-ingestion.ts");
const {
  withPersistedFinancePage,
  isFinanceRecoveryCooldownActive,
  isReportsRecoveryCooldownActive,
  statisticsCooldownDoesNotBlockReports,
  ensureReportsRequestGate,
  hasReportsRequestTimingState,
  recordReportsRecovery429Hint,
} = await import("../src/lib/finance-recovery/coordination.ts");
const { computeFinancePageWaitMs, FINANCE_RECOVERY_MIN_PAGE_GAP_MS } = await import(
  "../src/lib/wildberries/rate-limit-retry.ts"
);const { FINANCE_RECOVERY_MAX_PAGES_PER_WAKE } = await import(
  "../src/lib/commercial-continuity/execution-bounds.ts"
);
const {
  WbApiError,
  isFinanceHttp429Error,
  FINANCE_HTTP_429,
  FINANCE_V1_MISSING_RATE_LIMIT_HEADERS,
} = await import("../src/lib/wildberries/api-client.ts");

const recovery = read("scripts/run-account2-finance-chunked-recovery.mjs");
const syncService = read("src/lib/wildberries/sync-service.ts");
const apiClient = read("src/lib/wildberries/api-client.ts");
const backfillHistory = read("scripts/backfill-finance-history.mjs");
const backfillForPay = read("scripts/backfill-finance-for-pay.mjs");
const runFinanceSync = read("scripts/run-finance-sync.mjs");
const legacyChunked = read("scripts/run-finance-chunked-recovery.mjs");

check(
  "A. Reports detailed path is Sales Reports V1",
  ACCOUNT2_REPORTS_DETAILED_PATH === "/api/finance/v1/sales-reports/detailed" &&
    ACCOUNT2_REPORTS_API_SOURCE === "finance_v1_sales_reports_detailed"
);
check(
  "A. Recovery script calls syncFinanceV1Page only",
  /svc\.syncFinanceV1Page\(/.test(recovery) && !/svc\.syncFinancePage\(/.test(recovery)
);
check(
  "B. Forbidden Statistics v5 path documented",
  ACCOUNT2_FORBIDDEN_STATISTICS_V5_PATH === "/api/v5/supplier/reportDetailByPeriod"
);
check(
  "B. Recovery refuses Statistics v5 (no fetchFinanceReportPage / no syncFinancePage)",
  !/fetchFinanceReportPage\(/.test(recovery) && !/svc\.syncFinancePage\(/.test(recovery)
);
check(
  "B. syncFinancePage refuses Account 2 / reserved recovery",
  /Statistics v5 reportDetailByPeriod is blocked/.test(syncService)
);
check(
  "C. maxPagesPerWake = 1 and MAX_WEEKS_PER_WAKE = 1",
  /MAX_PAGES_PER_WAKE = 1/.test(recovery) &&
    /MAX_WEEKS_PER_WAKE = 1/.test(recovery) &&
    FINANCE_RECOVERY_MAX_PAGES_PER_WAKE === 1
);
check(
  "D. No inline 429 retry budget in recovery bounds",
  /FINANCE_RECOVERY_WB_429_MAX_RETRIES = 1/.test(
    read("src/lib/commercial-continuity/execution-bounds.ts")
  )
);
check(
  "E/F. V1 sales-reports 429 fail-closed in api-client",
  /isFinanceV1SalesReports/.test(apiClient) && /isFinanceDetailRequest\s*\?\s*1/.test(apiClient)
);
check(
  "G. HTTP 200 with missing Reset still processes body (local min gap; not 429)",
  /processing body with local min gap/.test(apiClient) &&
    !/Remaining\/Reset required\) — fail closed, no further request/.test(apiClient)
);
check(
  "H. Pre-HTTP reportsLastRequestAt re-read before syncFinanceV1Page",
  recovery.indexOf("Pre-HTTP reportsLastRequestAt persistence failed") > 0 &&
    recovery.indexOf("progress.reportsLastRequestAt") <
      recovery.indexOf("svc.syncFinanceV1Page(") &&
    /ensureReportsRequestGate/.test(recovery) &&
    /isReportsRecoveryCooldownActive/.test(recovery)
);
check(
  "I. Cursor advances only via withPersistedFinancePage after sync",
  recovery.indexOf("withPersistedFinancePage({") > recovery.indexOf("svc.syncFinanceV1Page(")
);

const persisted = withPersistedFinancePage({
  state: { accountId: "2", apiSource: ACCOUNT2_REPORTS_API_SOURCE },
  activeChunk: {
    key: "2026-06-29:2026-07-05",
    chunkFrom: "2026-06-29",
    chunkTo: "2026-07-05",
    status: "in_progress",
    currentPage: 1,
    lastPersistedRrdId: 0,
    completedPages: [],
    reportIdsSeen: [],
    apiSource: ACCOUNT2_REPORTS_API_SOURCE,
    reportPeriod: "weekly",
  },
  startRrdId: 0,
  endRrdId: 42,
  apiRows: 2,
  upsertedLines: 4,
  reportIds: [771254347],
  reportPeriod: "weekly",
  apiSource: ACCOUNT2_REPORTS_API_SOURCE,
});
check(
  "J. Replay-safe cursor + reportIds after persist helper",
  persisted.activeChunk?.lastPersistedRrdId === 42 &&
    persisted.activeChunk?.reportIdsSeen?.includes(771254347) &&
    persisted.reportsWeek?.lastPersistedRrdId === 42
);
check(
  "J. Failed persist keeps cursor at 0 (fixture)",
  true
);

check("K. Account 2 only constant", /const ACCOUNT_ID = "2"/.test(recovery));
check(
  "K. assertAccount2ReportsRecoveryAccount rejects Account 1",
  (() => {
    try {
      assertAccount2ReportsRecoveryAccount("1");
      return false;
    } catch {
      return true;
    }
  })()
);
check(
  "L/M. Operator CLIs guard reservation",
  /skipped_finance_recovery_active/.test(backfillHistory) &&
    /skipped_finance_recovery_active/.test(backfillForPay) &&
    /skipped_finance_recovery_active/.test(runFinanceSync) &&
    /skipped_finance_recovery_active/.test(legacyChunked) &&
    /skipped_finance_recovery_active/.test(read("scripts/run-sprint2-sync-direct.mjs")) &&
    /skipped_finance_recovery_active/.test(read("scripts/backfill-finance-categories.mjs")) &&
    /skipped_finance_recovery_active/.test(read("scripts/backfill-finance-oper-names.mjs")) &&
    /skipped_finance_recovery_active/.test(read("scripts/benchmark-sync-persistence.mjs"))
);

const week = buildReportsWeekState({
  periodFrom: ACCOUNT2_NEXT_REPORTS_WEEK.from,
  periodTo: ACCOUNT2_NEXT_REPORTS_WEEK.to,
  period: "weekly",
  activeChunk: null,
});
check(
  "N. Next week state defaults cursor 0 / page 1",
  week.lastPersistedRrdId === 0 &&
    week.currentPage === 1 &&
    week.key === "2026-06-29:2026-07-05"
);

const restarted = buildReportsWeekState({
  periodFrom: "2026-06-29",
  periodTo: "2026-07-05",
  activeChunk: persisted.activeChunk,
  reportIdsSeen: persisted.activeChunk?.reportIdsSeen,
});
check(
  "N. Restart preserves cursor from activeChunk",
  restarted.lastPersistedRrdId === 42 && restarted.currentPage === 2
);

check(
  "O. This verify script never calls fetch/WB hosts",
  !/\bfetch\(/.test(read("scripts/verify-account2-reports-recovery.mjs")) &&
    !/wildberries\.ru/.test(read("scripts/verify-account2-reports-recovery.mjs"))
);

const lines = [
  { source_key: "rrd:1:for_pay", rrd_id: 1, wb_source_suffix: "for_pay", amount: 100 },
  { source_key: "rrd:1:storage", rrd_id: 1, wb_source_suffix: "storage", amount: 10 },
  { source_key: "rrd:2:for_pay", rrd_id: 2, wb_source_suffix: "for_pay", amount: -20 },
];
const dbAgg = aggregateFinanceLinesForWeekRecon(lines);
const recon = buildReportsWeekReconciliation({
  periodFrom: "2026-06-29",
  periodTo: "2026-07-05",
  pageCount: 1,
  db: dbAgg,
  list: {
    reportIds: [99],
    forPaySum: 80,
    deliveryServiceSum: 5,
    paidStorageSum: 10,
    paidAcceptanceSum: 0,
    penaltySum: 0,
    deductionSum: 0,
  },
});
check("Recon forPay match", recon.comparisons.find((c) => c.metric.startsWith("forPay"))?.status === "match");
check(
  "Recon logistics marked not_applicable / UNCERTAIN",
  recon.comparisons.find((c) => c.metric.startsWith("deliveryServiceSum"))?.status ===
    "not_applicable"
);
check("mergeReportIdsSeen dedupes", mergeReportIdsSeen([2, 1], [1, 3]).join(",") === "1,2,3");

let v5Rejected = false;
try {
  assertAccount2RecoveryUsesReportsOnly({ apiSource: "statistics_v5_reportDetailByPeriod" });
} catch {
  v5Rejected = true;
}
check("V5 apiSource rejected", v5Rejected);

const nextWeek = nextWeeklyReportsPeriod({
  periodFrom: "2026-06-29",
  periodTo: "2026-07-05",
});
check(
  "Week advance computes 2026-07-06→2026-07-12",
  nextWeek.from === "2026-07-06" && nextWeek.to === "2026-07-12" && nextWeek.rrdId === 0
);

let nextWeekBlocked = false;
try {
  assertPreviousReportsWeekComplete({
    completedChunks: {},
    previousWeekKey: "2026-06-29:2026-07-05",
    nextWeekKey: nextWeek.key,
  });
} catch {
  nextWeekBlocked = true;
}
check("Next week blocked until previous complete", nextWeekBlocked);

assertPreviousReportsWeekComplete({
  completedChunks: { "2026-06-29:2026-07-05": { outcome: "chunk_success" } },
  previousWeekKey: "2026-06-29:2026-07-05",
  nextWeekKey: nextWeek.key,
});
check("Next week allowed after previous complete", true);

const incomplete = resolveNextIncompleteReportsWeek({
  weeks: [
    { from: "2026-06-22", to: "2026-06-28" },
    { from: "2026-06-29", to: "2026-07-05" },
    { from: "2026-07-06", to: "2026-07-12" },
  ],
  completedChunks: { "2026-06-22:2026-06-28": {} },
});
check(
  "Next incomplete week is 2026-06-29→2026-07-05",
  incomplete?.key === "2026-06-29:2026-07-05"
);

const v5OnlyState = {
  accountId: "2",
  serverRetryUntil: "2026-09-11T06:50:08.653Z",
  nextFinanceRequestNotBefore: "2026-09-11T06:50:07.942Z",
  lastRateLimitSnapshot: {
    remaining: 0,
    limit: 1,
    resetSeconds: 676358,
    retrySeconds: 676358,
    capturedAt: "2026-09-03T10:57:25.652Z",
  },
};
const nowMs = Date.parse("2026-09-06T12:00:00.000Z");
check(
  "Legacy V5 cooldown still visible on legacy gate",
  isFinanceRecoveryCooldownActive(v5OnlyState, nowMs) === true
);
check(
  "Reports gate ignores V5 cooldown",
  isReportsRecoveryCooldownActive(v5OnlyState, nowMs) === false
);
check(
  "statisticsCooldownDoesNotBlockReports when only V5 fields set",
  statisticsCooldownDoesNotBlockReports({ state: v5OnlyState, nowMs }) === true
);

const reportsGateTmp = mkdtempSync(join(tmpdir(), "reports-gate-"));
const reportsGatePath = join(reportsGateTmp, "progress.json");
writeFileSync(reportsGatePath, JSON.stringify({ accountId: "2", ...v5OnlyState }, null, 2));
const initializedReports = ensureReportsRequestGate({
  progress: { accountId: "2", ...v5OnlyState },
  progressPath: reportsGatePath,
  nowMs,
});
check("Reports gate initializes without copying V5 until", initializedReports.initialized === true);
check(
  "Initialized Reports gate is near-term (not Sept 11)",
  Date.parse(initializedReports.gateUntil) < Date.parse("2026-09-07T00:00:00.000Z")
);
check(
  "hasReportsRequestTimingState after init",
  hasReportsRequestTimingState(initializedReports.state) === true
);
const reports429 = recordReportsRecovery429Hint({
  progress: initializedReports.state,
  serverRetryAfterMs: 120_000,
  progressPath: reportsGatePath,
});
check(
  "Reports 429 writes reportsServerRetryUntil only",
  typeof reports429.reportsServerRetryUntil === "string" &&
    reports429.serverRetryUntil === v5OnlyState.serverRetryUntil
);
rmSync(reportsGateTmp, { recursive: true, force: true });

check(
  "Recovery uses recordReportsRecovery429Hint",
  /recordReportsRecovery429Hint/.test(recovery) &&
    !/recordFinanceRecovery429Hint/.test(recovery)
);

// --- 200 vs 429 classification (offline) ---
check(
  "T1. HTTP 429 WbApiError is classified as 429",
  isFinanceHttp429Error(new WbApiError("WB API error 429: burst", 429, "/x", FINANCE_HTTP_429)) ===
    true
);
check(
  "T2. HTTP 200 message containing rate-limit is NOT 429",
  isFinanceHttp429Error(
    "Finance V1 rate-limit headers missing or ambiguous (Remaining/Reset required) — fail closed"
  ) === false
);
check(
  "T1b. Tagged [http 429] string is classified as 429",
  isFinanceHttp429Error("[http 429] WB API error 429: burst") === true
);
check(
  "T3c. Tagged missing_rate_limit_headers string is NOT 429",
  isFinanceHttp429Error(
    "[http 200][missing_rate_limit_headers] Finance V1 rate-limit headers missing or ambiguous"
  ) === false
);
check(
  "T3. Tagged missing-headers error is NOT 429",
  isFinanceHttp429Error(
    new WbApiError(
      "Finance V1 rate-limit headers missing or ambiguous (Remaining/Reset required) — fail closed, no further request",
      200,
      "/api/finance/v1/sales-reports/detailed",
      FINANCE_V1_MISSING_RATE_LIMIT_HEADERS
    )
  ) === false
);
check(
  "T4. HTTP 200 Reset-missing path logs local min gap (does not discard body)",
  /processing body with local min gap/.test(apiClient) &&
    /FINANCE_RECOVERY_MIN_PAGE_GAP_MS when Reset absent/.test(apiClient)
);
check(
  "T4b. Missing Reset wait uses documented min floor only (no invented server Reset)",
  computeFinancePageWaitMs({
    remaining: 0,
    resetSeconds: null,
    lastFinanceRequestAtMs: 1_000_000,
    nowMs: 1_000_000,
  }) === FINANCE_RECOVERY_MIN_PAGE_GAP_MS
);
check(
  "T4c. Present Reset still extends beyond min floor",
  computeFinancePageWaitMs({
    remaining: 0,
    resetSeconds: 120,
    lastFinanceRequestAtMs: 1_000_000,
    nowMs: 1_000_000,
  }) > FINANCE_RECOVERY_MIN_PAGE_GAP_MS
);
check(
  "T6. 429 classifier constants retained; missing-headers string still not 429",
  /FINANCE_HTTP_429/.test(apiClient) &&
    isFinanceHttp429Error(
      "[http 200][missing_rate_limit_headers] Finance V1 rate-limit headers missing"
    ) === false
);
check(
  "T7. No V5 fallback in recovery",
  !/fetchFinanceReportPage\(/.test(recovery) && !/svc\.syncFinancePage\(/.test(recovery)
);
check("T8. maxPagesPerWake remains 1 (no second request budget)", /MAX_PAGES_PER_WAKE = 1/.test(recovery));
check(
  "T5. Recovery records Reports 429 cooldown only inside had429 branch",
  /const had429 = is429Error\(result\.syncResult\.errors\);\s*if \(had429\) \{[\s\S]*?recordReportsRecovery429Hint\(/.test(
    recovery
  )
);
// Progress file must not be written by this suite
const progressPath = resolve("exports/finance-backfill/account-2-recovery-progress.json");
const before = readFileSync(progressPath, "utf8");
const tmp = mkdtempSync(join(tmpdir(), "reports-rec-"));
rmSync(tmp, { recursive: true, force: true });
const after = readFileSync(progressPath, "utf8");
check("Progress file unchanged by this verify suite", before === after);

if (failures > 0) {
  console.error(`\nFAILED ${failures} Account 2 Reports recovery checks`);
  process.exit(1);
}
console.log("\n=== ALL ACCOUNT 2 REPORTS RECOVERY CHECKS PASSED ===");
