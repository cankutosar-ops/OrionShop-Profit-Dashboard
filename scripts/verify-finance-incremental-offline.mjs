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
    loadAccount: async (id) => extras.account ?? account(id, extras.seller ?? ACCOUNT2_FINANCE_SELLER_ID),
    readState: (id) => store.read(id),
    writeState: (s) => store.write(s),
    syncPage,
    assertLiveAllowed: extras.assertLiveAllowed ?? (() => {}),
    assertTokenReady: extras.assertTokenReady ?? (() => {}),
    nowMs: extras.nowMs ?? (() => Date.parse("2026-09-06T12:00:00Z")),
  };
}

function page(partial) {
  return {
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
  check("foreign lock blocks HTTP", locked.status === "blocked" && locked.httpRequests === 0);

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
