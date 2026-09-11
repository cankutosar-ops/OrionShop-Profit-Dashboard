/**
 * Read-only Account 2 Reports recovery preflight + continuous one-page wake loop.
 * Does not DELETE/TRUNCATE. Does not call V5 or list. One WB request per wake.
 *
 * Usage:
 *   npx tsx scripts/run-account2-reports-continuous-recovery.mts --verify-only
 *   npx tsx scripts/run-account2-reports-continuous-recovery.mts --continue
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const PROGRESS_PATH = resolve(
  "exports/finance-backfill/account-2-recovery-progress.json"
);
const LOG_PATH = resolve(
  "exports/finance-backfill/account-2-reports-continuous-log.jsonl"
);
const SUMMARY_PATH = resolve(
  "exports/finance-backfill/account-2-reports-continuous-summary.json"
);
const ACCOUNT_ID = "2";
const EXPECTED_SELLER = "68674";
const RANGE_FROM = "2026-06-22";
const RANGE_TO = "2026-08-28";
const CHUNK_DAYS = 7;
const A1_EXPECTED_ROWS = 73280;
const A1_EXPECTED_MAX = "2026-08-23";
const A2_EXPECTED_ROWS_APPROX = 16039;
const A2_EXPECTED_MIN = "2026-05-28";
const A2_EXPECTED_MAX = "2026-07-05";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && process.env[t.slice(0, i).trim()] == null) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildChunks(from: string, to: string, chunkDays: number) {
  const chunks: Array<{ from: string; to: string; key: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    const end = addDays(cursor, chunkDays - 1);
    const chunkTo = end > to ? to : end;
    chunks.push({ from: cursor, to: chunkTo, key: `${cursor}:${chunkTo}` });
    cursor = addDays(chunkTo, 1);
  }
  return chunks;
}

function loadProgress() {
  return JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function logLine(obj: unknown) {
  appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n");
  console.log(JSON.stringify(obj));
}

async function financeSnapshot(
  sb: any,
  id: string
): Promise<{ count: number; min: string | null; max: string | null }> {
  const { count } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", id);
  const { data: maxRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: minRow } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    min: minRow?.operation_date
      ? String(minRow.operation_date).slice(0, 10)
      : null,
    max: maxRow?.operation_date
      ? String(maxRow.operation_date).slice(0, 10)
      : null,
  };
}

async function countDuplicateSourceKeys(sb: any, accountId: string) {
  // Page through source_keys and count duplicates in memory (read-only).
  const seen = new Map<string, number>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", accountId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const k = String(row.source_key ?? "");
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  let dupKeys = 0;
  let dupRows = 0;
  for (const n of seen.values()) {
    if (n > 1) {
      dupKeys += 1;
      dupRows += n - 1;
    }
  }
  return { uniqueKeys: seen.size, dupKeys, dupRows };
}

async function verifyReadOnly() {
  loadEnv();
  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "true";

  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { assertFinanceV1TokenReady } = await import(
    "../src/lib/wildberries/finance-v1.ts"
  );
  const {
    reportsRecoveryRequestBlockedUntil,
    statisticsCooldownDoesNotBlockReports,
  } = await import("../src/lib/finance-recovery/coordination.ts");
  const { resolveNextIncompleteReportsWeek } = await import(
    "../src/lib/finance-recovery/reports-ingestion.ts"
  );

  const sb = createAdminClient();
  const progress = loadProgress();
  const failures: string[] = [];

  const acc = await getMarketplaceAccountForSync(ACCOUNT_ID);
  const sellerId = String((acc as any).seller_id ?? "");
  if (String(acc.id ?? ACCOUNT_ID) !== "2" && ACCOUNT_ID !== "2") {
    failures.push("account id mismatch");
  }
  if (sellerId !== EXPECTED_SELLER) {
    failures.push(`seller_id expected ${EXPECTED_SELLER} got ${sellerId}`);
  }
  try {
    assertFinanceV1TokenReady(acc.apiKey);
  } catch (e: any) {
    failures.push("token:" + e.message);
  }

  const [a2, a1] = await Promise.all([
    financeSnapshot(sb, "2"),
    financeSnapshot(sb, "1"),
  ]);

  if (Math.abs(a2.count - A2_EXPECTED_ROWS_APPROX) > 50) {
    failures.push(
      `A2 rows approx expected ~${A2_EXPECTED_ROWS_APPROX} got ${a2.count}`
    );
  }
  if (a2.min !== A2_EXPECTED_MIN) {
    failures.push(`A2 MIN expected ${A2_EXPECTED_MIN} got ${a2.min}`);
  }
  if (a2.max !== A2_EXPECTED_MAX) {
    failures.push(`A2 MAX expected ${A2_EXPECTED_MAX} got ${a2.max}`);
  }
  if (a1.count !== A1_EXPECTED_ROWS) {
    failures.push(`A1 rows expected ${A1_EXPECTED_ROWS} got ${a1.count}`);
  }
  if (a1.max !== A1_EXPECTED_MAX) {
    failures.push(`A1 MAX expected ${A1_EXPECTED_MAX} got ${a1.max}`);
  }

  const completed = progress.completedChunks ?? {};
  if (!completed["2026-06-22:2026-06-28"]) {
    failures.push("week 2026-06-22→2026-06-28 not complete in progress");
  }
  if (!completed["2026-06-29:2026-07-05"]) {
    failures.push("week 2026-06-29→2026-07-05 not complete in progress");
  }
  if (progress.activeChunk != null) {
    failures.push("activeChunk not cleared");
  }
  if (progress.accountId && String(progress.accountId) !== "2") {
    failures.push("progress accountId != 2");
  }

  const dups = await countDuplicateSourceKeys(sb, "2");
  if (dups.dupKeys > 0) {
    failures.push(
      `duplicate source_key keys=${dups.dupKeys} extraRows=${dups.dupRows}`
    );
  }

  const allChunks = buildChunks(RANGE_FROM, RANGE_TO, CHUNK_DAYS);
  const next = resolveNextIncompleteReportsWeek({
    weeks: allChunks.map((c) => ({ from: c.from, to: c.to })),
    completedChunks: completed,
  });

  const now = Date.now();
  const reportsBlockedUntil = reportsRecoveryRequestBlockedUntil(progress, now);
  const v5DoesNotBlock = statisticsCooldownDoesNotBlockReports({
    state: progress,
    nowMs: now,
  });
  if (!v5DoesNotBlock) {
    failures.push("legacy V5 cooldown incorrectly blocking Reports");
  }

  const out = {
    ok: failures.length === 0,
    failures,
    account: { id: "2", sellerId },
    a2,
    a1,
    dups,
    progress: {
      activeChunk: progress.activeChunk,
      completedKeys: Object.keys(completed),
      reportsWeek: progress.reportsWeek,
      reportsNextRequestNotBefore: progress.reportsNextRequestNotBefore,
      reportsServerRetryUntil: progress.reportsServerRetryUntil,
      legacyV5serverRetryUntil: progress.serverRetryUntil,
      apiSource: progress.apiSource,
      campaignStatus: progress.campaignStatus,
    },
    nextWeek: next,
    reportsBlockedUntil,
    v5DoesNotBlock,
    worklist: allChunks.map((c) => c.key),
    remainingWeeks: allChunks
      .filter((c) => !completed[c.key])
      .map((c) => c.key),
    verifiedAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve("exports/finance-backfill/_phase1-verify.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function extractWakeFacts(stdout: string, progressBefore: any, progressAfter: any) {
  const requestEnd =
    [...stdout.matchAll(/Request END (\{.*\})/g)].map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    }).filter(Boolean).pop() ?? null;

  const pageResult =
    [...stdout.matchAll(/\{"event":"finance_recovery_page_result".*\}/g)]
      .map((m) => {
        try {
          return JSON.parse(m[0]);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop() ?? null;

  const httpStatus = requestEnd?.status ?? null;
  const acBefore = progressBefore.activeChunk;
  const acAfter = progressAfter.activeChunk;
  const completedBefore = Object.keys(progressBefore.completedChunks ?? {});
  const completedAfter = Object.keys(progressAfter.completedChunks ?? {});
  const newlyCompleted = completedAfter.filter((k) => !completedBefore.includes(k));

  return {
    httpStatus,
    requestEnd,
    pageResult,
    cursorBefore: acBefore?.lastPersistedRrdId ?? 0,
    cursorAfter:
      acAfter?.lastPersistedRrdId ??
      (newlyCompleted.length
        ? null
        : acBefore?.lastPersistedRrdId ?? null),
    week:
      acBefore?.key ??
      progressAfter.reportsWeek?.key ??
      newlyCompleted[0] ??
      null,
    weekStatus: newlyCompleted.length
      ? "complete"
      : acAfter?.status ?? progressAfter.reportsWeek?.status ?? null,
    hasMore: pageResult?.hasMore ?? null,
    responseRows: pageResult?.apiRows ?? null,
    persistedRows: pageResult?.persistedLines ?? null,
    remaining: pageResult?.remaining ?? requestEnd?.rateLimitRemaining ?? null,
    limit: pageResult?.limit ?? requestEnd?.rateLimitLimit ?? null,
    reset: pageResult?.reset ?? requestEnd?.rateLimitReset ?? null,
    retry: pageResult?.retry ?? requestEnd?.rateLimitRetry ?? null,
    a2Total: progressAfter.final?.account2?.totalRows ?? progressAfter.lastTotalRows,
    a2Max:
      progressAfter.final?.account2?.maxOperationDate ??
      progressAfter.lastMaxOperationDate,
    a1Total: progressAfter.final?.account1?.totalRows,
    a1Max: progressAfter.final?.account1?.maxOperationDate,
    status: progressAfter.status,
    activeChunk: progressAfter.activeChunk,
    newlyCompleted,
    reportsNext: progressAfter.reportsNextRequestNotBefore,
    reportsServerRetryUntil: progressAfter.reportsServerRetryUntil,
    blocked:
      /REPORTS COOLDOWN ACTIVE|BLOCKED:|RATE-LIMIT STATE INITIALIZED/i.test(
        stdout
      ),
    rateLimited: /FINANCE_HTTP_429|status":429|rateLimited": true/i.test(stdout),
    failed: /"failed": true|FAILED|persistence/i.test(stdout) &&
      !/"failed": false/.test(stdout),
  };
}

async function waitForReportsGate(maxWaitMs = 2 * 60 * 60 * 1000) {
  const {
    reportsRecoveryRequestBlockedUntil,
  } = await import("../src/lib/finance-recovery/coordination.ts");
  const started = Date.now();
  for (;;) {
    const progress = loadProgress();
    const until = reportsRecoveryRequestBlockedUntil(progress, Date.now());
    if (!until) return { waitedMs: Date.now() - started, until: null };
    const waitMs = Date.parse(until) - Date.now() + 1000;
    if (waitMs <= 0) return { waitedMs: Date.now() - started, until: null };
    if (Date.now() - started + waitMs > maxWaitMs) {
      throw new Error(
        `Reports gate wait exceeds maxWaitMs; blockedUntil=${until}`
      );
    }
    console.log(
      JSON.stringify({
        event: "waiting_reports_gate",
        until,
        waitMs,
        at: new Date().toISOString(),
      })
    );
    await sleep(Math.min(waitMs, 30_000));
  }
}

function runOneWake() {
  const env = {
    ...process.env,
    FINANCE_V1_LIVE_REQUESTS_ENABLED: "true",
    ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE: "true",
  };
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/run-account2-finance-chunked-recovery.mjs", "--resume"],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      shell: true,
      maxBuffer: 30 * 1024 * 1024,
    }
  );
  return {
    status: r.status ?? 1,
    stdout: String(r.stdout || "") + String(r.stderr || ""),
  };
}

async function continueUntilComplete() {
  loadEnv();
  process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = "true";
  mkdirSync(resolve("exports/finance-backfill"), { recursive: true });
  if (!existsSync(LOG_PATH)) writeFileSync(LOG_PATH, "");

  const verify = await verifyReadOnly();
  if (!verify.ok) {
    console.error("PHASE1_FAILED");
    process.exit(2);
  }

  const a1Baseline = verify.a1;
  let totalHttp = 0;
  let wakeIndex = 0;
  const pageReports: unknown[] = [];

  const allChunks = buildChunks(RANGE_FROM, RANGE_TO, CHUNK_DAYS);

  while (true) {
    const progress = loadProgress();
    const completed = progress.completedChunks ?? {};
    const remaining = allChunks.filter((c) => !completed[c.key]);
    if (remaining.length === 0 && progress.activeChunk == null) {
      break;
    }

    await waitForReportsGate();

    // Re-check account isolation before each wake
    const { getMarketplaceAccountForSync } = await import(
      "../src/services/marketplace-account-service.ts"
    );
    const { assertFinanceV1TokenReady } = await import(
      "../src/lib/wildberries/finance-v1.ts"
    );
    const acc = await getMarketplaceAccountForSync(ACCOUNT_ID);
    const sellerId = String((acc as any).seller_id ?? "");
    if (sellerId !== EXPECTED_SELLER) {
      throw new Error(`STOP: seller_id mismatch ${sellerId}`);
    }
    assertFinanceV1TokenReady(acc.apiKey);

    const before = loadProgress();
    wakeIndex += 1;
    console.log(`\n=== WAKE ${wakeIndex} START remainingWeeks=${remaining.length} ===`);
    const wake = runOneWake();
    const after = loadProgress();
    const facts = extractWakeFacts(wake.stdout, before, after);

    if (
      facts.httpStatus === 200 ||
      facts.httpStatus === 204 ||
      facts.httpStatus === 429
    ) {
      totalHttp += 1;
    } else if (!facts.blocked && wake.status === 0) {
      // may still have made a request; count from Request END if present
      if (/Request END/.test(wake.stdout)) totalHttp += 1;
    }

    const a1Ok =
      facts.a1Total === a1Baseline.count && facts.a1Max === a1Baseline.max;

    const report = {
      event: "page_wake_result",
      wakeIndex,
      account: 2,
      currentWeek: facts.week,
      cursorBefore: facts.cursorBefore,
      cursorAfter: facts.cursorAfter,
      httpStatus: facts.httpStatus,
      responseRows: facts.responseRows,
      normalizedPersistedRows: facts.persistedRows,
      account2TotalRows: facts.a2Total,
      account2MaxOperationDate: facts.a2Max,
      weekStatus: facts.weekStatus,
      hasMore: facts.hasMore,
      nextWeek:
        after.activeChunk?.key ??
        allChunks.find((c) => !(after.completedChunks ?? {})[c.key])?.key ??
        null,
      remaining: facts.remaining,
      limit: facts.limit,
      reset: facts.reset,
      retry: facts.retry,
      reportsNextRequestNotBefore: facts.reportsNext,
      reportsServerRetryUntil: facts.reportsServerRetryUntil,
      account1Unchanged: a1Ok,
      v5Calls: 0,
      listCalls: 0,
      exitCode: wake.status,
      blocked: facts.blocked,
      rateLimited: facts.rateLimited,
      nextWakeAllowed: !facts.rateLimited && wake.status !== 2,
      at: new Date().toISOString(),
    };
    pageReports.push(report);
    logLine(report);

    if (facts.rateLimited || facts.httpStatus === 429) {
      writeFileSync(
        SUMMARY_PATH,
        JSON.stringify(
          {
            stopped: "http_429",
            totalHttp,
            pageReports,
            progress: after,
          },
          null,
          2
        )
      );
      console.error("STOPPED_ON_429");
      process.exit(3);
    }

    if (facts.blocked && totalHttp === 0 && wakeIndex === 1) {
      // gate init / cooldown without request — wait and continue
      continue;
    }

    if (wake.status !== 0 && wake.status !== 3) {
      writeFileSync(
        SUMMARY_PATH,
        JSON.stringify(
          {
            stopped: "wake_failed",
            exitCode: wake.status,
            totalHttp,
            pageReports,
            tail: wake.stdout.slice(-4000),
          },
          null,
          2
        )
      );
      console.error("STOPPED_ON_WAKE_FAILURE");
      process.exit(4);
    }

    if (!a1Ok) {
      writeFileSync(
        SUMMARY_PATH,
        JSON.stringify({ stopped: "account1_modified", totalHttp, pageReports }, null, 2)
      );
      console.error("STOPPED_ACCOUNT1_MODIFIED");
      process.exit(5);
    }

    // Safety: never more than 1 Request END per wake
    const requestEnds = (wake.stdout.match(/Request END/g) || []).length;
    if (requestEnds > 1) {
      writeFileSync(
        SUMMARY_PATH,
        JSON.stringify({ stopped: "multiple_http", requestEnds, totalHttp, pageReports }, null, 2)
      );
      console.error("STOPPED_MULTIPLE_HTTP");
      process.exit(6);
    }
    if (/reportDetailByPeriod|statistics-api|sales-reports\/list/i.test(wake.stdout)) {
      writeFileSync(
        SUMMARY_PATH,
        JSON.stringify({ stopped: "forbidden_endpoint", totalHttp, pageReports }, null, 2)
      );
      console.error("STOPPED_FORBIDDEN_ENDPOINT");
      process.exit(7);
    }
  }

  // Final verification
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const sb = createAdminClient();
  const [a2, a1] = await Promise.all([
    financeSnapshot(sb, "2"),
    financeSnapshot(sb, "1"),
  ]);
  const dups = await countDuplicateSourceKeys(sb, "2");
  const finalProgress = loadProgress();
  const completedKeys = Object.keys(finalProgress.completedChunks ?? {});
  const allKeys = allChunks.map((c) => c.key);
  const missing = allKeys.filter((k) => !completedKeys.includes(k));

  const finalReport = {
    event: "ACCOUNT_2_REPORTS_RECOVERY_COMPLETE",
    worklistRange: { from: RANGE_FROM, to: RANGE_TO },
    completedWeeks: completedKeys,
    missingWeeks: missing,
    activeChunk: finalProgress.activeChunk,
    account2: a2,
    account1: a1,
    account1Unchanged:
      a1.count === a1Baseline.count && a1.max === a1Baseline.max,
    duplicates: dups,
    totalReportsHttpRequests: totalHttp,
    wakes: wakeIndex,
    pageReports,
    apiSource: finalProgress.apiSource,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(finalReport, null, 2));
  console.log(JSON.stringify(finalReport, null, 2));

  if (missing.length || finalProgress.activeChunk != null || dups.dupKeys > 0) {
    console.error("COMPLETION_INVARIANTS_FAILED");
    process.exit(8);
  }
  if (!finalReport.account1Unchanged) {
    console.error("ACCOUNT1_CHANGED");
    process.exit(5);
  }
  console.log("ACCOUNT 2 REPORTS RECOVERY: COMPLETE");
}

const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify-only");
const cont = args.includes("--continue");

if (verifyOnly) {
  verifyReadOnly()
    .then((out) => process.exit(out.ok ? 0 : 2))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else if (cont) {
  continueUntilComplete().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.error("Usage: --verify-only | --continue");
  process.exit(1);
}
