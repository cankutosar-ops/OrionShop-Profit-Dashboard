#!/usr/bin/env node
/**
 * Local, resumable 2026 Finance backfill from WB Finance V1 period detail.
 *
 * Default: offline preflight only.
 * --probe: one WB read request plus at most one bounded 429 retry; no Supabase write.
 * --apply: consecutive <=7-day windows, paginated UPSERT to wb_finance;
 * terminal only on HTTP 204 for the current window.
 *
 * No deploy is required.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith("#")) continue;
      const separator = text.indexOf("=");
      if (separator > 0) process.env[text.slice(0, separator).trim()] ??= text.slice(separator + 1).trim();
    }
  }
}
loadEnv();

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APPLY = args.includes("--apply");
const PROBE = args.includes("--probe");
const ACCOUNT_ID = String(valueOf("account", "")).trim();
const FROM = String(valueOf("from", "2026-01-01")).slice(0, 10);
const TO = String(valueOf("to", "2026-09-30")).slice(0, 10);

if (!/^[1-9]\d*$/.test(ACCOUNT_ID)) {
  console.error("FAIL  --account must be a positive marketplace account id");
  process.exit(1);
}
if (APPLY && PROBE) {
  console.error("FAIL  choose either --probe or --apply, not both");
  process.exit(1);
}
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!process.env[name]) {
    console.error(`FAIL  ${name} is required (no WB call or database write was attempted)`);
    process.exit(1);
  }
}

const {
  FINANCE_REPORT_MIN_GAP_MS,
  assertFinance2026Range,
  buildFinanceBackfillWindows,
  runWithSingleFinance429Retry,
} = await import("../src/lib/wildberries/finance-weekly-backfill.ts");
const { isFinanceHttp429Error } = await import("../src/lib/wildberries/api-client.ts");
const { assertFinanceV1PeriodTokenReady } = await import("../src/lib/wildberries/finance-v1.ts");
const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
const { getMarketplaceAccountForSync } = await import("../src/services/marketplace-account-service.ts");

assertFinance2026Range(FROM, TO);
const account = await getMarketplaceAccountForSync(ACCOUNT_ID);
const claims = assertFinanceV1PeriodTokenReady(account.apiKey);
console.log(`account=${ACCOUNT_ID} seller=${account.seller_id ?? "unknown"}`);
console.log(`range=${FROM}..${TO} period=weekly`);
console.log(`token=${claims.tokenType} finance_scope=${claims.hasFinanceCategory === true}`);

if (!APPLY && !PROBE) {
  console.log("DRY RUN — no WB API call, no Supabase write.");
  console.log(
    `Probe command: npm run backfill:finance-2026-weekly -- --account ${ACCOUNT_ID} --from 2026-09-21 --to 2026-09-27 --probe`
  );
  process.exit(0);
}

if (process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED !== "true") {
  console.error("FAIL  FINANCE_V1_LIVE_REQUESTS_ENABLED=true is required for --probe/--apply");
  process.exit(1);
}

const service = await createWbSyncService(ACCOUNT_ID);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const retryNotice = (waitMs) => {
  console.warn(
    `WB Finance 429: ${Math.ceil(waitMs / 1000)} saniye beklenecek; yalnızca bir son deneme yapılacak.`
  );
};
if (PROBE) {
  const { value: page, retryPerformed } = await runWithSingleFinance429Retry({
    operation: () =>
      service.getApiClient().fetchFinanceV1ReportPage(FROM, TO, 0, "weekly"),
    is429: isFinanceHttp429Error,
    sleep,
    onRetry: retryNotice,
  });
  const reportIds = [
    ...new Set(
      page.rows
        .map((row) => Number(row.realizationreport_id))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    ),
  ].sort((a, b) => a - b);
  console.log(
    `PROBE PASS response=${page.responseKind} rows=${page.rows.length} report_ids=${reportIds.join(",") || "none"} report_types=${page.reportTypes.join(",") || "none"}`
  );
  console.log(
    `PROBE ONLY — no Supabase write; retry_performed=${retryPerformed}`
  );
  process.exit(0);
}

const progressDir = resolve("exports/finance-backfill");
const progressPath = resolve(progressDir, `account-${ACCOUNT_ID}-2026-weekly-period.json`);
const windows = buildFinanceBackfillWindows(FROM, TO);
const progress = existsSync(progressPath)
  ? JSON.parse(readFileSync(progressPath, "utf8"))
  : {
      schemaVersion: 2,
      accountId: ACCOUNT_ID,
      from: FROM,
      to: TO,
      period: "weekly",
      windowIndex: 0,
      lastRrdId: 0,
      rowsProcessed: 0,
      linesUpserted: 0,
      reportIds: [],
      reportTypes: [],
      completedWindows: [],
      completed: false,
      startedAt: new Date().toISOString(),
    };
if (progress.accountId !== ACCOUNT_ID || progress.from !== FROM || progress.to !== TO) {
  throw new Error("Progress file belongs to a different account or period");
}
if (progress.schemaVersion !== 2) {
  throw new Error(
    "Legacy progress format refused: move the old progress file aside before the weekly-window backfill"
  );
}
const save = () => {
  mkdirSync(progressDir, { recursive: true });
  progress.updatedAt = new Date().toISOString();
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
};
if (progress.completed) {
  console.log("COMPLETE  progress file already marks this range complete; no API call made.");
  process.exit(0);
}

while (Number(progress.windowIndex ?? 0) < windows.length) {
  const windowIndex = Number(progress.windowIndex ?? 0);
  const window = windows[windowIndex];
  console.log(
    `window ${windowIndex + 1}/${windows.length} ${window.from}..${window.to} rrdId=${Number(progress.lastRrdId ?? 0)}`
  );
  const { value: result, retryPerformed } = await runWithSingleFinance429Retry({
    operation: () =>
      service.syncFinanceV1Page(
        window.from,
        window.to,
        Number(progress.lastRrdId ?? 0),
        "weekly"
      ),
    is429: (valueOrError) => {
      if (isFinanceHttp429Error(valueOrError)) return true;
      if (!valueOrError || typeof valueOrError !== "object") return false;
      const errors = Array.isArray(valueOrError.errors) ? valueOrError.errors : [];
      return errors.some((error) => isFinanceHttp429Error(error));
    },
    sleep,
    onRetry: retryNotice,
  });
  if (retryPerformed) progress.last429RetryAt = new Date().toISOString();
  if (result.errors.length > 0 || result.v1Outcome === "failure") {
    progress.lastError = result.errors.join("; ") || "Finance weekly window failed";
    progress.failedWindow = window;
    save();
    throw new Error(progress.lastError);
  }
  if (result.v1Outcome === "terminal") {
    progress.completedWindows = [
      ...(progress.completedWindows ?? []),
      {
        from: window.from,
        to: window.to,
        completedAt: new Date().toISOString(),
      },
    ];
    progress.windowIndex = windowIndex + 1;
    progress.lastRrdId = 0;
    progress.lastError = null;
    progress.failedWindow = null;
    if (progress.windowIndex >= windows.length) {
      progress.completed = true;
      progress.completedAt = new Date().toISOString();
    }
    save();
    if (!progress.completed) await sleep(FINANCE_REPORT_MIN_GAP_MS);
    continue;
  }
  const next = result.page?.lastRrdId;
  if (!Number.isSafeInteger(next) || next <= Number(progress.lastRrdId ?? 0)) {
    throw new Error("Finance period detail returned a non-advancing rrdId");
  }
  progress.lastRrdId = next;
  progress.rowsProcessed = Number(progress.rowsProcessed ?? 0) + result.recordsProcessed;
  progress.linesUpserted = Number(progress.linesUpserted ?? 0) + result.recordsUpdated;
  progress.reportIds = [
    ...new Set([...(progress.reportIds ?? []), ...(result.reportIds ?? [])]),
  ].sort((a, b) => a - b);
  progress.reportTypes = [
    ...new Set([...(progress.reportTypes ?? []), ...(result.page?.reportTypes ?? [])]),
  ].sort((a, b) => a - b);
  progress.lastError = null;
  save();
  console.log(
    `window=${window.from}..${window.to} rows=${result.recordsProcessed} next_rrd_id=${next} reports=${progress.reportIds.length} types=${progress.reportTypes.join(",") || "unknown"}`
  );
  await sleep(FINANCE_REPORT_MIN_GAP_MS);
}

console.log(
  `COMPLETE  ${progress.completedWindows.length}/${windows.length} weekly windows reached HTTP 204; rows=${progress.rowsProcessed} reports=${progress.reportIds.length} types=${progress.reportTypes.join(",") || "unknown"}`
);
