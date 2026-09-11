#!/usr/bin/env node
/**
 * Deterministic Account 2 Finance recovery campaign isolation tests.
 * Uses temporary progress files only — no production DB, no Wildberries.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const {
  activateFinanceRecoveryCampaign,
  abortFinanceRecoveryCampaign,
  applyCampaignStatusAfterWake,
  acquireFinanceRecoveryCoordination,
  isFinanceRecoveryCampaignActive,
  isFinanceHistoricalRecoveryActive,
  normalizeFinanceRecoveryCampaignStatus,
  releaseFinanceRecoveryCoordination,
  resolveFinanceRecoveryTerminalStatus,
} = await import("../src/lib/finance-recovery/coordination.ts");
const {
  assertFinanceRecoveryOwnsQuota,
  isDeployedFinanceRuntime,
  resolveFinanceRecoveryReservation,
} = await import("../src/lib/finance-recovery/reservation.ts");

const dir = mkdtempSync(join(tmpdir(), "finance-campaign-"));
const progressPath = join(dir, "account-2-recovery-progress.json");
const account1Path = join(dir, "account-1-dummy.json");
const missingPath = join(dir, "missing.json");

// Deterministic baseline: the operator's shell may already export the reservation.
const inheritedEnvReservation =
  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
const inheritedVercel = process.env.VERCEL;
delete process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
delete process.env.VERCEL;

function writeState(path, state) {
  writeFileSync(path, JSON.stringify(state, null, 2));
}

try {
  const priorEnvReservation =
    process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "true";
  check(
    "Deployed Account 2 env reservation suppresses Finance without local file",
    isFinanceRecoveryCampaignActive("2", join(dir, "missing.json"))
  );
  check(
    "Deployed Account 2 env reservation does not suppress Account 1",
    !isFinanceRecoveryCampaignActive("1", join(dir, "missing.json"))
  );
  check(
    "Recovery owns the quota when the deployed reservation is set",
    assertFinanceRecoveryOwnsQuota("2", missingPath).ok === true
  );

  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "false";
  check(
    "Explicit production release stops suppressing Account 2 Finance",
    isFinanceRecoveryCampaignActive("2", missingPath) === false
  );
  check(
    "Recovery refuses to run while production still allows competing callers",
    assertFinanceRecoveryOwnsQuota("2", missingPath).ok === false
  );

  if (priorEnvReservation == null) {
    delete process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
  } else {
    process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE =
      priorEnvReservation;
  }

  // Undeterminable reservation (deployed instance with no env, no local file).
  const ambiguous = resolveFinanceRecoveryReservation("2", missingPath);
  check(
    "Undeterminable Account 2 reservation fails closed",
    ambiguous.reserved === true && ambiguous.source === "fail_closed"
  );
  check(
    "Undeterminable reservation suppresses every non-recovery Finance caller",
    isFinanceHistoricalRecoveryActive("2", missingPath) === true
  );
  check(
    "Undeterminable reservation still leaves Account 1 Finance available",
    isFinanceHistoricalRecoveryActive("1", missingPath) === false
  );
  check(
    "Recovery fails closed when it cannot prove production ownership",
    assertFinanceRecoveryOwnsQuota("2", missingPath).ok === false
  );

  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "maybe";
  const garbageEnv = resolveFinanceRecoveryReservation("2", missingPath);
  check(
    "Ambiguous production reservation env fails closed",
    garbageEnv.reserved === true &&
      garbageEnv.source === "fail_closed" &&
      assertFinanceRecoveryOwnsQuota("2", missingPath).ok === false
  );
  delete process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;

  writeState(progressPath, {
    accountId: "2",
    campaignStatus: "inactive",
    recoveryActive: false,
  });
  process.env.VERCEL = "1";
  const vercelIgnoresLocalInactive = resolveFinanceRecoveryReservation("2", progressPath);
  check(
    "Deployed runtime ignores local inactive campaign and fails closed",
    vercelIgnoresLocalInactive.reserved === true &&
      vercelIgnoresLocalInactive.source === "fail_closed" &&
      isDeployedFinanceRuntime() === true
  );
  writeState(progressPath, {
    accountId: "2",
    campaignStatus: "active",
    recoveryActive: false,
  });
  const vercelIgnoresLocalActive = resolveFinanceRecoveryReservation("2", progressPath);
  check(
    "Deployed runtime does not treat a local campaign file as production ownership",
    vercelIgnoresLocalActive.source === "fail_closed" &&
      assertFinanceRecoveryOwnsQuota("2", progressPath).ok === false
  );
  check(
    "Deployed fail-closed reservation still leaves Account 1 Finance available",
    isFinanceHistoricalRecoveryActive("1", progressPath) === false
  );
  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "true";
  check(
    "Deployed env=true reserves Account 2 competing Finance paths",
    isFinanceHistoricalRecoveryActive("2", progressPath) === true &&
      assertFinanceRecoveryOwnsQuota("2", progressPath).ok === true
  );
  check(
    "Deployed env=true does not reserve Account 1",
    isFinanceHistoricalRecoveryActive("1", progressPath) === false
  );
  delete process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
  delete process.env.VERCEL;
  writeState(progressPath, {
    accountId: "2",
    status: "blocked_partial",
    recoveryActive: false,
    campaignStatus: "inactive",
    activeChunk: {
      key: "2026-06-22:2026-06-28",
      chunkFrom: "2026-06-22",
      chunkTo: "2026-06-28",
      status: "blocked_partial",
      currentPage: 2,
      lastPersistedRrdId: 3128394432362,
      completedPages: [{ page: 1, startRrdId: 0, endRrdId: 3128394432362, apiRows: 1528, upsertedLines: 2839, persistedAt: "2026-08-31T16:19:21.940Z" }],
    },
    serverRetryUntil: "2026-09-02T16:19:17.416Z",
  });

  check(
    "Campaign inactive initially does not suppress CC",
    !isFinanceHistoricalRecoveryActive("2", progressPath)
  );

  const activated = activateFinanceRecoveryCampaign({
    marketplaceAccountId: "2",
    progress: JSON.parse(readFileSync(progressPath, "utf8")),
    progressPath,
  });
  check("Activate sets campaign ACTIVE", activated.campaignStatus === "active");
  check(
    "Campaign ACTIVE persists on disk after activate",
    JSON.parse(readFileSync(progressPath, "utf8")).campaignStatus === "active"
  );
  check(
    "Campaign ACTIVE suppresses Account 2 Finance in CC gate",
    isFinanceHistoricalRecoveryActive("2", progressPath) === true
  );
  check(
    "Campaign ACTIVE does not suppress Account 1",
    isFinanceHistoricalRecoveryActive("1", progressPath) === false
  );
  check(
    "Local-only campaign is never treated as production ownership",
    resolveFinanceRecoveryReservation("2", progressPath)
      .productionAuthoritative === false &&
      assertFinanceRecoveryOwnsQuota("2", progressPath).ok === false
  );

  // Simulate wake exit: recoveryActive cleared, campaign remains ACTIVE.
  releaseFinanceRecoveryCoordination({
    marketplaceAccountId: "2",
    progressPath,
    progress: {
      ...JSON.parse(readFileSync(progressPath, "utf8")),
      campaignStatus: "active",
      status: "wake_ok",
      recoveryActive: true,
      lockPid: 12345,
    },
    finalStatus: "wake_ok",
  });
  const afterWake = JSON.parse(readFileSync(progressPath, "utf8"));
  check("Wake exit clears recoveryActive", afterWake.recoveryActive === false);
  check("Wake exit keeps campaign ACTIVE", afterWake.campaignStatus === "active");
  check(
    "Campaign ACTIVE survives successful wake_ok",
    isFinanceRecoveryCampaignActive("2", progressPath)
  );

  const after429 = applyCampaignStatusAfterWake({
    progress: {
      ...afterWake,
      status: "blocked_partial",
      serverRetryUntil: "2026-09-02T16:19:17.416Z",
    },
    terminalStatus: "blocked_partial",
    completedChunkCount: 0,
    totalChunkCount: 10,
  });
  check("429 keeps campaign ACTIVE", after429.campaignStatus === "active");
  writeState(progressPath, { ...after429, recoveryActive: false });
  check(
    "blocked_partial + campaign ACTIVE still suppresses Account 2 Finance",
    isFinanceHistoricalRecoveryActive("2", progressPath)
  );

  const wakeOkTerminal = resolveFinanceRecoveryTerminalStatus({
    rateLimited: false,
    failed: false,
    probeOnly: false,
    probeSucceeded: false,
    wakeSucceeded: true,
    morePagesRemaining: true,
    completedChunkCount: 0,
    totalChunkCount: 10,
  });
  check("Successful page with more data is wake_ok", wakeOkTerminal === "wake_ok");
  const keepActive = applyCampaignStatusAfterWake({
    progress: { accountId: "2", campaignStatus: "active", activeChunk: afterWake.activeChunk },
    terminalStatus: wakeOkTerminal,
    completedChunkCount: 0,
    totalChunkCount: 10,
  });
  check("wake_ok does not complete campaign", keepActive.campaignStatus === "active");

  const completed = applyCampaignStatusAfterWake({
    progress: {
      accountId: "2",
      campaignStatus: "active",
      activeChunk: null,
      completedChunks: { a: {}, b: {} },
    },
    terminalStatus: "completed",
    completedChunkCount: 2,
    totalChunkCount: 2,
  });
  check("Full completion sets campaign COMPLETED", completed.campaignStatus === "completed");
  writeState(progressPath, { ...completed, accountId: "2", recoveryActive: false });
  check(
    "Campaign COMPLETED re-enables Account 2 Finance for CC",
    isFinanceHistoricalRecoveryActive("2", progressPath) === false
  );

  writeState(progressPath, {
    accountId: "2",
    campaignStatus: "active",
    recoveryActive: false,
    status: "wake_ok",
  });
  const aborted = abortFinanceRecoveryCampaign({
    marketplaceAccountId: "2",
    progressPath,
    reason: "test_abort",
  });
  check("Abort sets campaign ABORTED", aborted.campaignStatus === "aborted");
  check("Abort clears wake lock", aborted.recoveryActive === false);
  check(
    "Campaign ABORTED re-enables Account 2 Finance for CC",
    isFinanceHistoricalRecoveryActive("2", progressPath) === false
  );

  // Account 1 isolation with separate dummy file should never match account 2 path.
  writeState(account1Path, { accountId: "1", campaignStatus: "active" });
  check(
    "Account 1 progress path does not affect Account 2 gate on default file",
    isFinanceHistoricalRecoveryActive("1", progressPath) === false
  );
check(
  "normalize unknown campaign → inactive",
  normalizeFinanceRecoveryCampaignStatus({ accountId: "2" }) === "inactive"
);

  // Concurrency: wake lock blocks a second recovery process; campaign ACTIVE alone does not.
  // Use a live foreign PID so the lock is not treated as stale.
  const foreignPid =
    typeof process.ppid === "number" && process.ppid > 0 && process.ppid !== process.pid
      ? process.ppid
      : null;
  if (foreignPid == null) {
    check(
      "Two recovery wakes cannot run concurrently (wake lock)",
      false,
      "no live foreign PID available for lock simulation"
    );
  } else {
    writeState(progressPath, {
      accountId: "2",
      campaignStatus: "active",
      recoveryActive: true,
      lockPid: foreignPid,
      lockStartedAt: new Date().toISOString(),
      lockUpdatedAt: new Date().toISOString(),
    });
    const blocked = acquireFinanceRecoveryCoordination({
      marketplaceAccountId: "2",
      progressPath,
      progress: {
        accountId: "2",
        campaignStatus: "active",
        recoveryActive: false,
      },
    });
    check(
      "Two recovery wakes cannot run concurrently (wake lock)",
      blocked.ok === false
    );
  }
  writeState(progressPath, {
    accountId: "2",
    campaignStatus: "active",
    recoveryActive: false,
    lockPid: null,
  });
  const allowed = acquireFinanceRecoveryCoordination({
    marketplaceAccountId: "2",
    progressPath,
    progress: {
      accountId: "2",
      campaignStatus: "active",
      status: "running",
    },
  });
  check(
    "Campaign ACTIVE with no wake lock allows a new wake",
    allowed.ok === true
  );
  const afterAcquire = JSON.parse(readFileSync(progressPath, "utf8"));
  check(
    "Acquire preserves campaign ACTIVE",
    afterAcquire.campaignStatus === "active" && afterAcquire.recoveryActive === true
  );
  releaseFinanceRecoveryCoordination({
    marketplaceAccountId: "2",
    progressPath,
    progress: afterAcquire,
    finalStatus: "wake_ok",
  });
  const afterRelease = JSON.parse(readFileSync(progressPath, "utf8"));
  check(
    "Release clears wake lock but keeps campaign (process-restart semantics)",
    afterRelease.recoveryActive === false && afterRelease.campaignStatus === "active"
  );
  check(
    "Re-read after write proves campaign survives process exit semantics",
    isFinanceRecoveryCampaignActive("2", progressPath) === true
  );

  const recoveryScript = readFileSync(
    "scripts/run-account2-finance-chunked-recovery.mjs",
    "utf8"
  );
  check(
    "Recovery activates campaign after schema preflight",
    /await assertFinanceRecoverySchemaReady\(/.test(recoveryScript) &&
      /progress = activateFinanceRecoveryCampaign\(/.test(recoveryScript) &&
      recoveryScript.indexOf("await assertFinanceRecoverySchemaReady(") <
        recoveryScript.indexOf("progress = activateFinanceRecoveryCampaign(")
  );
  check(
    "Recovery applies campaign status after wake",
    /applyCampaignStatusAfterWake\(/.test(recoveryScript)
  );
  check(
    "Cooldown gate still precedes campaign activation",
    /isReportsRecoveryCooldownActive\(progress\)/.test(recoveryScript) &&
      recoveryScript.indexOf("isReportsRecoveryCooldownActive(progress)") <
        recoveryScript.indexOf("progress = activateFinanceRecoveryCampaign(")
  );
  check(
    "maxPagesPerWake remains 1",
    /MAX_PAGES_PER_WAKE = 1/.test(recoveryScript)
  );
  check(
    "Recovery asserts production quota ownership before any lock or WB call",
    /assertFinanceRecoveryOwnsQuota\(ACCOUNT_ID, PROGRESS_PATH\)/.test(recoveryScript) &&
      recoveryScript.indexOf("assertFinanceRecoveryOwnsQuota(ACCOUNT_ID, PROGRESS_PATH)") <
        recoveryScript.indexOf("acquireFinanceRecoveryCoordination({")
  );
  check(
    "Recovery persists the timing gate before the cooldown decision",
    /ensureReportsRequestGate\(\{ progress, progressPath: PROGRESS_PATH \}\)/.test(
      recoveryScript
    ) &&
      recoveryScript.indexOf("ensureReportsRequestGate({ progress") <
        recoveryScript.indexOf("isReportsRecoveryCooldownActive(progress)")
  );
  check(
    "Finance V2 unused by recovery",
    !/sales-reports\/list/.test(recoveryScript)
  );
  check(
    "Account 2 only in recovery",
    /const ACCOUNT_ID = "2"/.test(recoveryScript)
  );
  check(
    "Activate CLI exists",
    existsSync("scripts/activate-account2-finance-recovery-campaign.mjs")
  );
  check(
    "Abort CLI exists",
    existsSync("scripts/abort-account2-finance-recovery-campaign.mjs")
  );

  const syncService = readFileSync("src/lib/wildberries/sync-service.ts", "utf8");
  const batchStart = syncService.indexOf("async function batchUpsertFinance");
  const batchEnd = syncService.indexOf("export type WbFinancePageSyncResult", batchStart);
  const batch = syncService.slice(batchStart, batchEnd);
  check("No DELETE in Finance batch upsert", !/\.delete\(/.test(batch));
  check(
    "Atomic UPSERT conflict target retained",
    /onConflict:\s*"marketplace_account_id,source_key"/.test(syncService)
  );
  check(
    "All WbSyncService Finance paths honor campaign reservation",
    /isFinanceHistoricalRecoveryActive\(this\.marketplaceAccountId\)/.test(syncService) &&
      /skipped_finance_recovery_active/.test(syncService)
  );

  const warehouseAdapter = readFileSync(
    "src/lib/marketplace-adapters/wildberries/warehouse-adapter.ts",
    "utf8"
  );
  check(
    "Warehouse Finance adapter honors campaign reservation",
    /isFinanceHistoricalRecoveryActive\(scope\.marketplaceAccountId\)/.test(
      warehouseAdapter
    ) && /skipped_finance_recovery_active/.test(warehouseAdapter)
  );

  const orch = readFileSync("src/services/commercial-continuity-service.ts", "utf8");
  check(
    "CC still skips Finance via isFinanceHistoricalRecoveryActive",
    /isFinanceHistoricalRecoveryActive/.test(orch) &&
      /skipped_finance_recovery_active/.test(orch)
  );
  check(
    "CC Finance skip is entity-scoped (finance only)",
    /if \(entity === "finance"\)/.test(orch)
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
  if (inheritedEnvReservation == null) {
    delete process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE;
  } else {
    process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = inheritedEnvReservation;
  }
  if (inheritedVercel == null) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = inheritedVercel;
  }
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures}`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
