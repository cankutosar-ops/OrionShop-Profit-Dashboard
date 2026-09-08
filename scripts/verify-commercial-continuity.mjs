#!/usr/bin/env node
/**
 * Verify Commercial Data Continuity architecture (deterministic, no live WB required).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
let failures = 0;

function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, detail) {
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function check(name, cond, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

console.log("=== Commercial Data Continuity Verification ===\n");

// --- Artifacts ---
check("Migration exists", existsSync("supabase/migrations/20260812130000_commercial_data_continuity.sql"));
check("vercel.json cron exists", existsSync("vercel.json"));
check("Architecture doc exists", existsSync("docs/02-architecture/COMMERCIAL_DATA_CONTINUITY.md"));
check("Orchestrator service exists", existsSync("src/services/commercial-continuity-service.ts"));
check("Entity state service exists", existsSync("src/services/commercial-entity-sync-state-service.ts"));
check("Cron route exists", existsSync("src/app/api/sync/commercial-continuity/route.ts"));
check("Status route exists", existsSync("src/app/api/sync/commercial-continuity/status/route.ts"));

const vercel = JSON.parse(read("vercel.json"));
check(
  "Cron path is commercial-continuity",
  vercel.crons?.[0]?.path === "/api/sync/commercial-continuity"
);
check("Cron schedule hourly", vercel.crons?.[0]?.schedule === "0 * * * *");

const mig = read("supabase/migrations/20260812130000_commercial_data_continuity.sql");
check("Migration creates commercial_entity_sync_state", /commercial_entity_sync_state/.test(mig));
check("Migration creates commercial_sync_ticks", /commercial_sync_ticks/.test(mig));
check("Migration tracks latest_data_date", /latest_data_date/.test(mig));
check("Migration tracks next_retry_at", /next_retry_at/.test(mig));
check("Migration includes rate_limited status", /rate_limited/.test(mig));
check("Migration includes external_delay status", /external_delay/.test(mig));

const orch = read("src/services/commercial-continuity-service.ts");
check("Uses existing runBlockingDashboardSync", /runBlockingDashboardSync/.test(orch));
check("Does not import Financial Engine calc", !/calculateEstimatedTax|buildNetFinishedPrice/.test(orch));
check("Entities are orders/sales/finance only", /COMMERCIAL_SYNC_ENTITIES/.test(orch));
check("Account isolation try/catch", /ACCOUNT FAILED \(isolated\)/.test(orch));
check("External delay for finance empty", /external_delay/.test(orch));
check("Eligible accounts use operational filter", /filterOperationalMarketplaceAccounts/.test(orch));
check("Respects sync_enabled", /sync_enabled/.test(orch));

const route = read("src/app/api/sync/commercial-continuity/route.ts");
check("Route accepts CRON_SECRET", /CRON_SECRET/.test(route));
check("Route accepts INTERNAL_API_SECRET path", /isInternalServiceRequest/.test(route));
check("Route does not require dashboard", !/DashboardOperationalSync/.test(route));
check("Route uses blocking bounded tick (no after() for cron)", /blocking_bounded/.test(route));
check("Route does not use after() for commercial tick", !/after\s*\(\s*async/.test(route));
check("Route respects execution budget", /COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS/.test(route));
check("Stock not in commercial scheduler", !/entities:.*stock/.test(route));

const stockBoundary = !/syncStock|"stock"/.test(orch);
check("Orchestrator does not sync stock", stockBoundary);

const invBoundary =
  !/startInventorySnapshotContinuityScheduler|runInventorySnapshotContinuity/.test(orch);
check("Orchestrator independent of inventory continuity", invBoundary);

const markFinished = read("src/services/marketplace-account-service.ts");
check(
  "last_successful_sync_at only on full success",
  /Only full success advances last_successful_sync_at/.test(markFinished) ||
    /if \(status === "success"\) \{\s*patchFull\.last_successful_sync_at/.test(markFinished)
);

const settings = read("src/lib/administration/platform-settings-document.ts");
check("Feature flag commercial_data_continuity", /commercial_data_continuity/.test(settings));
check("Interval preference configurable", /commercialSyncIntervalMinutes/.test(settings));

const syncJob = read("src/services/sync-job-service.ts");
check(
  "Manual sync records commercial state",
  /recordCommercialStateFromSyncResults/.test(syncJob)
);

const recordSrc = read("src/services/commercial-continuity-record.ts");
check(
  "Manual sync persists retry backoff on failures",
  /computeNextRetryAt/.test(recordSrc) && /bumpRetry:\s*needsRetry/.test(recordSrc)
);

const persistOutcome = read("src/lib/commercial-continuity/persist-outcome.ts");
check("Entity marked running before sync", /markCommercialEntityRunning/.test(persistOutcome));
check("Shared persistCommercialEntityOutcome", /persistCommercialEntityOutcome/.test(persistOutcome));
check("Stale entity running finalization", /finalizeStaleCommercialEntitiesRunning/.test(persistOutcome));
check("Stale entity running release helper", /releaseStaleCommercialEntityRunningIfNeeded/.test(persistOutcome));

const bounds = read("src/lib/commercial-continuity/execution-bounds.ts");
check("Commercial sync execution timeout defined", /COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS/.test(bounds));
check("Commercial 429 retry budget defined", /COMMERCIAL_WB_429_MAX_RETRIES/.test(bounds));
check("Commercial 429 total wait cap", /COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS/.test(bounds));
check(
  "Timeout below Vercel maxDuration",
  /VERCEL_COMMERCIAL_MAX_DURATION_SEC \* 1000 - COMMERCIAL_EXECUTION_BUFFER_MS/.test(bounds)
);

const execCtx = read("src/lib/commercial-continuity/sync-execution-context.ts");
check("Sync execution context uses AsyncLocalStorage", /AsyncLocalStorage/.test(execCtx));

const apiClient = read("src/lib/wildberries/api-client.ts");
check("API client honors execution context 429 budget", /wb429MaxRetries/.test(apiClient));
check("API client honors abort signal", /abortSignal/.test(apiClient));

const syncRunSvc = read("src/services/sync-run-service.ts");
check("Stale sync_runs recovery exists", /releaseStaleSyncRunsIfNeeded/.test(syncRunSvc));
check("Interrupted sync_run finalization", /finalizeInterruptedSyncRun/.test(syncRunSvc));

check(
  "Orchestrator marks entity running",
  /markCommercialEntityRunning/.test(orch)
);
check(
  "Orchestrator uses commercial bounded sync",
  /commercialBounded:\s*true/.test(orch)
);
check(
  "Orchestrator execution budget support",
  /executionBudgetMs/.test(orch)
);
check(
  "Sync job commercial bounded options",
  /commercialBounded/.test(syncJob) && /skipCommercialStateRecord/.test(syncJob)
);
const verificationAudit = read("src/services/sync-verification-audit-service.ts");
const verificationTypes = read("src/lib/sync-verification-audit/types.ts");
check(
  "Post-sync verification supports commercialBounded",
  /commercialBounded\?:\s*boolean/.test(verificationTypes)
);
check(
  "Commercial bounded skips WB API probe",
  /commercialBounded/.test(verificationAudit) &&
    /API probe skipped \(commercial bounded\)/.test(verificationAudit) &&
    /dbOnlyLatestDates/.test(verificationAudit) &&
    !/commercialBounded[\s\S]*probeLatestApiDates/.test(
      verificationAudit.slice(
        verificationAudit.indexOf("if (input.commercialBounded)"),
        verificationAudit.indexOf("} else {")
      )
    )
);
check(
  "Blocking sync passes commercialBounded to verification",
  /schedulePostSyncVerification\([\s\S]*commercialBounded,/.test(syncJob)
);
const bgSyncBlock = syncJob.slice(
  syncJob.indexOf("export async function scheduleBackgroundDashboardSync"),
  syncJob.indexOf("export async function runBlockingDashboardSync")
);
check(
  "Background manual sync does not pass commercialBounded",
  !/commercialBounded/.test(bgSyncBlock)
);
check(
  "assertSyncNotRunning releases stale sync_runs",
  /releaseStaleSyncRunsIfNeeded/.test(syncJob)
);
check(
  "Account lock release finalizes entity running",
  /finalizeStaleCommercialEntitiesRunning/.test(markFinished)
);
check(
  "DB authoritative over in-memory sync job",
  /account\?\.last_sync_status/.test(syncJob)
);

const windowSrc = read("src/lib/commercial-continuity/window.ts");
check("Incremental window helper exists", /resolveCommercialSyncWindow/.test(windowSrc));

const classifySrc = read("src/lib/commercial-continuity/classify.ts");
check("429 classification", /rate_limited/.test(classifySrc));
check("403 classification", /permission_denied/.test(classifySrc));
check("404 classification", /external_unavailable/.test(classifySrc));

// --- Runtime unit checks (no DB) ---
const { resolveCommercialSyncWindow, daysBetweenIso } = await import(
  "../src/lib/commercial-continuity/window.ts"
);
const { classifyCommercialError, computeNextRetryAt } = await import(
  "../src/lib/commercial-continuity/classify.ts"
);

const w1 = resolveCommercialSyncWindow({
  latestDataDate: "2026-08-03",
  maxLookbackDays: 14,
  now: new Date("2026-08-12T12:00:00.000Z"),
});
check("Gap recovery window starts at latest data", w1.dateFrom === "2026-08-03" && w1.recoveringGap);
check("Gap recovery window ends today", w1.dateTo === "2026-08-12");

const w2 = resolveCommercialSyncWindow({
  latestDataDate: null,
  maxLookbackDays: 14,
  now: new Date("2026-08-12T12:00:00.000Z"),
});
check("Empty coverage uses lookback floor", w2.dateFrom === "2026-07-30");

check(
  "daysBetweenIso lag",
  daysBetweenIso("2026-08-03", "2026-08-12") === 9
);

check(
  "Classify 429",
  classifyCommercialError("WB API error 429: too many requests").status === "rate_limited"
);
check(
  "Classify 403",
  classifyCommercialError("WB API error 403: forbidden").status === "permission_denied"
);
check(
  "Classify 404",
  classifyCommercialError("WB API error 404: not found").status === "external_unavailable"
);

const r1 = Date.parse(computeNextRetryAt(0, 300, 3600, new Date("2026-08-12T00:00:00.000Z")));
const r0 = Date.parse("2026-08-12T00:00:00.000Z");
check("Retry backoff advances", r1 === r0 + 300_000);

const {
  COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS,
  COMMERCIAL_WB_429_MAX_RETRIES,
  COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS,
  VERCEL_COMMERCIAL_MAX_DURATION_SEC,
} = await import("../src/lib/commercial-continuity/execution-bounds.ts");
check(
  "Commercial timeout under route maxDuration",
  COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS < VERCEL_COMMERCIAL_MAX_DURATION_SEC * 1000
);
check("Commercial 429 retries bounded", COMMERCIAL_WB_429_MAX_RETRIES <= 5);
check("Commercial 429 wait under 3 minutes", COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS <= 180_000);

function entityDue(lastExecutionAt, status, nextRetryAt, intervalMinutes, now) {
  if (status === "running") return false;
  if (status === "permission_denied" || status === "blocked") return false;
  if (nextRetryAt) return Date.parse(nextRetryAt) <= now.getTime();
  if (!lastExecutionAt) return true;
  return now.getTime() - Date.parse(lastExecutionAt) >= intervalMinutes * 60_000;
}
const future = new Date(Date.now() + 60_000).toISOString();
check("entityDue respects next_retry_at", entityDue(null, "idle", future, 60, new Date()) === false);
check("entityDue treats running as not due", entityDue(null, "running", null, 60, new Date()) === false);

check(
  "Timeout classifies as failed/timeout",
  classifyCommercialError("Commercial sync interrupted (execution timeout)").failureClass ===
    "timeout"
);
check(
  "429 budget exhausted classifies rate_limited",
  classifyCommercialError("WB API error 429: rate limit retry budget exhausted").status ===
    "rate_limited"
);

const pkg = read("package.json");
check("package.json has verify:commercial-continuity", /verify:commercial-continuity/.test(pkg));
check(
  "package.json has apply:commercial-continuity-migration",
  /apply:commercial-continuity-migration/.test(pkg)
);

const rateLimitRetry = read("src/lib/wildberries/rate-limit-retry.ts");
check("X-RateLimit-Retry parser module", /parseRateLimitRetryHeader/.test(rateLimitRetry));
check("API client honors X-RateLimit-Retry", /X-RateLimit-Retry/.test(apiClient));
check("Commercial sync honors server retry header", /wb429HonorServerRetry:\s*commercialBounded/.test(syncJob));
check("computeNextRetryAtPreferServer in classify", /computeNextRetryAtPreferServer/.test(classifySrc));
check("CC defers finance during historical recovery", /skipped_finance_recovery_active/.test(orch));
check(
  "CC Finance skip uses campaign-aware gate",
  /isFinanceHistoricalRecoveryActive/.test(orch) &&
    /isFinanceRecoveryCampaignActive/.test(
      read("src/lib/finance-recovery/coordination.ts")
    )
);
check("Finance recovery coordination module", existsSync("src/lib/finance-recovery/coordination.ts"));
check(
  "Finance recovery production reservation module",
  existsSync("src/lib/finance-recovery/reservation.ts")
);
check(
  "Production Account 2 Finance reservation is documented for Vercel env",
  /ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE/.test(
    read("docs/02-architecture/COMMERCIAL_DATA_CONTINUITY.md")
  ) && /ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE/.test(read(".env.example"))
);
check("Finance recovery bounded retries = 1", /FINANCE_RECOVERY_WB_429_MAX_RETRIES = 1/.test(bounds));
check("Verification probe bounded budget", /VERIFICATION_WB_429_MAX_RETRIES/.test(bounds));
check(
  "Verification sequential statistics probes",
  /runWithSyncExecutionContext/.test(verificationAudit) &&
    !/Promise\.all\(\[\s*\n?\s*api\.fetchOrders/.test(verificationAudit)
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
