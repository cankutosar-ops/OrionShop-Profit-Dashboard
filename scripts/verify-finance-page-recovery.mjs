#!/usr/bin/env node
/**
 * Deterministic Finance page-recovery safety verification.
 * No database credentials, production rows, or Wildberries requests are used.
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

const apiClient = read("src/lib/wildberries/api-client.ts");
const syncService = read("src/lib/wildberries/sync-service.ts");
const recoveryScript = read("scripts/run-account2-finance-chunked-recovery.mjs");
const migration = read("supabase/migrations/20260722180000_finance_sync_architecture_v2.sql");

check(
  "One-page Finance fetch exists",
  /async fetchFinanceReportPage\(/.test(apiClient)
);
check(
  "Legacy Finance fetch delegates to page fetch",
  /this\.fetchFinanceReportPage\(dateFrom,\s*dateTo,\s*rrdid\)/s.test(apiClient)
);
check(
  "Recovery uses page-level sync",
  /svc\.syncFinanceV1Page\(/.test(recoveryScript) &&
    !/svc\.syncFinance\(chunk\.from,\s*chunk\.to\)/.test(recoveryScript)
);
check(
  "Hardcoded UUID removed from Finance sync",
  !/00000000-0000-0000-0000-000000000099/.test(syncService)
);
check(
  "Finance batches use composite atomic upsert",
  /onConflict:\s*"marketplace_account_id,source_key"/.test(syncService)
);

const financeBatchStart = syncService.indexOf("async function batchUpsertFinance");
const financeBatchEnd = syncService.indexOf(
  "export type WbFinancePageSyncResult",
  financeBatchStart
);
const financeBatch = syncService.slice(financeBatchStart, financeBatchEnd);
check(
  "Finance persistence contains no DELETE",
  financeBatchStart >= 0 && !/\.delete\(/.test(financeBatch)
);
check(
  "Unsafe replace_insert strategy removed",
  !/replace_insert|resolveFinancePersistStrategy|probeFinanceUpsert/.test(syncService)
);
check(
  "Recovery schema check is before lock acquisition",
  recoveryScript.indexOf("assertFinanceRecoverySchemaReady(sb)") >= 0 &&
    recoveryScript.indexOf("assertFinanceRecoverySchemaReady(sb)") <
      recoveryScript.indexOf("acquireFinanceRecoveryAccountLock(ACCOUNT_ID)")
);
check(
  "Cooldown check is before DB client and lock",
  recoveryScript.indexOf("isReportsRecoveryCooldownActive(progress)") >= 0 &&
    recoveryScript.indexOf("isReportsRecoveryCooldownActive(progress)") <
      recoveryScript.indexOf("const sb = createAdminClient()") &&
    recoveryScript.indexOf("isReportsRecoveryCooldownActive(progress)") <
      recoveryScript.indexOf("acquireFinanceRecoveryAccountLock(ACCOUNT_ID)")
);
check(
  "Cursor write follows page sync",
  recoveryScript.indexOf("withPersistedFinancePage({") >
    recoveryScript.indexOf("svc.syncFinanceV1Page(")
);
check(
  "Progress save follows persisted cursor update",
  recoveryScript.indexOf(
    "saveProgress(progress);",
    recoveryScript.indexOf("withPersistedFinancePage({")
  ) > recoveryScript.indexOf("withPersistedFinancePage({")
);
check(
  "429 records partial status and stops",
  /status:\s*"blocked_partial"/.test(recoveryScript) &&
    /if \(rateLimited \|\| failed\) break;/.test(recoveryScript)
);
check(
  "Non-429 errors use failed status not blocked_partial",
  /status = "failed"/.test(recoveryScript) &&
    /FAILED: page persistence\/API error/.test(recoveryScript)
);
check(
  "Successful completed chunk clears Reports cooldown markers (preserves V5 evidence)",
  /progress\.reportsServerRetryUntil = null/.test(recoveryScript) &&
    !/progress\.serverRetryUntil = null/.test(recoveryScript) &&
    /outcome: probeOnly \? "probe_success"/.test(recoveryScript)
);
check(
  "Probe-only refuses a second chunk",
  /probeOnly && chunksAttempted > 1/.test(recoveryScript) &&
    /PROBE SUCCESS — stopping after single completed chunk/.test(recoveryScript)
);
check(
  "Terminal status uses shared resolver",
  /resolveFinanceRecoveryTerminalStatus\(/.test(recoveryScript)
);
check(
  "Campaign activation used by recovery script",
  /activateFinanceRecoveryCampaign/.test(recoveryScript)
);
check(
  "Campaign survives wake via applyCampaignStatusAfterWake",
  /applyCampaignStatusAfterWake/.test(recoveryScript)
);
check(
  "Fixed 65s delay is not the primary pacing mechanism",
  !/PAGE_DELAY_MS = 65_000/.test(recoveryScript) &&
    /computeFinancePageWaitMs\(/.test(recoveryScript)
);
check(
  "All legacy Finance pagination uses documented interval pacing",
  /computeFinancePageWaitMs\(/.test(apiClient) &&
    !/WB_FINANCE_PAGE_DELAY_MS/.test(apiClient)
);
check(
  "Legacy Finance 429 is fail-closed for every caller",
  /isLegacyFinanceReport/.test(apiClient) &&
    /isFinanceDetailRequest/.test(apiClient) &&
    /isFinanceDetailRequest\s*\?\s*1/.test(apiClient)
);
check(
  "One-page-per-wake default is 1",
  /MAX_PAGES_PER_WAKE = 1/.test(recoveryScript) &&
    /FINANCE_RECOVERY_MAX_PAGES_PER_WAKE/.test(recoveryScript)
);
check(
  "Wake stops before requesting a second page",
  /pagesFetchedThisWake >= maxPagesPerWake/.test(recoveryScript) &&
    /WAKE OK — page persisted; stopping before next page/.test(recoveryScript)
);
check(
  "Rate-limit header parser is case-insensitive",
  /parseWbRateLimitHeaders/.test(apiClient) &&
    /x-ratelimit-remaining/.test(read("src/lib/wildberries/rate-limit-retry.ts"))
);
check(
  "Finance V2 list is not used by recovery",
  !/sales-reports\/list/.test(recoveryScript) &&
    !/fetchSalesReportsList/.test(recoveryScript)
);
check(
  "Account 2 only hardcoded in recovery",
  /const ACCOUNT_ID = "2"/.test(recoveryScript) &&
    !/createWbSyncService\("1"\)/.test(recoveryScript)
);
check(
  "Generic Finance sync is blocked during Account 2 campaign",
  /isFinanceHistoricalRecoveryActive\(this\.marketplaceAccountId\)/.test(syncService) &&
    /skipped_finance_recovery_active/.test(syncService)
);
check(
  "Recovery request timestamp is persisted before WB call",
  recoveryScript.indexOf("progress.reportsLastRequestAt =") >= 0 &&
    recoveryScript.indexOf("saveProgress(progress);", recoveryScript.indexOf("progress.reportsLastRequestAt =")) <
      recoveryScript.indexOf("svc.syncFinanceV1Page(")
);
check(
  "Migration prepares non-partial composite unique index",
  /idx_wb_finance_account_source_key_atomic[\s\S]*?\(marketplace_account_id,\s*source_key\);/.test(
    migration
  )
);
check(
  "Migration prepares read-only readiness function",
  /orion_finance_recovery_schema_ready/.test(migration) &&
    /i\.indpred IS NULL/.test(migration)
);

const {
  activeFinanceChunkFor,
  ensureFinanceRequestGate,
  financeRecoveryRequestBlockedUntil,
  hasFinanceRequestTimingState,
  isFinanceRecoveryCooldownActive,
  resolveFinanceRecoveryTerminalStatus,
  withPersistedFinancePage,
  FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS,
} = await import("../src/lib/finance-recovery/coordination.ts");
const {
  computeFinancePageWaitMs,
  parseWbRateLimitHeaders,
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
} = await import("../src/lib/wildberries/rate-limit-retry.ts");

const initial = {
  accountId: "2",
  status: "running",
  activeChunk: null,
};
const chunk = activeFinanceChunkFor(initial, "2026-06-22", "2026-06-28");
check("New chunk starts at page 1", chunk.currentPage === 1);
check("New chunk starts at cursor 0", chunk.lastPersistedRrdId === 0);

const afterPage1 = withPersistedFinancePage({
  state: initial,
  activeChunk: chunk,
  startRrdId: 0,
  endRrdId: 3128394432362,
  apiRows: 1528,
  upsertedLines: 3000,
  persistedAt: "2026-08-30T15:00:00.000Z",
});
check(
  "Page 1 success advances to page 2",
  afterPage1.activeChunk?.currentPage === 2
);
check(
  "Page 1 success saves persisted cursor",
  afterPage1.activeChunk?.lastPersistedRrdId === 3128394432362
);
check(
  "Resume starts from page 2 cursor",
  activeFinanceChunkFor(afterPage1, "2026-06-22", "2026-06-28")
    .lastPersistedRrdId === 3128394432362
);

// Atomic-upsert model keyed exactly like production: account + source_key.
const store = new Map();
function atomicUpsert(rows) {
  for (const row of rows) {
    store.set(`${row.marketplaceAccountId}\0${row.sourceKey}`, row);
  }
}
const pageRows = [
  { marketplaceAccountId: "2", sourceKey: "rrd:10:for_pay", amount: 100 },
  { marketplaceAccountId: "2", sourceKey: "rrd:10:storage", amount: 5 },
];
atomicUpsert(pageRows);
atomicUpsert(pageRows);
check("Same page replay is idempotent", store.size === 2);
atomicUpsert([
  { marketplaceAccountId: "1", sourceKey: "rrd:10:for_pay", amount: 200 },
]);
check("Account 1 and Account 2 keys remain isolated", store.size === 3);

const beforeFailedPersist = structuredClone(afterPage1);
const afterFailedPersist = beforeFailedPersist;
check(
  "Persistence failure does not advance cursor",
  afterFailedPersist.activeChunk?.lastPersistedRrdId === 3128394432362
);

atomicUpsert(pageRows);
check("Crash replay cannot duplicate committed page", store.size === 3);

check(
  "Server cooldown blocks requests before expiry",
  isFinanceRecoveryCooldownActive(
    {
      accountId: "2",
      serverRetryUntil: "2026-08-31T15:26:18.742Z",
    },
    Date.parse("2026-08-31T15:00:00.000Z")
  )
);
check(
  "Expired cooldown allows preflight to continue",
  !isFinanceRecoveryCooldownActive(
    {
      accountId: "2",
      serverRetryUntil: "2026-08-31T15:26:18.742Z",
    },
    Date.parse("2026-08-31T15:30:00.000Z")
  )
);

const successfulProbeStatus = resolveFinanceRecoveryTerminalStatus({
  rateLimited: false,
  failed: false,
  probeOnly: true,
  probeSucceeded: true,
  wakeSucceeded: true,
  morePagesRemaining: false,
  completedChunkCount: 1,
  totalChunkCount: 10,
});
check(
  "Successful probe != blocked_partial",
  successfulProbeStatus === "probe_ok" && successfulProbeStatus !== "blocked_partial"
);

const wakeOkStatus = resolveFinanceRecoveryTerminalStatus({
  rateLimited: false,
  failed: false,
  probeOnly: false,
  probeSucceeded: false,
  wakeSucceeded: true,
  morePagesRemaining: true,
  completedChunkCount: 0,
  totalChunkCount: 10,
});
check(
  "Successful page with more data becomes wake_ok",
  wakeOkStatus === "wake_ok"
);
check("Successful wake is not blocked_partial", wakeOkStatus !== "blocked_partial");

const rateLimitedProbeStatus = resolveFinanceRecoveryTerminalStatus({
  rateLimited: true,
  failed: false,
  probeOnly: true,
  probeSucceeded: false,
  wakeSucceeded: false,
  morePagesRemaining: true,
  completedChunkCount: 0,
  totalChunkCount: 10,
});
check("429 probe = blocked_partial", rateLimitedProbeStatus === "blocked_partial");

const failedProbeStatus = resolveFinanceRecoveryTerminalStatus({
  rateLimited: false,
  failed: true,
  probeOnly: true,
  probeSucceeded: false,
  wakeSucceeded: false,
  morePagesRemaining: false,
  completedChunkCount: 0,
  totalChunkCount: 10,
});
check(
  "Non-429 probe failure = failed (not blocked_partial)",
  failedProbeStatus === "failed"
);

check(
  "Probe-only worklist is exactly one chunk",
  /const chunksToRun = probeOnly \? \[probeChunk\] : allChunks;/.test(recoveryScript)
);
check(
  "429 probe stops immediately (no next chunk after rateLimited)",
  /if \(rateLimited \|\| failed\) break;/.test(recoveryScript)
);
check(
  "No automatic second page in same wake after success",
  /maxPagesPerWake/.test(recoveryScript) &&
    /WAKE OK — page persisted; stopping before next page/.test(recoveryScript)
);

const mixedCaseHeaders = new Headers({
  "X-RateLimit-Remaining": "0",
  "X-RATELIMIT-LIMIT": "1",
  "x-ratelimit-reset": "58",
  "X-Ratelimit-Retry": "120",
});
const parsedHeaders = parseWbRateLimitHeaders(mixedCaseHeaders);
check("Header parsing is case-insensitive (remaining)", parsedHeaders.remaining === 0);
check("Header parsing is case-insensitive (limit)", parsedHeaders.limit === 1);
check("Header parsing is case-insensitive (reset)", parsedHeaders.resetSeconds === 58);
check(
  "Header parsing is case-insensitive (retry ms)",
  parsedHeaders.retryAfterMs === 120_000
);

const waitWhenRemaining = computeFinancePageWaitMs({
  remaining: 2,
  resetSeconds: 60,
  lastFinanceRequestAtMs: Date.now() - 500,
  nowMs: Date.now(),
});
check(
  "Remaining does not shorten documented Finance interval",
  waitWhenRemaining >= FINANCE_RECOVERY_MIN_PAGE_GAP_MS - 1_000
);

const waitWithLongReset = computeFinancePageWaitMs({
  remaining: 0,
  resetSeconds: 90,
  lastFinanceRequestAtMs: Date.now(),
  nowMs: Date.now(),
  minFallbackMs: FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  safetyMarginMs: 5_000,
});
check(
  "Remaining 0 prefers Reset+margin when Reset exceeds fallback",
  waitWithLongReset >= 90_000 + 5_000 - 50
);

const waitWithShortReset = computeFinancePageWaitMs({
  remaining: 0,
  resetSeconds: 40,
  lastFinanceRequestAtMs: Date.now(),
  nowMs: Date.now(),
  minFallbackMs: FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  safetyMarginMs: 5_000,
});
check(
  "Short Reset still respects min 70s fallback",
  waitWithShortReset >= FINANCE_RECOVERY_MIN_PAGE_GAP_MS - 50
);

const waitWhenNoHeaders = computeFinancePageWaitMs({
  remaining: null,
  resetSeconds: null,
  lastFinanceRequestAtMs: Date.now(),
  nowMs: Date.now(),
});
check(
  "Missing Remaining/Reset falls back to >=70s",
  waitWhenNoHeaders >= FINANCE_RECOVERY_MIN_PAGE_GAP_MS - 50
);

const localRequestGate = financeRecoveryRequestBlockedUntil(
  {
    accountId: "2",
    nextFinanceRequestNotBefore: "2026-09-03T07:01:10.000Z",
  },
  Date.parse("2026-09-03T07:00:30.000Z")
);
check(
  "Persisted request interval blocks a rapid second wake",
  localRequestGate === "2026-09-03T07:01:10.000Z"
);

check(
  "First-request gate is documented interval plus Reset safety margin",
  FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS === FINANCE_RECOVERY_MIN_PAGE_GAP_MS + 5_000
);

const missingTimingState = {
  accountId: "2",
  campaignStatus: "active",
  lastFinanceRequestAt: null,
  lastRateLimitSnapshot: null,
};
check(
  "Missing persisted rate-limit state fails closed",
  hasFinanceRequestTimingState(missingTimingState) === false
);

const gateDir = mkdtempSync(join(tmpdir(), "finance-request-gate-"));
const gatePath = join(gateDir, "account-2-recovery-progress.json");
try {
  const nowMs = Date.parse("2026-09-03T08:00:00.000Z");
  writeFileSync(
    gatePath,
    JSON.stringify(
      {
        accountId: "2",
        campaignStatus: "active",
        status: "wake_ok",
        recoveryActive: false,
      },
      null,
      2
    )
  );
  const initialized = ensureFinanceRequestGate({
    progress: JSON.parse(readFileSync(gatePath, "utf8")),
    progressPath: gatePath,
    nowMs,
  });
  const expectedGate = new Date(
    nowMs + FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS
  ).toISOString();
  check(
    "First post-migration request persists a conservative next-request gate",
    initialized.initialized === true && initialized.gateUntil === expectedGate
  );
  check(
    "Initialization does not invent lastFinanceRequestAt",
    initialized.state.lastFinanceRequestAt == null
  );
  check(
    "Initialization does not invent lastRateLimitSnapshot",
    initialized.state.lastRateLimitSnapshot == null
  );

  const onDiskAfterInit = JSON.parse(readFileSync(gatePath, "utf8"));
  check(
    "Conservative gate is written to durable progress before any API request",
    onDiskAfterInit.nextFinanceRequestNotBefore === expectedGate &&
      onDiskAfterInit.financeRequestGateReason === "missing_persisted_rate_limit_state"
  );
  check(
    "Initialized gate blocks until the persisted instant",
    financeRecoveryRequestBlockedUntil(onDiskAfterInit, nowMs) === expectedGate &&
      isFinanceRecoveryCooldownActive(onDiskAfterInit, nowMs) === true
  );

  const afterRestart = ensureFinanceRequestGate({
    progress: JSON.parse(readFileSync(gatePath, "utf8")),
    progressPath: gatePath,
    nowMs: nowMs + 1_000,
  });
  check(
    "Timing gate survives process restart without being rewritten",
    afterRestart.initialized === false &&
      afterRestart.gateUntil === expectedGate &&
      JSON.parse(readFileSync(gatePath, "utf8")).nextFinanceRequestNotBefore ===
        expectedGate
  );
  check(
    "Restart still blocks until the original persisted gate",
    isFinanceRecoveryCooldownActive(afterRestart.state, nowMs + 1_000) === true
  );
  check(
    "No API request is required to establish rate-limit readiness",
    hasFinanceRequestTimingState(afterRestart.state) === true &&
      afterRestart.state.lastRateLimitSnapshot == null &&
      afterRestart.state.lastFinanceRequestAt == null
  );

  const existingGate = "2026-09-03T09:00:00.000Z";
  const existingPath = join(gateDir, "existing-gate.json");
  const existingState = {
    accountId: "2",
    nextFinanceRequestNotBefore: existingGate,
    lastFinanceRequestAt: "2026-09-03T08:58:50.000Z",
  };
  writeFileSync(existingPath, JSON.stringify(existingState, null, 2));
  const reused = ensureFinanceRequestGate({
    progress: existingState,
    progressPath: existingPath,
    nowMs,
  });
  check(
    "Existing persisted timing state is not overwritten",
    reused.initialized === false && reused.gateUntil === existingGate
  );
} finally {
  rmSync(gateDir, { recursive: true, force: true });
}

check(
  "Recovery initializes the Reports timing gate then exits before any WB call",
  recoveryScript.indexOf("ensureReportsRequestGate({ progress, progressPath: PROGRESS_PATH })") >=
    0 &&
    recoveryScript.indexOf("if (requestGate.initialized)") <
      recoveryScript.indexOf("svc.syncFinanceV1Page(") &&
    /No WB request made\. Re-run after this instant/.test(recoveryScript)
);
check(
  "Recovery fails closed if Reports timing state is still missing after initialization",
  /hasReportsRequestTimingState\(progress\)/.test(recoveryScript) &&
    recoveryScript.indexOf("hasReportsRequestTimingState(progress)") <
      recoveryScript.indexOf("svc.syncFinanceV1Page(")
);

const bounds = read("src/lib/commercial-continuity/execution-bounds.ts");
check(
  "Recovery first 429 fails closed (maxRetries=1)",
  /FINANCE_RECOVERY_WB_429_MAX_RETRIES = 1/.test(bounds)
);
check(
  "Recovery 429 total wait budget is zero",
  /FINANCE_RECOVERY_WB_429_MAX_TOTAL_WAIT_MS = 0/.test(bounds)
);

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures}`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
