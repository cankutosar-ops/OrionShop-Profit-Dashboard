#!/usr/bin/env node
/**
 * Finance V1 migration safety — no Wildberries HTTP, no DB writes.
 */
import { mkdtempSync, readFileSync, rmSync } from "fs";
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
  assertFinanceV1LiveAllowed,
  assertFinanceV1TokenReady,
  buildFinanceV1DetailedRequest,
  buildFinanceV1ListRequest,
  classifyWbTokenType,
  FINANCE_V1_LIVE_REQUESTS_ENV,
  inspectWbTokenAccessClaims,
  isFinanceV1DetailedEmpty,
  isFinanceV1LiveRequestsEnabled,
  mapFinanceRowsFromV1Detailed,
  nextFinanceV1Cursor,
  normalizeFinanceV1DetailedRow,
  parseFinanceV1Money,
  reconcileFinanceV1ForPayTotals,
  tokenBitSet,
  v1SourceKey,
  WB_FINANCE_V1_DETAILED_PATH,
  WB_FINANCE_V1_LIST_PATH,
  WB_TOKEN_BIT_FINANCE,
  WB_TOKEN_BIT_STATISTICS,
} = await import("../src/lib/wildberries/finance-v1.ts");
const {
  computeFinancePageWaitMs,
  ensureFinanceRequestGate,
  financeRecoveryRequestBlockedUntil,
  isFinanceRecoveryCooldownActive,
  isReportsRecoveryCooldownActive,
  recordFinanceRecovery429Hint,
  recordReportsRecovery429Hint,
  statisticsCooldownDoesNotBlockReports,
  withPersistedFinancePage,
} = await import("../src/lib/finance-recovery/coordination.ts");
const {
  WbApiError,
  isFinanceHttp429Error,
  FINANCE_HTTP_429,
  FINANCE_V1_MISSING_RATE_LIMIT_HEADERS,
} = await import("../src/lib/wildberries/api-client.ts");
const { parseWbRateLimitHeaders } = await import("../src/lib/wildberries/rate-limit-retry.ts");
const { FINANCE_RESERVED_ACCOUNT_IDS } = await import(
  "../src/lib/finance-recovery/reservation.ts"
);

const apiClient = read("src/lib/wildberries/api-client.ts");
const recoveryScript = read("scripts/run-account2-finance-chunked-recovery.mjs");
const syncService = read("src/lib/wildberries/sync-service.ts");
const financeV2 = read("src/lib/wildberries/finance-sync-v2.ts");
const warehouse = read("src/lib/marketplace-adapters/wildberries/warehouse-adapter.ts");
const kpi = read("src/lib/marketplace-adapters/wildberries/kpi-snapshot-sync.ts");
const cc = read("src/services/commercial-continuity-service.ts");
const envExample = read(".env.example");

check(
  "V1 detailed path is official sales-reports/detailed",
  WB_FINANCE_V1_DETAILED_PATH === "/api/finance/v1/sales-reports/detailed"
);
check(
  "V1 list path is official sales-reports/list",
  WB_FINANCE_V1_LIST_PATH === "/api/finance/v1/sales-reports/list"
);

const firstRequest = buildFinanceV1DetailedRequest({
  dateFrom: "2026-06-29",
  dateTo: "2026-07-05",
});
check("First V1 request dateFrom", firstRequest.dateFrom === "2026-06-29");
check("First V1 request dateTo", firstRequest.dateTo === "2026-07-05");
check("First V1 request rrdId=0", firstRequest.rrdId === 0);
check("First V1 request limit=100000", firstRequest.limit === 100000);
check("First V1 request period=weekly", firstRequest.period === "weekly");

const listReq = buildFinanceV1ListRequest({
  dateFrom: "2026-06-29",
  dateTo: "2026-07-05",
});
check("List request period=weekly", listReq.period === "weekly");
check("List request offset=0", listReq.offset === 0);

check("204 / empty array is terminal", isFinanceV1DetailedEmpty([]) === true);
check("204 / null is terminal", isFinanceV1DetailedEmpty(null) === true);
check("Non-empty page is not terminal", isFinanceV1DetailedEmpty([{ rrdId: 1 }]) === false);

const money = parseFinanceV1Money("376.99");
check("String money 376.99 → number", money === 376.99);
check("Comma money 1,50 → number", parseFinanceV1Money("1,50") === 1.5);
check("Numeric money passthrough", parseFinanceV1Money(23.74) === 23.74);
check("Null money → undefined", parseFinanceV1Money(null) === undefined);

const sampleV1 = {
  rrdId: 1232610467,
  reportId: 1234567,
  nmId: 1234567,
  vendorCode: "MAB123",
  rrDate: "2025-10-20",
  saleDt: "2026-03-21T00:00:00Z",
  sellerOperName: "Продажа",
  docTypeName: "Продажа",
  forPay: "376.99",
  ppvzSalesCommission: "23.74",
  deliveryService: "0",
  deliveryAmount: 0,
  paidStorage: "12647.29",
  paidAcceptance: "865",
  acquiringFee: "14.89",
  ppvzReward: "0",
  additionalPayment: "0",
  vw: "22.25",
  rebillLogisticCost: "1.349",
  deduction: "6354",
  penalty: "231.35",
  srid: "0f1c3999172603062979867564654dac5b702849",
  sku: "4600000000000",
  quantity: 1,
  retailAmount: "500.00",
};

const normalized = normalizeFinanceV1DetailedRow(sampleV1);
check("rrdId → rrd_id", normalized.rrd_id === 1232610467);
check("reportId → realizationreport_id", normalized.realizationreport_id === 1234567);
check("nmId → nm_id", normalized.nm_id === 1234567);
check("vendorCode → sa_name", normalized.sa_name === "MAB123");
check("rrDate → rr_dt", normalized.rr_dt === "2025-10-20");
check("saleDt → sale_dt", normalized.sale_dt === "2026-03-21T00:00:00Z");
check("sellerOperName mapped", normalized.supplier_oper_name === "Продажа");
check("docTypeName mapped", normalized.doc_type_name === "Продажа");
check("forPay string → ppvz_for_pay", normalized.ppvz_for_pay === 376.99);
check("paidStorage string → storage_fee", normalized.storage_fee === 12647.29);
check("srid passthrough", normalized.srid === sampleV1.srid);
check("retailAmount mapped when present", normalized.retail_amount === 500);
// deliveryService is the money field; deliveryAmount is a unit count.
// Proven on live Account 2 Reports/V1 rows (2026-09 YTD audit): a row with
// sellerOperName="Логистика" carries deliveryService="223.91" with every other
// money field "0", and across 984 sampled rows every non-zero deliveryAmount is
// exactly 1 (sum == count). Treating deliveryAmount as rubles would value each
// delivery at ₽1; leaving delivery_rub null would drop logistics from P&L.
check(
  "deliveryService string → delivery_rub (money)",
  normalizeFinanceV1DetailedRow({ rrdId: 1, deliveryService: "223.91", deliveryAmount: 1 })
    .delivery_rub === 223.91
);
check(
  "deliveryAmount is never used as rubles",
  normalizeFinanceV1DetailedRow({ rrdId: 1, deliveryAmount: 7 }).delivery_rub == null
);
check(
  "zero deliveryService stays zero, not null",
  normalized.delivery_rub === 0
);

const missingOptional = normalizeFinanceV1DetailedRow({
  rrdId: 9,
  forPay: "10.5",
});
check("Optional V1 fields may be absent", missingOptional.nm_id == null && missingOptional.ppvz_for_pay === 10.5);

let missingRrdThrew = false;
try {
  normalizeFinanceV1DetailedRow({ forPay: "1" });
} catch {
  missingRrdThrew = true;
}
check("Missing rrdId fails closed", missingRrdThrew);

const mapped = mapFinanceRowsFromV1Detailed(sampleV1, null);
const forPayLine = mapped.find((line) => line.wb_source_suffix === "for_pay");
check("V1 maps into wb_finance for_pay line", forPayLine?.amount === 376.99);
check(
  "source_key uses rrd:{rrdId}:{suffix}",
  forPayLine?.source_key === v1SourceKey(1232610467, "for_pay")
);
check("V1 source_key format", v1SourceKey(99, "logistics") === "rrd:99:logistics");
check(
  "Logistics line absent when delivery_rub is zero",
  mapped.every((line) => line.wb_source_suffix !== "logistics")
);
check(
  "Logistics line present when deliveryService carries money",
  (() => {
    // Shape of a real audited Account 2 logistics row.
    const lines = mapFinanceRowsFromV1Detailed(
      {
        rrdId: 3124413294646,
        rrDate: "2026-05-21",
        sellerOperName: "Логистика",
        deliveryService: "223.91",
        deliveryAmount: 1,
      },
      null
    );
    const logistics = lines.filter((l) => l.wb_source_suffix === "logistics");
    return logistics.length === 1 && logistics[0].amount === 223.91;
  })()
);
check(
  "operation_date prefers rrDate",
  forPayLine?.operation_date === "2025-10-20" || forPayLine?.operation_date?.startsWith("2025-10-20")
);

const returnRow = mapFinanceRowsFromV1Detailed(
  {
    rrdId: 42,
    forPay: "10",
    docTypeName: "Возврат",
    sellerOperName: "Возврат",
    rrDate: "2026-07-01",
  },
  null
);
const returnForPay = returnRow.find((l) => l.wb_source_suffix === "for_pay");
check("Return classification signs for_pay negative", returnForPay?.amount === -10);

const reconcileOk = reconcileFinanceV1ForPayTotals({
  listForPaySum: 100,
  detailedForPaySum: 100,
});
check("List vs detailed forPay match", reconcileOk.ok && reconcileOk.status === "match");
const reconcileMissing = reconcileFinanceV1ForPayTotals({
  listForPaySum: null,
  detailedForPaySum: 50,
});
check(
  "List unavailable does not invent match",
  reconcileMissing.status === "list_unavailable" && reconcileMissing.ok === false
);

const page = nextFinanceV1Cursor({
  rows: [{ rrdId: 10 }, { rrdId: 20 }],
  currentRrdId: 0,
});
check("Pagination hasMore when last rrdId advances", page.hasMore === true && page.nextRrdId === 20);
const emptyPage = nextFinanceV1Cursor({ rows: [], currentRrdId: 0 });
check("Empty page is 204-equivalent", emptyPage.isEmpty === true && emptyPage.hasMore === false);

const headers = parseWbRateLimitHeaders(
  new Headers({
    "X-Ratelimit-Remaining": "0",
    "X-Ratelimit-Limit": "1",
    "X-Ratelimit-Reset": "58",
    "X-Ratelimit-Retry": "2",
  })
);
check("Remaining parsed case-insensitively", headers.remaining === 0);
check("Limit parsed", headers.limit === 1);
check("Reset parsed as seconds", headers.resetSeconds === 58);
check("Retry seconds → ms", headers.retryAfterMs === 2000 && headers.retrySeconds === 2);

const missingHeaders = parseWbRateLimitHeaders(new Headers({}));
check(
  "Missing rate-limit headers parse as null (fail-closed at V1 fetch)",
  missingHeaders.remaining == null && missingHeaders.resetSeconds == null
);

const waitFromReset = computeFinancePageWaitMs({
  remaining: 0,
  resetSeconds: 90,
  lastFinanceRequestAtMs: 1_000_000,
  nowMs: 1_000_000,
});
check("Reset Remaining=0 extends wait beyond 70s", waitFromReset >= 90_000);

const remainingMustNotShorten = computeFinancePageWaitMs({
  remaining: 5,
  resetSeconds: 10,
  lastFinanceRequestAtMs: 1_000_000,
  nowMs: 1_000_000,
});
check("Remaining does not shorten the 70s floor", remainingMustNotShorten >= 70_000);

const longResetWait = computeFinancePageWaitMs({
  remaining: 0,
  resetSeconds: 676358,
  lastFinanceRequestAtMs: 1_000_000,
  nowMs: 1_000_000,
});
check(
  "Remaining=0 + 676358s Reset waits the full server window",
  longResetWait >= 676358_000
);

const tmpDir = mkdtempSync(join(tmpdir(), "finance-v1-"));
const tmpGatePath = join(tmpDir, "progress.json");
const blocked = recordFinanceRecovery429Hint({
  progress: { accountId: "2" },
  serverRetryAfterMs: 676358000,
  progressPath: tmpGatePath,
});
check(
  "429 persists serverRetryUntil",
  typeof blocked.serverRetryUntil === "string" &&
    Date.parse(blocked.serverRetryUntil) > Date.now()
);
check(
  "Cooldown uses serverRetryUntil",
  isFinanceRecoveryCooldownActive(blocked, Date.now()) === true
);
check(
  "HTTP 429 classifier accepts structured FINANCE_HTTP_429",
  isFinanceHttp429Error(new WbApiError("WB API error 429: x", 429, "/x", FINANCE_HTTP_429)) === true
);
check(
  "HTTP 200 missing-headers error is NOT classified as 429",
  isFinanceHttp429Error(
    new WbApiError(
      "Finance V1 rate-limit headers missing or ambiguous (Remaining/Reset required) — fail closed, no further request",
      200,
      "/api/finance/v1/sales-reports/detailed",
      FINANCE_V1_MISSING_RATE_LIMIT_HEADERS
    )
  ) === false
);
{
  const tmp429 = mkdtempSync(join(tmpdir(), "reports-429-"));
  const reportsBlocked = recordReportsRecovery429Hint({
    progress: { accountId: "2", serverRetryUntil: "2099-01-01T00:00:00.000Z" },
    serverRetryAfterMs: 120_000,
    progressPath: join(tmp429, "p.json"),
  });
  check(
    "HTTP 429 Reports cooldown writes reportsServerRetryUntil without inventing from missing Reset",
    typeof reportsBlocked.reportsServerRetryUntil === "string" &&
      reportsBlocked.serverRetryUntil === "2099-01-01T00:00:00.000Z"
  );
  rmSync(tmp429, { recursive: true, force: true });
}
check(
  "Reports cooldown ignores legacy V5 serverRetryUntil",
  isReportsRecoveryCooldownActive(
    {
      accountId: "2",
      serverRetryUntil: blocked.serverRetryUntil,
      nextFinanceRequestNotBefore: "2099-01-01T00:00:00.000Z",
    },
    Date.now()
  ) === false
);
check(
  "statisticsCooldownDoesNotBlockReports when Reports gates clear",
  statisticsCooldownDoesNotBlockReports({
    state: {
      accountId: "2",
      serverRetryUntil: "2099-01-01T00:00:00.000Z",
      nextFinanceRequestNotBefore: "2099-01-01T00:00:00.000Z",
    },
    nowMs: Date.now(),
  }) === true
);
check(
  "Blocked-until prefers later of Retry/next",
  financeRecoveryRequestBlockedUntil(blocked, Date.now()) != null
);

const gate = ensureFinanceRequestGate({
  progress: { accountId: "2" },
  progressPath: join(tmpDir, "gate.json"),
  nowMs: 1_700_000_000_000,
});
check("Missing timing state initializes a gate and does not invent headers", gate.initialized === true);
check(
  "Initialized gate leaves lastRateLimitSnapshot null",
  gate.state.lastRateLimitSnapshot == null
);
rmSync(tmpDir, { recursive: true, force: true });

const persisted = withPersistedFinancePage({
  state: {
    accountId: "2",
    activeChunk: {
      key: "2026-06-29:2026-07-05",
      chunkFrom: "2026-06-29",
      chunkTo: "2026-07-05",
      status: "in_progress",
      currentPage: 1,
      lastPersistedRrdId: 0,
      completedPages: [],
    },
  },
  activeChunk: {
    key: "2026-06-29:2026-07-05",
    chunkFrom: "2026-06-29",
    chunkTo: "2026-07-05",
    status: "in_progress",
    currentPage: 1,
    lastPersistedRrdId: 0,
    completedPages: [],
  },
  startRrdId: 0,
  endRrdId: 20,
  apiRows: 2,
  upsertedLines: 4,
});
check(
  "Cursor advances only after persisted page helper",
  persisted.activeChunk?.lastPersistedRrdId === 20 &&
    persisted.activeChunk?.currentPage === 2
);
const unpersistedCursor = {
  lastPersistedRrdId: 0,
  currentPage: 1,
};
check(
  "Crash after API response before persist keeps cursor at rrdId=0",
  unpersistedCursor.lastPersistedRrdId === 0 && unpersistedCursor.currentPage === 1
);

check(
  "V1 sales-reports 429 is fail-closed in api-client",
  /isFinanceV1SalesReports/.test(apiClient) &&
    /isFinanceDetailRequest/.test(apiClient) &&
    /path\.startsWith\("\/api\/finance\/v1\/sales-reports"\)/.test(apiClient)
);
check(
  "fetchFinanceV1ReportPage exists and posts detailed path",
  /async fetchFinanceV1ReportPage\(/.test(apiClient) &&
    /WB_FINANCE_V1_DETAILED_PATH/.test(apiClient) &&
    /assertFinanceV1LiveAllowed\(/.test(apiClient) &&
    /assertFinanceV1TokenReady\(/.test(apiClient)
);
check(
  "V1 fetch processes HTTP 200 body when Reset missing (local min gap)",
  /processing body with local min gap/.test(apiClient) &&
    !/Remaining\/Reset required\) — fail closed, no further request/.test(apiClient)
);
check(
  "Recovery uses Finance V1 page sync — no Statistics v5 syncFinancePage",
  /svc\.syncFinanceV1Page\(/.test(recoveryScript) &&
    !/svc\.syncFinancePage\(/.test(recoveryScript) &&
    !/fetchFinanceReportPage\(/.test(recoveryScript)
);
check(
  "Recovery refuses Statistics v5 fallback in comments/path",
  /no Statistics v5 fallback/i.test(recoveryScript) ||
    /Statistics v5 reportDetailByPeriod is blocked/.test(recoveryScript)
);
check("Recovery maxPagesPerWake default is 1", /MAX_PAGES_PER_WAKE = 1/.test(recoveryScript));
check(
  "Recovery persists reportsLastRequestAt before syncFinanceV1Page",
  recoveryScript.indexOf("progress.reportsLastRequestAt") <
    recoveryScript.indexOf("svc.syncFinanceV1Page(") &&
    recoveryScript.indexOf("saveProgress(progress)") <
      recoveryScript.indexOf("svc.syncFinanceV1Page(")
);
check(
  "syncFinanceV1Page does not advance caller cursor — recovery waits for upsert",
  recoveryScript.indexOf("withPersistedFinancePage({") >
    recoveryScript.indexOf("svc.syncFinanceV1Page(")
);
check(
  "Live env gate runs before progress gate / HTTP",
  recoveryScript.indexOf("assertFinanceV1LiveAllowed()") <
    recoveryScript.indexOf("ensureReportsRequestGate({") &&
    recoveryScript.indexOf("assertFinanceV1TokenReady(") <
      recoveryScript.indexOf("ensureReportsRequestGate({")
);
check(
  "syncFinancePage refuses reserved Account 2 (no v5 fallback)",
  /syncFinanceV1Page/.test(syncService) &&
    /Statistics v5 reportDetailByPeriod is blocked/.test(syncService)
);
check("Account 2 is the only reserved finance account", FINANCE_RESERVED_ACCOUNT_IDS.join(",") === "2");
check(
  "Account 1 is never in the reserved set",
  !FINANCE_RESERVED_ACCOUNT_IDS.includes("1")
);
check(
  "CC, syncFinance, warehouse skip reserved Account 2",
  /skipped_finance_recovery_active/.test(cc) &&
    /skipped_finance_recovery_active/.test(syncService) &&
    /skipped_finance_recovery_active/.test(warehouse)
);
check(
  "finance-sync-v2 and KPI skip reserved Account 2 before Finance HTTP",
  /isFinanceHistoricalRecoveryActive/.test(financeV2) &&
    /skipped_finance_recovery_active/.test(financeV2) &&
    /skipped_finance_recovery_active/.test(kpi)
);
check(
  "Operator CLIs refuse reserved Account 2 Finance",
  /skipped_finance_recovery_active/.test(read("scripts/backfill-finance-history.mjs")) &&
    /skipped_finance_recovery_active/.test(read("scripts/run-finance-chunked-recovery.mjs"))
);
check(
  "Reports week helpers exist",
  /buildReportsWeekState/.test(read("src/lib/finance-recovery/reports-ingestion.ts")) &&
    /buildReportsWeekReconciliation/.test(
      read("src/lib/finance-recovery/reports-ingestion.ts")
    )
);
check(
  "FINANCE_V1_LIVE_REQUESTS_ENABLED documented in .env.example",
  envExample.includes(FINANCE_V1_LIVE_REQUESTS_ENV)
);

check("Official Finance bit is 13", WB_TOKEN_BIT_FINANCE === 13 && tokenBitSet(1 << 12, 13) === true);
check("Official Statistics bit is 5", WB_TOKEN_BIT_STATISTICS === 5 && tokenBitSet(1 << 4, 5) === true);

const personalReady = inspectWbTokenAccessClaims({
  acc: 3,
  for: "self",
  t: false,
  s: (1 << 12) | (1 << 4),
});
check("Personal + Finance bit is V1-ready", personalReady.financeV1Ready === true);
check("Personal token type", personalReady.tokenType === "personal");

const baseClaims = inspectWbTokenAccessClaims({ acc: 1, t: false, s: 1 << 4 });
check("Base token is not V1-ready", baseClaims.financeV1Ready === false);
check("Base classification", classifyWbTokenType({ acc: 1, for: null, t: false }) === "base");
check("Missing bitmask Finance is NOT PROVEN", inspectWbTokenAccessClaims({ acc: 3, for: "self" }).hasFinanceCategory == null);

let baseRejected = false;
try {
  // Minimal JWT: header.payload.sig with Base acc=1 (no network).
  const payload = Buffer.from(JSON.stringify({ acc: 1, t: false, s: 1 << 12 })).toString(
    "base64url"
  );
  assertFinanceV1TokenReady(`eyJhbGciOiJub25lIn0.${payload}.x`);
} catch {
  baseRejected = true;
}
check("Base token rejected before live request", baseRejected);

let liveBlocked = false;
const prevLive = process.env[FINANCE_V1_LIVE_REQUESTS_ENV];
delete process.env[FINANCE_V1_LIVE_REQUESTS_ENV];
try {
  assertFinanceV1LiveAllowed();
} catch {
  liveBlocked = true;
}
check("Live requests disabled by default", liveBlocked && !isFinanceV1LiveRequestsEnabled());
if (prevLive === undefined) delete process.env[FINANCE_V1_LIVE_REQUESTS_ENV];
else process.env[FINANCE_V1_LIVE_REQUESTS_ENV] = prevLive;

const completedChunkGuard = recoveryScript.includes("2026-06-22") && /completedChunks/.test(recoveryScript);
check("Recovery skips completed chunks (Jun 22–28 stay skipped)", completedChunkGuard);

const inspectScript = read("scripts/inspect-account2-finance-v1-readiness.mjs");
check(
  "Token inspect script never calls fetch/WB HTTP",
  !/\bfetch\(/.test(inspectScript) &&
    !/reportDetailByPeriod/.test(inspectScript) &&
    !/sales-reports/.test(inspectScript)
);

if (failures > 0) {
  console.error(`\nFAILED ${failures} Finance V1 migration checks`);
  process.exit(1);
}
console.log("\n=== ALL FINANCE V1 MIGRATION CHECKS PASSED ===");
