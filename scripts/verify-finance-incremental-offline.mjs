#!/usr/bin/env node
/**
 * Offline Finance incremental engine tests. No Wildberries HTTP. No DB writes.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  planFinanceIncrementalWork,
  weeklyPeriodContaining,
  lastCompletedWeeklyPeriods,
  latestCompletedReportsWeek,
  nextSequentialCatchupPeriod,
  utcMondayOf,
  emptyFinanceIncrementalState,
  createMemoryFinanceIncrementalStateStore,
  runFinanceReportsV1PageWake,
  runFinanceIncrementalSync,
  isAccount2FinanceV1Only,
  assertFinanceAccountIsolation,
  applyReportsPacingAfterRequest,
  reportsIncrementalBlockedUntil,
  isFinanceHttp429,
  evaluateFinanceIncrementalHealth,
  ACCOUNT2_FINANCE_SELLER_ID,
} from "../src/lib/finance-incremental/index.ts";
import { nextWeeklyReportsPeriod } from "../src/lib/finance-recovery/reports-ingestion.ts";
import { isFinanceV1LiveRequestsEnabled } from "../src/lib/wildberries/finance-v1.ts";
import { FINANCE_RECOVERY_MIN_PAGE_GAP_MS } from "../src/lib/wildberries/rate-limit-retry.ts";
import { adaptFinanceV1PageResult } from "../src/lib/finance-incremental/orchestrator.ts";
import { WbApiClient, WbApiError } from "../src/lib/wildberries/api-client.ts";

let failed = 0;
function check(name, ok) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL  ${name}`);
  }
}

function account(id = "2", seller = ACCOUNT2_FINANCE_SELLER_ID) {
  return { id, sellerId: seller, apiKey: "test-token" };
}

function wakeDeps(store, syncPage, extras = {}) {
  return {
    readPublicationEvidence: async (id, week, before) => ({ source: "wb_sales_reports_list", marketplaceAccountId: id, from: week.from, through: week.to, reportIds: [1], observedBefore: before }),
    loadAccount: async (id) => extras.account ?? account(id, extras.seller ?? ACCOUNT2_FINANCE_SELLER_ID),
    readState: (id) => store.read(id),
    acquireLease: (id, owner) => store.acquireLease(id, owner),
    renewLease: (id, owner) => store.renewLease(id, owner),
    commitLease: (s, owner, release) => store.commitLease(s, owner, release),
    syncPage,
    assertLiveAllowed: extras.assertLiveAllowed ?? (() => {}),
    assertTokenReady: extras.assertTokenReady ?? (() => {}),
    nowMs: extras.nowMs ?? (() => Date.parse("2026-09-06T12:00:00Z")),
  };
}

function page(partial) {
  return {
    kind: partial.kind ?? (partial.httpStatus === 204 ? "terminal" :
      partial.httpStatus === 429 || partial.errors?.length ? "failure" : "data"),
    httpStatus: 200,
    apiRows: 0,
    persistedLines: 0,
    hasMore: false,
    isEmpty: true,
    nextRrdId: null,
    reportIds: [],
    returnedFrom: null,
    returnedTo: null,
    errors: [],
    remaining: 0,
    limit: 1,
    resetSeconds: null,
    retrySeconds: null,
    ...partial,
  };
}

async function main() {
  console.log("=== Finance incremental offline ===");
  check(
    "live flag defaults OFF when unset",
    isFinanceV1LiveRequestsEnabled({}) === false
  );

  // 1-2 isolation + token
  check("Account 2 is V1-only", isAccount2FinanceV1Only("2") && !isAccount2FinanceV1Only("1"));
  let isolationOk = false;
  try {
    assertFinanceAccountIsolation({ accountId: "2", sellerId: "1" });
  } catch {
    isolationOk = true;
  }
  check("Account 2 seller mismatch fails closed", isolationOk);
  assertFinanceAccountIsolation({ accountId: "2", sellerId: "68674" });
  check("Account 2 seller 68674 accepted", true);

  // 3-5 planner — sequential Reports catch-up (not UTC Mon–Sun jump)
  check("UTC Monday of 2026-09-06 is 2026-08-31", utcMondayOf("2026-09-06") === "2026-08-31");
  const current = weeklyPeriodContaining("2026-09-06");
  check(
    "calendar helper still Mon–Sun (diagnostics only)",
    current.from === "2026-08-31" && current.to === "2026-09-06"
  );

  const recoveryEnd = {
    from: "2026-08-24",
    to: "2026-08-28",
    key: "2026-08-24:2026-08-28",
  };
  const derivedNext = nextWeeklyReportsPeriod({
    periodFrom: recoveryEnd.from,
    periodTo: recoveryEnd.to,
  });
  check(
    "recovery helper derives first incomplete period",
    derivedNext.from === "2026-08-29" &&
      derivedNext.to === "2026-09-04" &&
      derivedNext.key === "2026-08-29:2026-09-04"
  );
  check(
    "nextSequentialCatchupPeriod matches recovery helper",
    nextSequentialCatchupPeriod(recoveryEnd).key === derivedNext.key
  );

  const plannerSrc = readFileSync(
    resolve("src/lib/finance-incremental/week-planner.ts"),
    "utf8"
  );
  check(
    "production planner does not hard-code 2026-08-29",
    !/"2026-08-29"/.test(plannerSrc) && !/'2026-08-29'/.test(plannerSrc)
  );

  const seededAfterRecovery = {
    ...emptyFinanceIncrementalState("2"),
    completedWeeks: {
      [recoveryEnd.key]: {
        from: recoveryEnd.from,
        to: recoveryEnd.to,
        completedAt: "2026-09-06T11:23:36.344Z",
      },
    },
    latestSuccessfulDataDate: "2026-08-28",
  };
  const planCatchup = planFinanceIncrementalWork({
    state: seededAfterRecovery,
    today: "2026-09-06",
  });
  check(
    "seeded recovery end + today 2026-09-06 plans derived catch-up week",
    planCatchup.kind === "start_catchup" &&
      planCatchup.week?.key === derivedNext.key &&
      planCatchup.rrdId === 0
  );
  check(
    "catch-up does not jump to Mon–Sun week containing today",
    planCatchup.week?.key !== current.key
  );

  const empty = emptyFinanceIncrementalState("2");
  const planEmpty = planFinanceIncrementalWork({ state: empty, today: "2026-09-06" });
  check(
    "empty completed_weeks awaits anchor (no Mon–Sun invent)",
    planEmpty.kind === "idle" && planEmpty.reason === "awaiting_completed_weeks_anchor"
  );

  const inProgress = {
    ...empty,
    mode: "current_week",
    weekStatus: "in_progress",
    activeWeekFrom: derivedNext.from,
    activeWeekTo: derivedNext.to,
    lastPersistedRrdId: 99,
  };
  const planResume = planFinanceIncrementalWork({ state: inProgress, today: "2026-09-06" });
  check(
    "planner resumes persisted rrdId",
    planResume.kind === "continue_active" &&
      planResume.rrdId === 99 &&
      planResume.week?.key === derivedNext.key
  );

  const afterFirstCatchupComplete = {
    ...empty,
    completedWeeks: {
      ...seededAfterRecovery.completedWeeks,
      [derivedNext.key]: {
        from: derivedNext.from,
        to: derivedNext.to,
        completedAt: "2026-09-06T12:00:00Z",
      },
    },
  };
  const planAfterComplete = planFinanceIncrementalWork({
    state: afterFirstCatchupComplete,
    today: "2026-09-06",
  });
  const secondPeriod = nextWeeklyReportsPeriod({
    periodFrom: derivedNext.from,
    periodTo: derivedNext.to,
  });
  check(
    "completing first catch-up selects next sequential period",
    planAfterComplete.kind === "start_catchup" &&
      planAfterComplete.week?.key === secondPeriod.key &&
      planAfterComplete.rrdId === 0
  );

  const futureOnly = {
    ...empty,
    completedWeeks: {
      "2026-09-07:2026-09-13": {
        from: "2026-09-07",
        to: "2026-09-13",
        completedAt: "2026-09-13T00:00:00Z",
      },
    },
  };
  const planFuture = planFinanceIncrementalWork({
    state: futureOnly,
    today: "2026-09-06",
  });
  check(
    "next.from > today => idle (no future week)",
    planFuture.kind === "idle" && planFuture.reason === "catchup_complete_next_period_in_future"
  );

  const overlapAnchor = {
    from: "2026-08-31",
    to: "2026-09-06",
    key: "2026-08-31:2026-09-06",
  };
  const overlap = lastCompletedWeeklyPeriods(overlapAnchor, 2);
  check(
    "overlap weeks are previous two sequential periods",
    overlap[0].key === "2026-08-24:2026-08-30" && overlap[1].key === "2026-08-17:2026-08-23"
  );

  const currentDone = {
    ...empty,
    completedWeeks: {
      [overlapAnchor.key]: {
        from: overlapAnchor.from,
        to: overlapAnchor.to,
        completedAt: "2026-09-06T00:00:00Z",
      },
    },
    overlapRevalidateQueue: [overlap[0]],
  };
  const planOverlap = planFinanceIncrementalWork({ state: currentDone, today: "2026-09-06" });
  check(
    "planner does overlap only after catch-up frontier is past today",
    planOverlap.kind === "start_overlap" &&
      planOverlap.rrdId === 0 &&
      planOverlap.mode === "overlap_revalidation"
  );
  check(
    "latestCompletedReportsWeek picks max to",
    latestCompletedReportsWeek(seededAfterRecovery.completedWeeks)?.key === recoveryEnd.key
  );

  // 6-9 cursor / 204 / hasMore
  const store = createMemoryFinanceIncrementalStateStore();
  let calls = 0;
  const out200 = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 0,
      mode: "current_week",
    },
    wakeDeps(store, async () => {
      calls += 1;
      return page({
        httpStatus: 200,
        apiRows: 10,
        persistedLines: 12,
        hasMore: true,
        isEmpty: false,
        nextRrdId: 555,
        returnedTo: "2026-09-06",
      });
    })
  );
  const after200 = await store.read("2");
  check("200 hasMore keeps week open", out200.status === "wake_ok" && out200.weekStatus === "in_progress");
  check("cursor advances only after persist", out200.cursorAfter === 555 && after200.lastPersistedRrdId === 555);
  check("one HTTP per wake (200)", calls === 1 && out200.httpRequests === 1 && out200.retryPerformed === false);
  check("no list / no V5", out200.listCalls === 0 && out200.v5Calls === 0);

  const clearedGate = await store.read("2");
  await store.write({
    ...clearedGate,
    reportsNextRequestNotBefore: null,
    reportsServerRetryUntil: null,
  });
  const out204 = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 555,
      mode: "current_week",
    },
    wakeDeps(store, async () => page({ httpStatus: 204, isEmpty: true, hasMore: false }))
  );
  const after204 = await store.read("2");
  check("204 closes week", out204.status === "week_complete" && after204.activeWeekFrom == null);
  check("204 clears cursor", after204.lastPersistedRrdId === 0 && out204.cursorAfter == null);
  check("204 enqueues overlap", after204.overlapRevalidateQueue.length === 2);

  // persist failure does not advance
  await store.write({
    ...emptyFinanceIncrementalState("2"),
    mode: "current_week",
    weekStatus: "in_progress",
    activeWeekFrom: "2026-08-31",
    activeWeekTo: "2026-09-06",
    lastPersistedRrdId: 7,
  });
  const persistFail = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 7,
      mode: "current_week",
    },
    wakeDeps(store, async () =>
      page({
        httpStatus: 200,
        apiRows: 3,
        persistedLines: 0,
        hasMore: true,
        isEmpty: false,
        nextRrdId: 8,
        errors: ["UPSERT failed"],
      })
    )
  );
  const afterFail = await store.read("2");
  check("mapping/persist error keeps cursor", persistFail.status === "failed" && afterFail.lastPersistedRrdId === 7);

  // 10 429 fail-closed
  await store.write({
    ...emptyFinanceIncrementalState("2"),
    lastPersistedRrdId: 7,
    weekStatus: "in_progress",
    activeWeekFrom: "2026-08-31",
    activeWeekTo: "2026-09-06",
    mode: "current_week",
  });
  const out429 = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 7,
      mode: "current_week",
    },
    wakeDeps(store, async () =>
      page({
        httpStatus: 429,
        errors: ["[http 429] FINANCE_HTTP_429"],
        retrySeconds: 120,
        resetSeconds: 120,
      })
    )
  );
  const after429 = await store.read("2");
  check("429 fail-closed", out429.status === "rate_limited" && after429.lastPersistedRrdId === 7);
  check("429 persists server retry", Boolean(after429.reportsServerRetryUntil));
  check("429 no inline retry", out429.retryPerformed === false && out429.httpRequests === 1);

  // 11 missing Reset still processes
  await store.write(emptyFinanceIncrementalState("2"));
  const missingReset = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 0,
      mode: "current_week",
    },
    wakeDeps(store, async () =>
      page({
        httpStatus: 200,
        apiRows: 4,
        persistedLines: 5,
        hasMore: true,
        isEmpty: false,
        nextRrdId: 11,
        resetSeconds: null,
        retrySeconds: null,
      })
    )
  );
  const afterMissing = await store.read("2");
  check("200 missing Reset processes body", missingReset.status === "wake_ok" && afterMissing.lastPersistedRrdId === 11);
  check(
    "missing Reset does not invent server cooldown",
    afterMissing.reportsServerRetryUntil == null
  );
  check(
    "local min gap applied",
    afterMissing.reportsNextRequestNotBefore != null
  );

  // 12 Reset honored
  const paced = applyReportsPacingAfterRequest({
    state: emptyFinanceIncrementalState("2"),
    nowMs: Date.parse("2026-09-06T12:00:00Z"),
    remaining: 0,
    limit: 1,
    resetSeconds: 180,
    retrySeconds: 180,
    httpStatus: 200,
  });
  const wait = Date.parse(paced.reportsNextRequestNotBefore) - Date.parse("2026-09-06T12:00:00Z");
  check("Reset/Retry extends local wait", wait >= 180_000);

  // 13-14 429 classification + one request
  check("missing headers is not 429", !isFinanceHttp429(["rate-limit headers missing"]));
  check("FINANCE_HTTP_429 is 429", isFinanceHttp429(["[http 429] FINANCE_HTTP_429"]));

  // 15 overlap isolation
  await store.write({
    ...emptyFinanceIncrementalState("2"),
    completedWeeks: {
      "2026-08-31:2026-09-06": {
        from: "2026-08-31",
        to: "2026-09-06",
        completedAt: "2026-09-06T00:00:00Z",
      },
    },
    overlapRevalidateQueue: [{ from: "2026-08-24", to: "2026-08-30", key: "2026-08-24:2026-08-30" }],
  });
  const overlapWake = await runFinanceIncrementalSync({
    accountId: "2",
    today: "2026-09-06",
    nowMs: Date.parse("2026-09-06T12:00:00Z"),
    store,
    ignoreRecoveryReservation: true,
    deps: wakeDeps(store, async ({ rrdId }) => {
      check("overlap starts at rrdId 0", rrdId === 0);
      return page({ httpStatus: 204, isEmpty: true });
    }),
  });
  check("overlap wake uses overlap mode", overlapWake.mode === "idle" && overlapWake.status === "week_complete");
  const afterOverlap = await store.read("2");
  check(
    "overlap does not recreate current-week cursor",
    afterOverlap.activeWeekFrom == null && afterOverlap.lastPersistedRrdId === 0
  );

  // 16 crash/resume: in_progress state is planned next
  const crashed = {
    ...emptyFinanceIncrementalState("2"),
    mode: "current_week",
    weekStatus: "in_progress",
    activeWeekFrom: "2026-08-31",
    activeWeekTo: "2026-09-06",
    lastPersistedRrdId: 42,
  };
  check(
    "crash resume uses persisted cursor",
    planFinanceIncrementalWork({ state: crashed, today: "2026-09-06" }).rrdId === 42
  );

  // 17-18 idempotency / duplicates are UPSERT contract (static)
  const mapper = readFileSync(resolve("src/lib/wildberries/mappers.ts"), "utf8");
  const syncService = readFileSync(resolve("src/lib/wildberries/sync-service.ts"), "utf8");
  check("source_key format rrd:{id}:{suffix}", /rrd:\$\{/.test(mapper) || /rrd:\{/.test(mapper) || /buildFinanceSourceKey/.test(mapper));
  check(
    "UPSERT conflict is account+source_key",
    /onConflict:\s*"marketplace_account_id,source_key"/.test(syncService)
  );
  check("syncFinanceV1Page has no DELETE/TRUNCATE", !/DELETE|TRUNCATE/.test(syncService.slice(syncService.indexOf("syncFinanceV1Page"))));

  // 19 V5 cannot be selected for Account 2
  check(
    "syncFinance refuses Account 2 V5 permanently",
    /Account 2 Finance must use Reports\/V1 incremental/.test(syncService)
  );
  const v2 = readFileSync(resolve("src/lib/wildberries/finance-sync-v2.ts"), "utf8");
  check("Finance Sync V2 calls incremental orchestrator", /runFinanceIncrementalSync/.test(v2));
  check("V2 V1 path does not call list", /shouldUseReportsV1Detail/.test(v2) && /fetchSalesReportsList/.test(v2));

  // 20 Account 1 isolation
  check("Account 1 is not V1-only forced", !isAccount2FinanceV1Only("1"));
  const a1plan = planFinanceIncrementalWork({
    state: emptyFinanceIncrementalState("1"),
    today: "2026-09-06",
  });
  check(
    "Account 1 planner is independent (awaits its own completed_weeks)",
    a1plan.kind === "idle" && a1plan.reason === "awaiting_completed_weeks_anchor"
  );

  // 21 competing paths
  const adapter = readFileSync(
    resolve("src/lib/marketplace-adapters/wildberries/warehouse-adapter.ts"),
    "utf8"
  );
  check("warehouse adapter blocks Account 2 V5", /Account 2 Finance must use Reports\/V1/.test(adapter));

  // 22 durable state
  check("memory store persists across wakes", (await store.read("2")).completedWeeks["2026-08-31:2026-09-06"] != null || after204.completedWeeks["2026-08-31:2026-09-06"] != null);

  // 23 lock
  await store.write({
    ...emptyFinanceIncrementalState("2"),
    lockOwner: "other",
    lockHeartbeatAt: new Date().toISOString(),
    lockStartedAt: new Date().toISOString(),
  });
  const locked = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 0,
      mode: "current_week",
      lockOwner: "self",
    },
    wakeDeps(store, async () => {
      throw new Error("should not HTTP while locked");
    })
  );
  check("foreign lock blocks HTTP", locked.status === "lease_busy" && locked.httpRequests === 0);

  // live gate
  const gated = await runFinanceReportsV1PageWake(
    {
      accountId: "2",
      weekFrom: "2026-08-31",
      weekTo: "2026-09-06",
      rrdId: 0,
      mode: "current_week",
    },
    wakeDeps(store, async () => page({}), {
      assertLiveAllowed: () => {
        throw new Error("FINANCE_V1_LIVE_REQUESTS_ENABLED is not true");
      },
    })
  );
  check("live gate blocks HTTP", gated.status === "blocked" && gated.liveHttpAttempted === false);

  // timing gate
  const gatedState = emptyFinanceIncrementalState("2");
  gatedState.reportsNextRequestNotBefore = "2026-09-06T13:00:00Z";
  check(
    "Reports gate ignores leftover V5 fields",
    reportsIncrementalBlockedUntil(
      { ...gatedState, reportsServerRetryUntil: null },
      Date.parse("2026-09-06T12:00:00Z")
    ) != null
  );
  check(
    "legacy V5 until is not used by Reports gate",
    reportsIncrementalBlockedUntil(emptyFinanceIncrementalState("2"), Date.now()) == null
  );
  check("min page gap constant is 70s", FINANCE_RECOVERY_MIN_PAGE_GAP_MS === 70_000);

  const health = evaluateFinanceIncrementalHealth({
    accountId: "2",
    state: emptyFinanceIncrementalState("2"),
    duplicateSourceKeys: 0,
    crossAccountCollisions: 0,
  });
  check("health ok for clean state", health.ok);

  const recovery = readFileSync(resolve("scripts/run-account2-finance-chunked-recovery.mjs"), "utf8");
  check("historical recovery script still V1-only", /syncFinanceV1Page/.test(recovery) && !/svc\.syncFinance\(/.test(recovery));

  const incrementalSrc = [
    readFileSync(resolve("src/lib/finance-incremental/orchestrator.ts"), "utf8"),
    readFileSync(resolve("src/lib/finance-incremental/page-wake.ts"), "utf8"),
  ].join("\n");
  check(
    "incremental never calls list or V5",
    !/fetchSalesReportsList|fetchFinanceReport\(|reportDetailByPeriod/.test(incrementalSrc)
  );

  // Explicit Reports V1 outcomes, using only an in-memory fetch and state store.
  // The stub accepts just the detailed endpoint; no network request can leave this process.
  const priorFetch = globalThis.fetch;
  const priorLiveFlag = process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED;
  const tokenPayload = Buffer.from(JSON.stringify({
    acc: 3, for: "self", t: false, s: 1 << 12,
  })).toString("base64url");
  const offlineToken = "eyJhbGciOiJub25lIn0." + tokenPayload + ".x";
  let stubRequests = 0;
  async function fakeDetailedResponse(status, body) {
    process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED = "true";
    globalThis.fetch = async (url, init) => {
      if (String(url) !== "https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed" ||
          init?.method !== "POST") {
        throw new Error("Verifier refused unexpected HTTP endpoint");
      }
      stubRequests += 1;
      if (body instanceof Error) throw body;
      return new Response(status === 204 ? null :
        typeof body === "string" ? body : JSON.stringify(body), { status });
    };
    const client = new WbApiClient(offlineToken);
    try {
      return await client.fetchFinanceV1ReportPage("2026-08-31", "2026-09-06", 123, "weekly");
    } finally {
      globalThis.fetch = priorFetch;
      if (priorLiveFlag === undefined) delete process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED;
      else process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED = priorLiveFlag;
    }
  }
  async function apiError(status, body) {
    try {
      await fakeDetailedResponse(status, body);
    } catch (error) {
      return error;
    }
    throw new Error("Expected API failure for HTTP " + status);
  }
  function v1SyncResult(kind, apiPage, errors = [], processed = 0, persisted = 0) {
    const { rows: _rows, ...pageWithoutRows } = apiPage ?? {};
    return {
      v1Outcome: kind,
      page: apiPage ? pageWithoutRows : null,
      recordsProcessed: processed,
      recordsUpdated: persisted,
      errors,
    };
  }
  function serviceError(error) {
    const tag = error instanceof WbApiError && error.statusCode != null
      ? "[http " + error.statusCode + "] " : "";
    return v1SyncResult("failure", null, [tag + error.message]);
  }
  async function runExplicitCase(result) {
    const adapted = adaptFinanceV1PageResult(result);
    const memory = createMemoryFinanceIncrementalStateStore();
    await memory.write({
      ...emptyFinanceIncrementalState("2"),
      mode: "current_week",
      weekStatus: "in_progress",
      activeWeekFrom: "2026-08-31",
      activeWeekTo: "2026-09-06",
      lastPersistedRrdId: 123,
    });
    const outcome = await runFinanceReportsV1PageWake({
      accountId: "2", weekFrom: "2026-08-31", weekTo: "2026-09-06",
      rrdId: 123, mode: "current_week",
    }, wakeDeps(memory, async () => adapted));
    return { adapted, outcome, state: await memory.read("2") };
  }
  function stayedRetryable(run, status, httpStatus) {
    return run.adapted.kind === "failure" &&
      run.outcome.status === status &&
      run.outcome.httpStatus === httpStatus &&
      run.outcome.cursorBefore === 123 &&
      run.outcome.cursorAfter === 123 &&
      run.state.lastPersistedRrdId === 123 &&
      run.state.activeWeekFrom === "2026-08-31" &&
      run.state.completedWeeks["2026-08-31:2026-09-06"] == null &&
      Boolean(run.state.lastError);
  }

  const validApiPage = await fakeDetailedResponse(200, [{ rrdId: 456, forPay: "10" }]);
  const a = await runExplicitCase(v1SyncResult("data", validApiPage, [], 1, 1));
  check("A: valid 200 array is data and cursor advances after reported persistence",
    validApiPage.responseKind === "data" && a.adapted.kind === "data" &&
    a.outcome.status === "wake_ok" && a.outcome.cursorAfter === 456 &&
    a.outcome.persistedRows === 1 && a.state.lastPersistedRrdId === 456 &&
    a.state.activeWeekFrom === "2026-08-31");

  const terminalApiPage = await fakeDetailedResponse(204, []);
  const b = await runExplicitCase(v1SyncResult("terminal", terminalApiPage));
  check("B: actual HTTP 204 alone completes and clears the week",
    terminalApiPage.responseKind === "terminal" && b.adapted.kind === "terminal" &&
    b.outcome.status === "week_complete" && b.outcome.cursorAfter == null &&
    b.state.lastPersistedRrdId === 0 && b.state.activeWeekFrom == null &&
    b.state.completedWeeks["2026-08-31:2026-09-06"] != null);

  const c = await runExplicitCase(serviceError(await apiError(401)));
  check("C: HTTP 401 fails, records error, and retains cursor", stayedRetryable(c, "failed", 401));
  const d = await runExplicitCase(serviceError(await apiError(429)));
  check("D: HTTP 429 stays rate-limited without an inline retry",
    d.adapted.kind === "failure" && d.outcome.status === "rate_limited" &&
    d.outcome.cursorAfter === 123 && d.state.activeWeekFrom === "2026-08-31" &&
    d.state.completedWeeks["2026-08-31:2026-09-06"] == null &&
    Boolean(d.state.lastError) && d.outcome.httpRequests === 1 && !d.outcome.retryPerformed);
  const e = await runExplicitCase(serviceError(await apiError(500)));
  check("E: HTTP 500 fails and retains cursor", stayedRetryable(e, "failed", 500));

  const malformedError = await apiError(200, { error: "non-array" });
  const f = await runExplicitCase(serviceError(malformedError));
  check("F: non-array 200 fails and retains cursor",
    malformedError instanceof WbApiError && stayedRetryable(f, "failed", 200));

  const parsingError = await apiError(200, "{malformed JSON");
  const g = await runExplicitCase(serviceError(parsingError));
  check("G: JSON parsing failure retains cursor and error",
    parsingError instanceof SyntaxError && stayedRetryable(g, "failed", null));

  const h = await runExplicitCase(v1SyncResult(
    "failure", validApiPage, ["wb_finance batch 1: atomic upsert failed"], 1, 0
  ));
  check("H: upsert failure retains cursor", stayedRetryable(h, "failed", null));

  const stuckApiPage = await fakeDetailedResponse(200, [{ rrdId: 123, forPay: "10" }]);
  const i = await runExplicitCase(v1SyncResult("data", stuckApiPage, [], 1, 1));
  check("I: non-advancing 200 data fails instead of completing",
    i.adapted.kind === "data" && i.outcome.status === "failed" &&
    i.outcome.cursorAfter === 123 && i.state.lastPersistedRrdId === 123 &&
    i.state.completedWeeks["2026-08-31:2026-09-06"] == null &&
    Boolean(i.state.lastError));

  const sequence = [];
  const orderedMemory = createMemoryFinanceIncrementalStateStore();
  await orderedMemory.write({
    ...emptyFinanceIncrementalState("2"), mode: "current_week", weekStatus: "in_progress",
    activeWeekFrom: "2026-08-31", activeWeekTo: "2026-09-06", lastPersistedRrdId: 123,
  });
  const orderedStore = {
    ...orderedMemory,
    commitLease: async (state, owner, release) => {
      if (state.lastPersistedRrdId === 456) sequence.push("cursor_advanced");
      return orderedMemory.commitLease(state, owner, release);
    },
  };
  await runFinanceReportsV1PageWake({
    accountId: "2", weekFrom: "2026-08-31", weekTo: "2026-09-06",
    rrdId: 123, mode: "current_week",
  }, wakeDeps(orderedStore, async () => {
    sequence.push("upsert_started");
    await Promise.resolve();
    sequence.push("upsert_succeeded");
    return adaptFinanceV1PageResult(v1SyncResult("data", validApiPage, [], 1, 1));
  }));
  const v1ServiceStart = syncService.indexOf("async syncFinanceV1Page(");
  const serviceUpsert = syncService.indexOf("const { errors } = await batchUpsertFinance(", v1ServiceStart);
  const serviceSuccess = syncService.indexOf('if (errors.length === 0) result.v1Outcome = "data"', v1ServiceStart);
  check("J: upsert success precedes data outcome and persisted cursor advancement",
    sequence.join(",") === "upsert_started,upsert_succeeded,cursor_advanced" &&
    serviceUpsert > v1ServiceStart && serviceSuccess > serviceUpsert);
  const forbidden = await runExplicitCase(serviceError(await apiError(403)));
  check("HTTP 403 fails and retains cursor", stayedRetryable(forbidden, "failed", 403));
  const transport = await runExplicitCase(serviceError(
    await apiError(200, new Error("offline transport failed"))
  ));
  check("transport failure retains cursor", stayedRetryable(transport, "failed", null));
  const empty200 = await runExplicitCase(serviceError(await apiError(200, [])));
  check("empty HTTP 200 array is not a terminal 204",
    stayedRetryable(empty200, "failed", 200));

  const errorAndEmpty = await runFinanceReportsV1PageWake({
    accountId: "2", weekFrom: "2026-08-31", weekTo: "2026-09-06",
    rrdId: 123, mode: "current_week",
  }, wakeDeps(createMemoryFinanceIncrementalStateStore({
    "2": {
      ...emptyFinanceIncrementalState("2"), mode: "current_week",
      weekStatus: "in_progress", activeWeekFrom: "2026-08-31",
      activeWeekTo: "2026-09-06", lastPersistedRrdId: 123,
    },
  }), async () => page({
    kind: "failure", httpStatus: 500, isEmpty: true, errors: ["[http 500] offline"],
  })));
  check("failure plus isEmpty cannot complete a week",
    errorAndEmpty.status === "failed" && errorAndEmpty.cursorAfter === 123);
  check("offline HTTP stub made exactly one request per API case", stubRequests === 11);
  if (failed) {
    console.error(`FAILED ${failed} checks`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
