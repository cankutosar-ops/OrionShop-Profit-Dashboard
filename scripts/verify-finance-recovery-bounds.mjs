#!/usr/bin/env node
/**
 * Deterministic verification for Account 2 Finance recovery bounds (no live WB).
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

console.log("=== Finance Recovery Bounds Verification ===\n");

check("Rate limit retry parser exists", existsSync("src/lib/wildberries/rate-limit-retry.ts"));
check("Finance recovery coordination exists", existsSync("src/lib/finance-recovery/coordination.ts"));
check("Finance recovery reservation exists", existsSync("src/lib/finance-recovery/reservation.ts"));
check("Finance recovery account lock exists", existsSync("src/lib/finance-recovery/account-lock.ts"));
check("Recovery script exists", existsSync("scripts/run-account2-finance-chunked-recovery.mjs"));

const rateLimit = read("src/lib/wildberries/rate-limit-retry.ts");
check("Parses X-RateLimit-Retry header", /parseRateLimitRetryHeader/.test(rateLimit));
check("resolve429WaitMs prefers server hint", /resolve429WaitMs/.test(rateLimit));

const apiClient = read("src/lib/wildberries/api-client.ts");
check("API client reads X-RateLimit-Retry", /X-RateLimit-Retry/.test(apiClient));
check("API client exposes server retry to context", /lastRateLimitRetryAfterMs/.test(apiClient));
check(
  "All legacy Finance callers fail closed on first 429",
  /isLegacyFinanceReport/.test(apiClient) &&
    /isFinanceDetailRequest/.test(apiClient) &&
    /isFinanceDetailRequest\s*\?\s*1/.test(apiClient)
);
check(
  "Full Finance pagination uses header-aware interval pacing",
  /computeFinancePageWaitMs\(/.test(apiClient) &&
    !/WB_FINANCE_PAGE_DELAY_MS/.test(apiClient)
);

const bounds = read("src/lib/commercial-continuity/execution-bounds.ts");
check("Recovery max retries is 1 (fail closed on first 429)", /FINANCE_RECOVERY_WB_429_MAX_RETRIES = 1/.test(bounds));
check("Verification probe budget defined", /VERIFICATION_WB_429_MAX_RETRIES/.test(bounds));
check("Recovery max pages per wake is 1", /FINANCE_RECOVERY_MAX_PAGES_PER_WAKE = 1/.test(bounds));

const recoveryScript = read("scripts/run-account2-finance-chunked-recovery.mjs");
check("Recovery uses account lock", /acquireFinanceRecoveryAccountLock/.test(recoveryScript));
check("Recovery uses bounded execution context", /runFinanceRecoveryBounded/.test(recoveryScript));
check("Recovery does not use 8-attempt chunk loop", !/MAX_CHUNK_429_ATTEMPTS = 8/.test(recoveryScript));
check("Recovery stops on 429 (no retry storm)", /STOP: Reports 429/.test(recoveryScript) || /STOP: 429/.test(recoveryScript));
check("Recovery supports --probe-only", /probeOnly/.test(recoveryScript));
check("Recovery supports --resume", /--resume/.test(recoveryScript));
check(
  "Recovery persists a pre-request Reports timing gate",
  /reportsLastRequestAt/.test(recoveryScript) &&
    /reportsNextRequestNotBefore/.test(recoveryScript)
);

const accountLock = read("src/lib/finance-recovery/account-lock.ts");
check("Recovery reuses assertSyncNotRunning", /assertSyncNotRunning/.test(accountLock));
check("Recovery honors server retry header", /wb429HonorServerRetry:\s*true/.test(accountLock));

const coordination = read("src/lib/finance-recovery/coordination.ts");
check("Durable recoveryActive flag", /recoveryActive/.test(coordination));
check(
  "Missing rate-limit state initializes a conservative persisted gate",
  /ensureFinanceRequestGate/.test(coordination) &&
    /ensureReportsRequestGate/.test(coordination) &&
    /FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS/.test(coordination)
);
check(
  "Recovery refuses to proceed without persisted Reports timing state",
  /hasReportsRequestTimingState\(progress\)/.test(recoveryScript)
);
const reservation = read("src/lib/finance-recovery/reservation.ts");
check(
  "Production reservation is the deployed env var, not a local JSON file",
  /ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE/.test(reservation) &&
    /isDeployedFinanceRuntime/.test(reservation)
);
check(
  "Deployed Vercel runtime fails closed without the reservation env",
  /isDeployedFinanceRuntime\(\)/.test(reservation) &&
    /Deployed runtime has no usable/.test(reservation)
);
check("Stale recovery lock release", /releaseStaleFinanceRecoveryCoordination/.test(coordination));
check("Concurrent recovery prevention", /Finance recovery already active/.test(coordination));
check(
  "Successful probe resolves to probe_ok not blocked_partial",
  /resolveFinanceRecoveryTerminalStatus/.test(coordination) &&
    /probe_ok/.test(coordination) &&
    /resolveFinanceRecoveryTerminalStatus/.test(recoveryScript)
);

const orch = read("src/services/commercial-continuity-service.ts");
check("CC skips finance when recovery active", /skipped_finance_recovery_active/.test(orch));
check("CC uses isFinanceHistoricalRecoveryActive", /isFinanceHistoricalRecoveryActive/.test(orch));

const verification = read("src/services/sync-verification-audit-service.ts");
check("Verification uses bounded 429 context", /VERIFICATION_WB_429_MAX_RETRIES/.test(verification));
check("Verification probes sequential (not parallel)", !/Promise\.all\(\[\s*\n?\s*api\.fetchOrders/.test(verification));

const classify = read("src/lib/commercial-continuity/classify.ts");
check("computeNextRetryAtPreferServer exists", /computeNextRetryAtPreferServer/.test(classify));

const persist = read("src/lib/commercial-continuity/persist-outcome.ts");
check("Commercial outcome prefers server retry", /computeNextRetryAtPreferServer/.test(persist));

const pkg = read("package.json");
check("probe:account2-finance script", /probe:account2-finance/.test(pkg));

// --- Runtime unit checks ---
const { parseRateLimitRetryHeader, resolve429WaitMs } = await import(
  "../src/lib/wildberries/rate-limit-retry.ts"
);
const { computeNextRetryAtPreferServer } = await import(
  "../src/lib/commercial-continuity/classify.ts"
);

check("parseRateLimitRetryHeader seconds → ms", parseRateLimitRetryHeader("60") === 60_000);
check("parseRateLimitRetryHeader invalid → null", parseRateLimitRetryHeader("abc") === null);
check(
  "resolve429WaitMs uses server when honoring",
  resolve429WaitMs({ honorServerRetry: true, serverRetryMs: 120_000, fallbackWaitMs: 20_000 }) ===
    120_000
);
check(
  "resolve429WaitMs falls back when no header",
  resolve429WaitMs({ honorServerRetry: true, serverRetryMs: null, fallbackWaitMs: 20_000 }) ===
    20_000
);

const now = new Date("2026-08-28T12:00:00.000Z");
const preferServer = computeNextRetryAtPreferServer({
  retryCount: 1,
  baseDelaySeconds: 300,
  maxDelaySeconds: 3600,
  serverRetryAfterMs: 7200_000,
  now,
});
check(
  "next_retry_at not shorter than server hint",
  Date.parse(preferServer) - now.getTime() >= 7200_000
);

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures}`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
