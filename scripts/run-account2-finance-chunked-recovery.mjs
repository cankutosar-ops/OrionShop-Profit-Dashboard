#!/usr/bin/env node
/**
 * Account 2 Finance chunked recovery — Wildberries Financial Reports / Sales Reports V1.
 *
 * Authoritative transaction source:
 *   POST finance-api …/api/finance/v1/sales-reports/detailed
 *
 * List endpoint is control/reconciliation only (not called in recovery wakes).
 * Statistics v5 reportDetailByPeriod is forbidden — no Statistics v5 fallback.
 *
 * Wake: maxPagesPerWake=1 / MAX_WEEKS_PER_WAKE=1 → at most ONE HTTP page, then persist, advance cursor, exit.
 * Live HTTP requires FINANCE_V1_LIVE_REQUESTS_ENABLED=true and Personal/Service+Finance token.
 * Reports rate-limit uses reportsServerRetryUntil / reportsNextRequestNotBefore only.
 * Legacy Statistics V5 serverRetryUntil is preserved as evidence and must NOT block Reports wakes.
 *
 * Usage:
 *   npm run recover:account2-finance
 *   npm run recover:account2-finance:resume
 *   npm run probe:account2-finance
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const ACCOUNT_ID = "2";
const RANGE_FROM = "2026-06-22";
const RANGE_TO = "2026-08-28";
const CHUNK_DAYS = 7;
const PAUSE_BETWEEN_CHUNKS_MS = 1_800_000; // 30 min between fully completed chunks
const PROGRESS_PATH = resolve("exports/finance-backfill/account-2-recovery-progress.json");
/** Default: one Finance API page per process invocation. */
const MAX_PAGES_PER_WAKE = 1;
/** Exactly one weekly period may be worked per wake (never auto-advance weeks). */
const MAX_WEEKS_PER_WAKE = 1;
const FINANCE_V1_PERIOD = "weekly";
/** Must match reports-ingestion ACCOUNT2_REPORTS_API_SOURCE — never Statistics v5. */
const RECOVERY_API_SOURCE = "finance_v1_sales_reports_detailed";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function chunkKey(from, to) {
  return `${from}:${to}`;
}

function buildChunks(from, to, chunkDays) {
  const chunks = [];
  let cursor = from;
  while (cursor <= to) {
    const end = addDays(cursor, chunkDays - 1);
    const chunkTo = end > to ? to : end;
    chunks.push({ from: cursor, to: chunkTo });
    cursor = addDays(chunkTo, 1);
  }
  return chunks;
}

function is429Error(errors) {
  // Real HTTP 429 only — never treat "rate-limit headers missing" as 429.
  return errors.some((e) => {
    const msg = String(e ?? "");
    if (/\bFINANCE_HTTP_429\b/.test(msg)) return true;
    if (/\[http\s*429\]/i.test(msg)) return true;
    if (/\bWB API error 429\b/i.test(msg)) return true;
    if (/\btoo many requests\b/i.test(msg)) return true;
    if (/\b429\b/.test(msg) && !/headers missing|ambiguous|Remaining\/Reset required|missing_rate_limit_headers/i.test(msg)) {
      return true;
    }
    return false;
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) {
    return {
      accountId: ACCOUNT_ID,
      rangeFrom: RANGE_FROM,
      rangeTo: RANGE_TO,
      chunkDays: CHUNK_DAYS,
      startedAt: new Date().toISOString(),
      completedChunks: {},
      failedChunk: null,
      chunk429Count: 0,
      chunks: [],
      status: "running",
      recoveryActive: false,
    };
  }
  return JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
}

function saveProgress(state) {
  mkdirSync(resolve("exports/finance-backfill"), { recursive: true });
  state.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(state, null, 2));
}

async function countFinanceRows(sb, accountId, from, to) {
  const { count, error } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte("operation_date", from)
    .lte("operation_date", to);
  if (error) throw error;
  return count ?? 0;
}

async function financeSnapshot(sb, accountId) {
  const { count: total } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);

  const { data: maxRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: minRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    totalRows: total ?? 0,
    maxOperationDate: maxRow?.operation_date
      ? String(maxRow.operation_date).slice(0, 10)
      : null,
    minOperationDate: minRow?.operation_date
      ? String(minRow.operation_date).slice(0, 10)
      : null,
  };
}

async function activityInPeriod(sb, accountId, from, to) {
  const { count: orders } = await sb
    .from("wb_orders")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte("order_date", `${from}T00:00:00`)
    .lte("order_date", `${to}T23:59:59`);
  const { count: sales } = await sb
    .from("wb_sales")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte("sale_date", `${from}T00:00:00`)
    .lte("sale_date", `${to}T23:59:59`);
  return { orders: orders ?? 0, sales: sales ?? 0 };
}

async function monthlyDistribution(sb, accountId) {
  const hist = {};
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("operation_date")
      .eq("marketplace_account_id", accountId)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const m = String(r.operation_date).slice(0, 7);
      hist[m] = (hist[m] ?? 0) + 1;
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return Object.fromEntries(Object.entries(hist).sort());
}

loadEnv();

const args = new Set(process.argv.slice(2));
const probeOnly = args.has("--probe-only");
const resume = args.has("--resume");

const {
  acquireFinanceRecoveryAccountLock,
  releaseFinanceRecoveryAccountLock,
  runFinanceRecoveryBounded,
  touchFinanceRecoveryAccountLock,
  SyncAlreadyRunningError,
} = await import("../src/lib/finance-recovery/account-lock.ts");
const {
  activeFinanceChunkFor,
  acquireFinanceRecoveryCoordination,
  activateFinanceRecoveryCampaign,
  applyCampaignStatusAfterWake,
  computeFinancePageWaitMs,
  ensureReportsRequestGate,
  reportsRecoveryRequestBlockedUntil,
  hasReportsRequestTimingState,
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  isReportsRecoveryCooldownActive,
  releaseFinanceRecoveryCoordination,
  releaseStaleFinanceRecoveryCoordination,
  touchFinanceRecoveryCoordination,
  recordReportsRecovery429Hint,
  resolveFinanceRecoveryTerminalStatus,
  withPersistedFinancePage,
} = await import("../src/lib/finance-recovery/coordination.ts");
const { assertFinanceRecoveryOwnsQuota } = await import(
  "../src/lib/finance-recovery/reservation.ts"
);
const {
  assertFinanceV1LiveAllowed,
  assertFinanceV1TokenReady,
  FINANCE_V1_LIVE_REQUESTS_ENV,
} = await import("../src/lib/wildberries/finance-v1.ts");
const {
  ACCOUNT2_NEXT_REPORTS_WEEK,
  ACCOUNT2_REPORTS_API_SOURCE,
  assertAccount2ReportsRecoveryAccount,
  assertAccount2RecoveryUsesReportsOnly,
  assertPreviousReportsWeekComplete,
  buildReportsWeekState,
  nextWeeklyReportsPeriod,
  resolveNextIncompleteReportsWeek,
} = await import("../src/lib/finance-recovery/reports-ingestion.ts");
const { getSyncExecutionContext } = await import(
  "../src/lib/commercial-continuity/sync-execution-context.ts"
);
const { FINANCE_RECOVERY_MAX_PAGES_PER_WAKE } = await import(
  "../src/lib/commercial-continuity/execution-bounds.ts"
);
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { getMarketplaceAccountForSync } = await import(
  "../src/services/marketplace-account-service.ts"
);
const {
  assertFinanceRecoverySchemaReady,
  createWbSyncService,
} = await import("../src/lib/wildberries/sync-service.ts");

const maxPagesPerWake = Math.max(
  1,
  Number(process.env.FINANCE_RECOVERY_MAX_PAGES_PER_WAKE) ||
    FINANCE_RECOVERY_MAX_PAGES_PER_WAKE ||
    MAX_PAGES_PER_WAKE
);
const maxWeeksPerWake = Math.max(
  1,
  Number(process.env.FINANCE_RECOVERY_MAX_WEEKS_PER_WAKE) || MAX_WEEKS_PER_WAKE
);

const allChunks = buildChunks(RANGE_FROM, RANGE_TO, CHUNK_DAYS);
const probeChunk = allChunks[0];
const chunksToRun = probeOnly ? [probeChunk] : allChunks;

let progress = loadProgress();

assertAccount2ReportsRecoveryAccount(ACCOUNT_ID);
assertAccount2RecoveryUsesReportsOnly({
  apiSource: progress.apiSource ?? RECOVERY_API_SOURCE,
  scriptSource: RECOVERY_API_SOURCE,
});
if (ACCOUNT2_REPORTS_API_SOURCE !== RECOVERY_API_SOURCE) {
  console.error("BLOCKED: recovery API source constant mismatch — fail closed.");
  process.exit(2);
}

// Recovery may only run while it provably owns the production Finance quota.
const quotaOwnership = assertFinanceRecoveryOwnsQuota(ACCOUNT_ID, PROGRESS_PATH);
if (!quotaOwnership.ok) {
  console.error(
    `BLOCKED: ${quotaOwnership.reason} — no lock acquired and no WB request made.`
  );
  process.exit(2);
}

// Live Finance V1 HTTP opt-in (offline / accidental resume fail-closed).
try {
  assertFinanceV1LiveAllowed();
} catch (err) {
  console.error(
    `BLOCKED: ${err instanceof Error ? err.message : String(err)} — set ${FINANCE_V1_LIVE_REQUESTS_ENV}=true only for an authorized controlled wake. No progress write, no WB request.`
  );
  process.exit(2);
}

// Token class check before any progress mutation or HTTP (Base token → stop).
try {
  const account = await getMarketplaceAccountForSync(ACCOUNT_ID);
  assertFinanceV1TokenReady(account.apiKey);
} catch (err) {
  console.error(
    `BLOCKED: ${err instanceof Error ? err.message : String(err)} — configure Personal/Service + Finance token before the first Finance V1 request. No progress write, no WB request.`
  );
  process.exit(2);
}

// Missing Reports timing state fails closed: persist a conservative Reports gate, then stop.
// Does NOT inherit Statistics V5 serverRetryUntil / nextFinanceRequestNotBefore.
const requestGate = ensureReportsRequestGate({ progress, progressPath: PROGRESS_PATH });
progress = requestGate.state;
if (requestGate.initialized) {
  console.log(
    `REPORTS RATE-LIMIT STATE INITIALIZED — persisted reportsNextRequestNotBefore=${requestGate.gateUntil}. ` +
      "Legacy V5 serverRetryUntil left untouched. No WB request made. Re-run after this instant."
  );
  process.exit(3);
}

if (!hasReportsRequestTimingState(progress)) {
  console.error(
    "BLOCKED: Reports request timing state unavailable after gate initialization — fail closed, no WB request."
  );
  process.exit(2);
}

// Reports-only gate must precede every lock, progress write, and WB request.
if (isReportsRecoveryCooldownActive(progress)) {
  const blockedUntil = reportsRecoveryRequestBlockedUntil(progress);
  console.log(
    `REPORTS COOLDOWN ACTIVE — no lock acquired and no WB request made. Retry after ${blockedUntil}. ` +
      `(Legacy V5 serverRetryUntil=${progress.serverRetryUntil ?? "n/a"} is not used for Reports.)`
  );
  process.exit(3);
}

const sb = createAdminClient();
try {
  await assertFinanceRecoverySchemaReady(sb);
} catch (err) {
  console.error(
    `BLOCKED: ${err instanceof Error ? err.message : "Finance recovery schema is not ready"}`
  );
  process.exit(2);
}

// Campaign activation happens only after cooldown + schema preflight succeed.
// It reserves Account 2 Finance for CC suppression across wakes (no WB call).
progress = activateFinanceRecoveryCampaign({
  marketplaceAccountId: ACCOUNT_ID,
  progress: {
    ...progress,
    accountId: ACCOUNT_ID,
    rangeFrom: RANGE_FROM,
    rangeTo: RANGE_TO,
    chunkDays: CHUNK_DAYS,
  },
});
console.log(
  `Campaign status: ${progress.campaignStatus} (Account 2 Finance reserved from Commercial Continuity)`
);

releaseStaleFinanceRecoveryCoordination(ACCOUNT_ID);

let lockHeld = false;
let finalLockStatus = "partial";

async function cleanupAndExit(code = 0) {
  if (lockHeld) {
    releaseFinanceRecoveryCoordination({
      marketplaceAccountId: ACCOUNT_ID,
      progress,
      finalStatus: progress.status ?? finalLockStatus,
    });
    await releaseFinanceRecoveryAccountLock(ACCOUNT_ID, finalLockStatus).catch(() => undefined);
    lockHeld = false;
  }
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("\nInterrupted — releasing locks safely.");
  progress.status = "interrupted";
  void cleanupAndExit(130);
});
process.on("SIGTERM", () => {
  progress.status = "interrupted";
  void cleanupAndExit(143);
});

try {
  await acquireFinanceRecoveryAccountLock(ACCOUNT_ID);
  lockHeld = true;
} catch (err) {
  if (err instanceof SyncAlreadyRunningError) {
    console.error(
      `BLOCKED: Account ${ACCOUNT_ID} sync lock held — wait for Commercial Continuity/manual sync to finish.`
    );
    process.exit(2);
  }
  throw err;
}

const coord = acquireFinanceRecoveryCoordination({
  marketplaceAccountId: ACCOUNT_ID,
  progress,
});
if (!coord.ok) {
  await releaseFinanceRecoveryAccountLock(ACCOUNT_ID, "failed");
  lockHeld = false;
  console.error(`BLOCKED: ${coord.reason}`);
  process.exit(2);
}
progress.recoveryActive = true;
progress.lockPid = process.pid;
progress.lockStartedAt = progress.lockStartedAt ?? new Date().toISOString();
progress.lockUpdatedAt = new Date().toISOString();

let exitCode = 0;
try {
  if (!resume && !probeOnly) {
    progress.startedAt = new Date().toISOString();
    progress.completedChunks = {};
    progress.failedChunk = null;
    progress.chunk429Count = 0;
    progress.chunks = [];
    progress.activeChunk = null;
    progress.status = "running";
    saveProgress(progress);
  }

  const svc = await createWbSyncService(ACCOUNT_ID);
  const baseline = {
    account2: await financeSnapshot(sb, ACCOUNT_ID),
    account1: await financeSnapshot(sb, "1"),
  };
  progress.baseline = baseline;
  saveProgress(progress);

  console.log("=== Account 2 Reports Finance Recovery (Sales Reports V1 detailed) ===");
  console.log(`Range: ${RANGE_FROM} → ${RANGE_TO} | chunk=${CHUNK_DAYS}d | period=${FINANCE_V1_PERIOD}`);
  console.log(
    `Source: POST ${ACCOUNT2_REPORTS_API_SOURCE} | next week target ${ACCOUNT2_NEXT_REPORTS_WEEK.from}→${ACCOUNT2_NEXT_REPORTS_WEEK.to} rrdId=${ACCOUNT2_NEXT_REPORTS_WEEK.rrdId}`
  );
  console.log(
    `Wake budget: maxPagesPerWake=${maxPagesPerWake} maxWeeksPerWake=${maxWeeksPerWake} | list not called in wake | Reports pacing=Remaining/Reset+margin`
  );
  console.log(
    `429 policy: first Reports 429 fails closed (no inline retry); V5 serverRetryUntil is historical evidence only`
  );
  console.log("Baseline account 2:", baseline.account2);
  console.log(`Mode: ${probeOnly ? "PROBE ONLY" : resume ? "RESUME" : "FULL"}\n`);

  let rateLimited = false;
  let failed = false;
  let probeResult = null;
  let wakeSucceeded = false;
  let morePagesRemaining = false;
  let pagesFetchedThisWake = 0;
  let weeksTouchedThisWake = 0;
  let lastFinanceRequestAtMs = null;
  let lastRateLimit = null;
  let chunksAttempted = 0;

  const nextIncomplete = resolveNextIncompleteReportsWeek({
    weeks: chunksToRun,
    completedChunks: progress.completedChunks,
  });
  if (nextIncomplete) {
    console.log(
      `Next incomplete Reports week from state: ${nextIncomplete.from}→${nextIncomplete.to} (rrd resumes from activeChunk if same week)`
    );
  }

  for (const chunk of chunksToRun) {
    const key = chunkKey(chunk.from, chunk.to);
    if (progress.completedChunks?.[key]) {
      console.log(`SKIP (already complete): ${key}`);
      if (probeOnly && key === chunkKey(probeChunk.from, probeChunk.to)) {
        probeResult = progress.completedChunks[key];
      }
      continue;
    }

    if (weeksTouchedThisWake >= maxWeeksPerWake) {
      console.log(
        `WAKE WEEK BUDGET EXHAUSTED — refusing to start ${key} (weeksTouched=${weeksTouchedThisWake}).`
      );
      break;
    }

    if (pagesFetchedThisWake >= maxPagesPerWake) {
      console.log(
        `WAKE BUDGET EXHAUSTED — stopping before chunk ${key} (pagesFetched=${pagesFetchedThisWake}).`
      );
      break;
    }

    // Chronological safety: do not start a later week while an earlier incomplete week exists.
    const expected = resolveNextIncompleteReportsWeek({
      weeks: allChunks,
      completedChunks: progress.completedChunks,
    });
    if (expected && expected.key !== key) {
      console.log(
        `SKIP OUT-OF-ORDER week ${key} — next incomplete is ${expected.key}`
      );
      break;
    }

    chunksAttempted += 1;
    weeksTouchedThisWake += 1;
    if (probeOnly && chunksAttempted > 1) {
      console.log("PROBE ONLY — refusing to start a second chunk.");
      break;
    }

    let activeChunk = activeFinanceChunkFor(progress, chunk.from, chunk.to);
    const weekState = buildReportsWeekState({
      periodFrom: chunk.from,
      periodTo: chunk.to,
      period: FINANCE_V1_PERIOD,
      activeChunk,
      reportIdsSeen: activeChunk.reportIdsSeen ?? progress.reportsWeek?.reportIdsSeen,
    });
    activeChunk = {
      ...activeChunk,
      reportPeriod: weekState.period,
      reportIdsSeen: weekState.reportIdsSeen,
      apiSource: RECOVERY_API_SOURCE,
    };
    progress.activeChunk = activeChunk;
    progress.apiSource = RECOVERY_API_SOURCE;
    progress.reportsWeek = {
      periodFrom: weekState.periodFrom,
      periodTo: weekState.periodTo,
      period: weekState.period,
      key: weekState.key,
      lastPersistedRrdId: weekState.lastPersistedRrdId,
      currentPage: weekState.currentPage,
      reportIdsSeen: weekState.reportIdsSeen,
      status: weekState.status,
    };
    progress.status = "running";
    saveProgress(progress);

    const rowsBefore = await countFinanceRows(sb, ACCOUNT_ID, chunk.from, chunk.to);
    const activity = await activityInPeriod(sb, ACCOUNT_ID, chunk.from, chunk.to);
    console.log(
      `\n--- Chunk ${key}, resume page ${activeChunk.currentPage}, cursor ${activeChunk.lastPersistedRrdId} ---`
    );

    let chunkComplete = false;
    while (!chunkComplete) {
      if (pagesFetchedThisWake >= maxPagesPerWake) {
        morePagesRemaining = true;
        console.log(
          `WAKE OK — reached maxPagesPerWake=${maxPagesPerWake}; next wake resumes at rrdid=${activeChunk.lastPersistedRrdId}.`
        );
        break;
      }

      if (lastFinanceRequestAtMs != null || lastRateLimit != null) {
        const waitMs = computeFinancePageWaitMs({
          remaining: lastRateLimit?.remaining ?? null,
          resetSeconds: lastRateLimit?.resetSeconds ?? null,
          lastFinanceRequestAtMs,
        });
        if (waitMs > 0) {
          console.log(
            JSON.stringify({
              event: "finance_recovery_pace_wait",
              accountId: ACCOUNT_ID,
              waitMs,
              remaining: lastRateLimit?.remaining ?? null,
              resetSeconds: lastRateLimit?.resetSeconds ?? null,
            })
          );
          await sleep(waitMs);
        }
      }

      await touchFinanceRecoveryAccountLock(ACCOUNT_ID);
      touchFinanceRecoveryCoordination(ACCOUNT_ID);

      const startRrdId = activeChunk.lastPersistedRrdId;
      const pageNumber = activeChunk.currentPage;
      lastFinanceRequestAtMs = Date.now();
      progress.reportsLastRequestAt = new Date(lastFinanceRequestAtMs).toISOString();
      progress.reportsNextRequestNotBefore = new Date(
        lastFinanceRequestAtMs + FINANCE_RECOVERY_MIN_PAGE_GAP_MS
      ).toISOString();
      progress.apiSource = RECOVERY_API_SOURCE;
      // Persist before the request: a process crash must not allow an immediate
      // second wake against the same seller-scoped Finance bucket.
      saveProgress(progress);
      // Re-read gate: persistence failure must fail closed before HTTP.
      const reloaded = loadProgress();
      if (
        !reloaded.reportsLastRequestAt ||
        reloaded.reportsLastRequestAt !== progress.reportsLastRequestAt
      ) {
        throw new Error(
          "Pre-HTTP reportsLastRequestAt persistence failed — fail closed, no Wildberries request"
        );
      }
      progress = reloaded;
      assertAccount2RecoveryUsesReportsOnly({
        apiSource: progress.apiSource,
        scriptSource: RECOVERY_API_SOURCE,
      });
      const result = await runFinanceRecoveryBounded(ACCOUNT_ID, async () => {
        const syncResult = await svc.syncFinanceV1Page(
          chunk.from,
          chunk.to,
          startRrdId,
          FINANCE_V1_PERIOD
        );
        const ctx = getSyncExecutionContext();
        return {
          syncResult,
          serverRetryAfterMs: ctx?.lastRateLimitRetryAfterMs ?? null,
          rateLimit: ctx?.lastRateLimitSnapshot ?? syncResult.page?.rateLimit ?? null,
        };
      });
      lastRateLimit = result.rateLimit;
      pagesFetchedThisWake += 1;
      const capturedAtMs = Date.now();
      const nextWaitMs = computeFinancePageWaitMs({
        remaining: result.rateLimit?.remaining ?? null,
        resetSeconds: result.rateLimit?.resetSeconds ?? null,
        lastFinanceRequestAtMs,
        nowMs: capturedAtMs,
      });
      progress.reportsLastRateLimitSnapshot = {
        remaining: result.rateLimit?.remaining ?? null,
        limit: result.rateLimit?.limit ?? null,
        resetSeconds: result.rateLimit?.resetSeconds ?? null,
        retrySeconds: result.rateLimit?.retrySeconds ?? null,
        capturedAt: new Date(capturedAtMs).toISOString(),
      };
      progress.reportsNextRequestNotBefore = new Date(
        capturedAtMs + nextWaitMs
      ).toISOString();
      saveProgress(progress);

      console.log(
        JSON.stringify({
          event: "finance_recovery_page_result",
          accountId: ACCOUNT_ID,
          chunkFrom: chunk.from,
          chunkTo: chunk.to,
          page: pageNumber,
          requestCursor: startRrdId,
          httpStatusHint: is429Error(result.syncResult.errors)
            ? 429
            : result.syncResult.errors.length
              ? "error"
              : 200,
          apiRows: result.syncResult.recordsProcessed,
          persistedLines: result.syncResult.recordsUpdated,
          remaining: result.rateLimit?.remaining ?? null,
          limit: result.rateLimit?.limit ?? null,
          reset: result.rateLimit?.resetSeconds ?? null,
          retry: result.rateLimit?.retrySeconds ?? null,
          nextCursor: result.syncResult.page?.lastRrdId ?? null,
          hasMore: result.syncResult.page?.hasMore ?? null,
          timestamp: new Date().toISOString(),
        })
      );

      const had429 = is429Error(result.syncResult.errors);
      if (had429) {
        progress.chunk429Count = (progress.chunk429Count ?? 0) + 1;
        activeChunk = { ...activeChunk, status: "blocked_partial" };
        progress.activeChunk = activeChunk;
        progress.status = "blocked_partial";
        const serverMs =
          result.serverRetryAfterMs ?? result.rateLimit?.retryAfterMs ?? null;
        progress = recordReportsRecovery429Hint({
          progress,
          serverRetryAfterMs: serverMs,
        });
        progress.failedChunk = {
          key,
          from: chunk.from,
          to: chunk.to,
          page: activeChunk.currentPage,
          cursor: startRrdId,
          reason: "429",
          serverRetryAfterMs: serverMs,
          reportsServerRetryUntil: progress.reportsServerRetryUntil ?? null,
          // Preserve historical V5 evidence; do not overwrite or clear it.
          legacyStatisticsServerRetryUntil: progress.serverRetryUntil ?? null,
          at: new Date().toISOString(),
        };
        saveProgress(progress);
        rateLimited = true;
        exitCode = 1;
        console.log(
          `STOP: Reports 429 on ${key} page ${activeChunk.currentPage}; persisted pages preserved. Retry after ${progress.reportsServerRetryUntil ?? "Reports server cooldown"}.`
        );
        break;
      }

      if (result.syncResult.errors.length > 0 || result.syncResult.page == null) {
        activeChunk = { ...activeChunk, status: "failed" };
        progress.activeChunk = activeChunk;
        progress.status = "failed";
        progress.failedChunk = {
          key,
          from: chunk.from,
          to: chunk.to,
          page: activeChunk.currentPage,
          cursor: startRrdId,
          reason:
            result.syncResult.errors[0]?.slice(0, 300) ??
            "Finance page returned no page metadata",
          at: new Date().toISOString(),
        };
        saveProgress(progress);
        failed = true;
        exitCode = 1;
        console.log(`FAILED: page persistence/API error; cursor was not advanced.`);
        break;
      }

      const page = result.syncResult.page;
      if (page.isEmpty) {
        chunkComplete = true;
        wakeSucceeded = true;
        morePagesRemaining = false;
      } else {
        if (page.lastRrdId == null) {
          throw new Error("Persisted Finance page did not return a last rrd_id");
        }

        const account1AfterPage = await financeSnapshot(sb, "1");
        if (account1AfterPage.totalRows !== baseline.account1.totalRows) {
          throw new Error(
            `Account isolation violation: account 1 finance rows changed ${baseline.account1.totalRows} → ${account1AfterPage.totalRows}`
          );
        }

        // syncFinanceV1Page has already completed its atomic UPSERT. Cursor is
        // deliberately written only after that successful persistence.
        progress = withPersistedFinancePage({
          state: progress,
          activeChunk,
          startRrdId,
          endRrdId: page.lastRrdId,
          apiRows: result.syncResult.recordsProcessed,
          upsertedLines: result.syncResult.recordsUpdated,
          reportIds: result.syncResult.reportIds ?? [],
          reportPeriod: FINANCE_V1_PERIOD,
          apiSource: RECOVERY_API_SOURCE,
        });
        activeChunk = progress.activeChunk;
        progress.failedChunk = null;
        wakeSucceeded = true;
        saveProgress(progress);

        if (!page.hasMore) {
          chunkComplete = true;
          morePagesRemaining = false;
        } else {
          morePagesRemaining = true;
          if (pagesFetchedThisWake >= maxPagesPerWake) {
            console.log(
              `WAKE OK — page persisted; stopping before next page (cursor=${page.lastRrdId}).`
            );
            break;
          }
        }
      }
    }

    if (rateLimited || failed) break;
    if (!chunkComplete) {
      // Successful wake with more pages (or budget) remaining — do not start next chunk.
      break;
    }

    const rowsAfter = await countFinanceRows(sb, ACCOUNT_ID, chunk.from, chunk.to);
    const snapAfter = await financeSnapshot(sb, ACCOUNT_ID);
    const completedPages = activeChunk.completedPages;
    const chunkRecord = {
      key,
      from: chunk.from,
      to: chunk.to,
      pagesCompleted: completedPages.length,
      apiRowsProcessed: completedPages.reduce((sum, page) => sum + page.apiRows, 0),
      upsertedLines: completedPages.reduce(
        (sum, page) => sum + page.upsertedLines,
        0
      ),
      rowsInDbBefore: rowsBefore,
      rowsInDbAfter: rowsAfter,
      rowsImportedInPeriod: rowsAfter - rowsBefore,
      maxOperationDateAfter: snapAfter.maxOperationDate,
      totalRowsAfter: snapAfter.totalRows,
      activity,
      completedAt: new Date().toISOString(),
      outcome: probeOnly ? "probe_success" : "chunk_success",
    };

    progress.completedChunks[key] = chunkRecord;
    progress.chunks = Array.isArray(progress.chunks) ? progress.chunks : [];
    progress.chunks.push(chunkRecord);
    progress.activeChunk = null;
    progress.failedChunk = null;
    // Clear only Reports cooldown on week success. Preserve Statistics V5 evidence.
    progress.reportsServerRetryUntil = null;
    progress.reportsServerRetryAfterMs = null;
    if (progress.reportsWeek) {
      progress.reportsWeek = {
        ...progress.reportsWeek,
        status: "completed",
        lastPersistedRrdId: activeChunk.lastPersistedRrdId,
        currentPage: activeChunk.currentPage,
        reportIdsSeen: activeChunk.reportIdsSeen ?? [],
      };
    }
    const plannedNext = nextWeeklyReportsPeriod({
      periodFrom: chunk.from,
      periodTo: chunk.to,
    });
    // Prove next week cannot start until this key is in completedChunks (just written).
    assertPreviousReportsWeekComplete({
      completedChunks: progress.completedChunks,
      previousWeekKey: key,
      nextWeekKey: plannedNext.key,
    });
    progress.lastMaxOperationDate = snapAfter.maxOperationDate;
    progress.lastTotalRows = snapAfter.totalRows;
    saveProgress(progress);
    probeResult = chunk.from === probeChunk.from ? chunkRecord : probeResult;
    morePagesRemaining = false;

    if (probeOnly) {
      console.log("PROBE SUCCESS — stopping after single completed chunk (no next chunk).");
      break;
    }
    // One-page-per-wake: after completing a chunk in this wake, do not start the next
    // chunk in the same process (avoids another Finance request in the same wake).
    if (pagesFetchedThisWake >= maxPagesPerWake) {
      console.log("WAKE OK — chunk completed; next chunk deferred to a later wake.");
      break;
    }
    const idx = chunksToRun.indexOf(chunk);
    if (idx < chunksToRun.length - 1) {
      await sleep(PAUSE_BETWEEN_CHUNKS_MS);
    }
  }

  const final = {
    account2: await financeSnapshot(sb, ACCOUNT_ID),
    account1: await financeSnapshot(sb, "1"),
    after20260621: (
      await sb
        .from("wb_finance")
        .select("id", { count: "exact", head: true })
        .eq("marketplace_account_id", ACCOUNT_ID)
        .gt("operation_date", "2026-06-21")
    ).count,
    monthly: await monthlyDistribution(sb, ACCOUNT_ID),
  };

  progress.final = final;
  progress.status = resolveFinanceRecoveryTerminalStatus({
    rateLimited,
    failed,
    probeOnly,
    probeSucceeded: Boolean(probeResult),
    wakeSucceeded,
    morePagesRemaining,
    completedChunkCount: Object.keys(progress.completedChunks ?? {}).length,
    totalChunkCount: allChunks.length,
  });
  progress = applyCampaignStatusAfterWake({
    progress,
    terminalStatus: progress.status,
    completedChunkCount: Object.keys(progress.completedChunks ?? {}).length,
    totalChunkCount: allChunks.length,
  });
  progress.finishedAt = new Date().toISOString();
  saveProgress(progress);
  finalLockStatus =
    progress.status === "completed" ||
    progress.status === "probe_ok" ||
    progress.status === "wake_ok"
      ? "success"
      : progress.status === "failed"
        ? "failed"
        : "partial";

  console.log("\n=== RECOVERY SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        status: progress.status,
        campaignStatus: progress.campaignStatus ?? null,
        rateLimited,
        failed,
        probeOnly,
        wakeSucceeded,
        morePagesRemaining,
        pagesFetchedThisWake,
        weeksTouchedThisWake,
        maxPagesPerWake,
        maxWeeksPerWake,
        probeResult,
        final,
        activeChunk: progress.activeChunk ?? null,
        reportsServerRetryUntil: progress.reportsServerRetryUntil ?? null,
        legacyStatisticsServerRetryUntil: progress.serverRetryUntil ?? null,
      },
      null,
      2
    )
  );
} catch (err) {
  progress.status = "failed";
  // Keep campaign ACTIVE on unexpected failure — do not release Finance to CC.
  progress.campaignStatus = progress.campaignStatus === "completed" ? "completed" : "active";
  progress.failedChunk = {
    ...(progress.failedChunk ?? {}),
    reason: err instanceof Error ? err.message : "Unexpected Finance recovery failure",
    at: new Date().toISOString(),
  };
  saveProgress(progress);
  finalLockStatus = "failed";
  exitCode = 1;
  console.error(progress.failedChunk.reason);
} finally {
  releaseFinanceRecoveryCoordination({
    marketplaceAccountId: ACCOUNT_ID,
    progress,
    finalStatus: progress.status,
  });
  await releaseFinanceRecoveryAccountLock(ACCOUNT_ID, finalLockStatus).catch(
    () => undefined
  );
  lockHeld = false;
}

process.exit(exitCode);
