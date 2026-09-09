#!/usr/bin/env node
/**
 * Account 1 → Reports/V1 migration guarantees.
 *
 * Offline and deterministic: the Reports/V1 kernel is driven through injected
 * deps and an in-memory state store, so no Wildberries HTTP and no Supabase
 * write happens here. Static source assertions cover the properties that are
 * structural rather than observable at runtime (no date-range delete, upsert
 * conflict target, dashboard staying warehouse-only, engine formulas untouched).
 *
 * Usage: npx tsx scripts/verify-account1-reports-v1-migration.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { financeV1AllowlistedAccountIds, isFinanceV1AllowlistedAccount } =
  await import("../src/lib/wildberries/finance-v1.ts");
const { planFinanceIncrementalWork, emptyFinanceIncrementalState } = await import(
  "../src/lib/finance-incremental/week-planner.ts"
);
const { runFinanceIncrementalSync } = await import(
  "../src/lib/finance-incremental/orchestrator.ts"
);
const { createMemoryFinanceIncrementalStateStore } = await import(
  "../src/lib/finance-incremental/state.ts"
);
const { buildFinanceSourceKey } = await import("../src/lib/wildberries/mappers.ts");
const { ACCOUNT2_FINANCE_SELLER_ID } = await import(
  "../src/lib/finance-incremental/types.ts"
);

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const read = (rel) => readFileSync(resolve(rel), "utf8");

const A1 = "1";
const A2 = "2";
const A3 = "3";
const ANCHOR = { from: "2026-08-24", to: "2026-08-30" };
const ANCHOR_KEY = `${ANCHOR.from}:${ANCHOR.to}`;
const TODAY = "2026-09-09";

function seededState(accountId, anchor = ANCHOR) {
  return {
    ...emptyFinanceIncrementalState(accountId),
    completedWeeks: {
      [`${anchor.from}:${anchor.to}`]: {
        from: anchor.from,
        to: anchor.to,
        completedAt: "2026-09-09T00:00:00.000Z",
        lastRevalidatedAt: null,
      },
    },
    latestSuccessfulDataDate: anchor.to,
  };
}

/** Records every page request and every row the kernel would persist. */
function makeDeps(store, opts = {}) {
  const calls = [];
  const persisted = [];
  return {
    deps: {
      loadAccount: async (accountId) => ({
        id: String(accountId),
        sellerId: opts.sellerId ?? null,
        apiKey: "test-token",
      }),
      readState: (accountId) => store.read(accountId),
      writeState: (state) => store.write(state),
      syncPage: async (input) => {
        calls.push({ ...input });
        const rows = opts.rowsFor?.(input) ?? [];
        for (const r of rows) {
          persisted.push({
            marketplace_account_id: String(input.accountId),
            source_key: buildFinanceSourceKey(r.rrdId, r.suffix),
          });
        }
        return {
          httpStatus: rows.length ? 200 : 204,
          apiRows: rows.length,
          persistedLines: rows.length,
          hasMore: false,
          isEmpty: rows.length === 0,
          nextRrdId: null,
          reportIds: [],
          returnedFrom: input.weekFrom,
          returnedTo: input.weekTo,
          errors: [],
          remaining: 100,
          limit: 100,
          resetSeconds: 0,
          retrySeconds: 0,
        };
      },
      assertLiveAllowed: () => {},
      assertTokenReady: () => {},
      nowMs: () => Date.parse(`${TODAY}T09:00:00Z`),
    },
    calls,
    persisted,
  };
}

console.log("=== Account 1 → Reports/V1 migration ===\n");

// ---------------------------------------------------------------- A, B, C
console.log("--- gate selection ---");
{
  const env = { FINANCE_V1_ACCOUNT_IDS: "1", FINANCE_V1_LIVE_REQUESTS_ENABLED: "true" };
  check(
    "A. Account 1 is selected for Reports/V1 when allowlisted",
    isFinanceV1AllowlistedAccount(A1, env)
  );
  check(
    "C. a non-enabled account does not silently switch",
    !isFinanceV1AllowlistedAccount(A3, env),
    "account 3 absent from FINANCE_V1_ACCOUNT_IDS"
  );
  check(
    "C. empty allowlist migrates nobody",
    financeV1AllowlistedAccountIds({}).size === 0 &&
      !isFinanceV1AllowlistedAccount(A1, {}),
    "unset FINANCE_V1_ACCOUNT_IDS -> no account switches"
  );
  check(
    "C. malformed ids are ignored rather than coerced",
    financeV1AllowlistedAccountIds({ FINANCE_V1_ACCOUNT_IDS: "0,-1,abc, 1 " }).size === 1 &&
      isFinanceV1AllowlistedAccount(A1, { FINANCE_V1_ACCOUNT_IDS: "0,-1,abc, 1 " })
  );
}

// Account 2 must keep selecting V1 through its own unconditional path, i.e.
// independently of the allowlist and of the live flag.
{
  const src = read("src/lib/wildberries/finance-sync-v2.ts");
  const fn = src.slice(
    src.indexOf("function shouldUseReportsV1Detail"),
    src.indexOf("function shouldUseReportsV1Detail") + 700
  );
  const a2First =
    fn.indexOf("isAccount2FinanceV1Only") > -1 &&
    fn.indexOf("isAccount2FinanceV1Only") < fn.indexOf("isFinanceV1AllowlistedAccount");
  check(
    "B. Account 2 still selects Reports/V1 before any allowlist check",
    a2First,
    "isAccount2FinanceV1Only short-circuits first"
  );
  check(
    "B. Account 2 selection does not depend on the allowlist env",
    !isFinanceV1AllowlistedAccount(A2, {}) && a2First,
    "unconditional path, so an empty allowlist cannot demote it"
  );
}

// ---------------------------------------------------------------- D
console.log("\n--- missing state fails closed ---");
{
  const plan = planFinanceIncrementalWork({
    state: emptyFinanceIncrementalState(A1),
    today: TODAY,
  });
  check(
    "D. unseeded account plans no work",
    plan.kind === "idle" && plan.reason === "awaiting_completed_weeks_anchor",
    `${plan.kind}/${plan.reason}`
  );

  const store = createMemoryFinanceIncrementalStateStore();
  const { deps, calls } = makeDeps(store);
  const outcome = await runFinanceIncrementalSync({
    accountId: A1,
    today: TODAY,
    store,
    deps,
    ignoreRecoveryReservation: true,
  });
  check(
    "D. unseeded account performs no HTTP",
    calls.length === 0,
    `${calls.length} page call(s)`
  );
  check(
    "D. unseeded account fails LOUDLY, not as a silent success",
    outcome.status === "failed" && /missing_anchor/.test(outcome.error ?? ""),
    `status=${outcome.status} error=${outcome.error ?? "none"}`
  );
}

// A caught-up account is still allowed to be quietly idle.
{
  const store = createMemoryFinanceIncrementalStateStore({
    [A1]: seededState(A1, { from: "2026-09-07", to: "2026-09-13" }),
  });
  const { deps } = makeDeps(store);
  const outcome = await runFinanceIncrementalSync({
    accountId: A1,
    today: TODAY,
    store,
    deps,
    ignoreRecoveryReservation: true,
  });
  check(
    "D. caught-up account stays idle without erroring",
    outcome.status === "idle" && !outcome.error,
    `status=${outcome.status}`
  );
}

// ---------------------------------------------------------------- anchor
console.log("\n--- seeded anchor drives the intended period ---");
{
  const plan = planFinanceIncrementalWork({ state: seededState(A1), today: TODAY });
  check(
    "seeded A1 starts catch-up at the frontier week",
    plan.kind === "start_catchup" &&
      plan.week?.from === "2026-08-31" &&
      plan.week?.to === "2026-09-06",
    `${plan.kind} ${plan.week?.from}:${plan.week?.to}`
  );
  check(
    "seeded A1 starts that week at cursor 0",
    plan.rrdId === 0,
    `rrdId=${plan.rrdId}`
  );
  check(
    "anchor week itself is NOT re-fetched (no historical re-import)",
    plan.week?.from !== ANCHOR.from,
    `would fetch ${plan.week?.from}, anchor is ${ANCHOR.from}`
  );
}

// ---------------------------------------------------------------- E, F, H
console.log("\n--- account scoping and idempotency ---");
{
  const store = createMemoryFinanceIncrementalStateStore({ [A1]: seededState(A1) });
  const rowsFor = () => [
    { rrdId: 111, suffix: "logistics" },
    { rrdId: 112, suffix: "storage" },
  ];
  const { deps, calls, persisted } = makeDeps(store, { rowsFor });
  await runFinanceIncrementalSync({
    accountId: A1,
    today: TODAY,
    store,
    deps,
    ignoreRecoveryReservation: true,
  });
  check(
    "E. A1 requests only its own account",
    calls.length > 0 && calls.every((c) => String(c.accountId) === A1),
    `${calls.length} call(s), accounts=[${[...new Set(calls.map((c) => c.accountId))].join(",")}]`
  );
  check(
    "E. A1 writes only marketplace_account_id = 1",
    persisted.length > 0 && persisted.every((r) => r.marketplace_account_id === A1),
    `${persisted.length} row(s)`
  );

  // Second identical wake over the same week must yield the same keys.
  const store2 = createMemoryFinanceIncrementalStateStore({ [A1]: seededState(A1) });
  const second = makeDeps(store2, { rowsFor });
  await runFinanceIncrementalSync({
    accountId: A1,
    today: TODAY,
    store: store2,
    deps: second.deps,
    ignoreRecoveryReservation: true,
  });
  const k1 = persisted.map((r) => r.source_key).sort().join("|");
  const k2 = second.persisted.map((r) => r.source_key).sort().join("|");
  check(
    "H. repeated sync produces identical source_keys (upsert, not insert)",
    k1 === k2 && k1.length > 0,
    k1 === k2 ? `${persisted.length} stable key(s)` : "keys diverged between runs"
  );
}

{
  // Account 2 enforces a seller_id identity check, so the fake account must
  // carry the real one — otherwise the wake is blocked and the assertion below
  // would pass over an empty array without proving anything.
  const store = createMemoryFinanceIncrementalStateStore({ [A2]: seededState(A2) });
  const { deps, calls, persisted } = makeDeps(store, {
    sellerId: ACCOUNT2_FINANCE_SELLER_ID,
    rowsFor: () => [{ rrdId: 222, suffix: "logistics" }],
  });
  await runFinanceIncrementalSync({
    accountId: A2,
    today: TODAY,
    store,
    deps,
    ignoreRecoveryReservation: true,
  });
  check(
    "F. A2 writes only marketplace_account_id = 2",
    persisted.length > 0 &&
      persisted.every((r) => r.marketplace_account_id === A2) &&
      calls.every((c) => String(c.accountId) === A2),
    `${persisted.length} row(s) written, accounts=[${[...new Set(persisted.map((r) => r.marketplace_account_id))].join(",")}]`
  );
  check(
    "F. A2 rows never carry account 1",
    persisted.every((r) => r.marketplace_account_id !== A1),
    "no cross-account write from the A2 wake"
  );
  check(
    "F. A2 seller identity is enforced (wrong seller is refused)",
    await (async () => {
      const s = createMemoryFinanceIncrementalStateStore({ [A2]: seededState(A2) });
      const bad = makeDeps(s, { sellerId: "999999", rowsFor: () => [{ rrdId: 1, suffix: "logistics" }] });
      const o = await runFinanceIncrementalSync({
        accountId: A2,
        today: TODAY,
        store: s,
        deps: bad.deps,
        ignoreRecoveryReservation: true,
      });
      return bad.persisted.length === 0 && /isolation/i.test(o.error ?? "");
    })(),
    "mismatched seller_id blocks the wake instead of writing"
  );
}

// ---------------------------------------------------------------- G
console.log("\n--- source_key ---");
{
  check(
    "G. source_key is deterministic for a given (rrdId, suffix)",
    buildFinanceSourceKey(555, "logistics") === buildFinanceSourceKey(555, "logistics") &&
      buildFinanceSourceKey(555, "logistics") === "rrd:555:logistics"
  );
  check(
    "G. different components of one rrdId stay distinct",
    buildFinanceSourceKey(555, "logistics") !== buildFinanceSourceKey(555, "storage")
  );
  // source_key carries no account component, so uniqueness across accounts can
  // only come from the composite constraint — assert the constraint exists.
  const sync = read("src/lib/wildberries/sync-service.ts");
  check(
    "G. wb_finance upserts on (marketplace_account_id, source_key)",
    /from\("wb_finance"\)\s*\.upsert\([\s\S]{0,200}onConflict:\s*"marketplace_account_id,source_key"/.test(
      sync
    ),
    "composite key is what keeps identical rrd ids in different accounts apart"
  );
}

// ---------------------------------------------------------------- I
console.log("\n--- destructive operations ---");
{
  const files = [
    "src/lib/wildberries/sync-service.ts",
    "src/lib/finance-incremental/orchestrator.ts",
    "src/lib/finance-incremental/page-wake.ts",
    "src/lib/wildberries/finance-sync-v2.ts",
  ];
  let deletes = [];
  for (const f of files) {
    const src = read(f);
    if (/from\("wb_finance"\)[\s\S]{0,120}\.delete\(/.test(src)) deletes.push(f);
  }
  check(
    "I. no wb_finance delete on the finance ingestion path",
    deletes.length === 0,
    deletes.length ? deletes.join(", ") : "0 delete call sites"
  );
}

// ---------------------------------------------------------------- J
console.log("\n--- Statistics V5 is unreachable for a migrated account ---");
{
  const src = read("src/lib/wildberries/finance-sync-v2.ts");
  const gateAt = src.indexOf("if (shouldUseReportsV1Detail(");
  const listAt = src.indexOf("fetchSalesReportsList");
  check(
    "J. the V1 branch returns before any Statistics V5 discovery",
    gateAt > -1 && listAt > gateAt && /return mapped;/.test(src.slice(gateAt, listAt)),
    "V5 list/detail sits after an early-returning V1 branch"
  );
  const pageWake = read("src/lib/finance-incremental/page-wake.ts");
  check(
    "J. the incremental kernel never calls Statistics V5",
    !/fetchSalesReportsList|syncFinance\(/.test(pageWake)
  );
}

// ---------------------------------------------------------------- K
console.log("\n--- dashboard / reporting stay warehouse-only ---");
{
  const targets = [
    "src/services/dashboard-service.ts",
    "src/lib/reporting/report-context.ts",
    "src/services/persisted-query-service.ts",
  ];
  const offenders = targets.filter((f) => {
    const src = read(f);
    return /WbApiClient|fetchFinanceV1ReportPage|runFinanceIncrementalSync|fetchSalesReportsList/.test(
      src
    );
  });
  check(
    "K. no finance HTTP entrypoint in dashboard/reporting reads",
    offenders.length === 0,
    offenders.length ? offenders.join(", ") : "dashboard + reporting + persisted queries clean"
  );
}

// ---------------------------------------------------------------- L
console.log("\n--- Financial Engine formulas unchanged ---");
{
  // This migration changes ingestion only. Pin the engine's real accounting
  // surface so a later edit that quietly reshapes a formula trips here.
  const engine = read("src/lib/financial-engine.ts");
  const anchors = [
    "marketplaceFeeFromSales",
    "sumCustomerPaidFromSales",
    "sumRevenueFromFinance",
    "sumAcceptance",
    "finishedPriceRatioFromSales",
  ];
  const missing = anchors.filter((a) => !engine.includes(a));
  check(
    "L. Financial Engine still exposes its accounting surface",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : `${anchors.length} anchors present`
  );

  const tax = read("src/lib/financial-engine-tax.ts");
  check(
    "L. calculateEstimatedTax is still base x rate/100",
    /return\s+taxBase\s*\*\s*\(\s*taxPercent\s*\/\s*100\s*\)/.test(tax),
    "single shared arithmetic helper, unchanged"
  );
  check(
    "L. the dual tax-base model is still documented as intentional",
    /Smart Pricing/.test(tax) && /Historical reporting/.test(tax),
    "historical vs Smart Pricing bases remain separate"
  );

  // The ingestion path must not reach into the engine at all — that separation
  // is what makes "no formula change" checkable rather than a promise.
  const ingestion = [
    "src/lib/finance-incremental/orchestrator.ts",
    "src/lib/finance-incremental/page-wake.ts",
    "src/lib/finance-incremental/week-planner.ts",
  ];
  const leaks = ingestion.filter((f) =>
    /financial-engine|profit-engine-model-b|calculateEstimatedTax/.test(read(f))
  );
  check(
    "L. the Reports/V1 ingestion kernel does not import the Financial Engine",
    leaks.length === 0,
    leaks.length ? leaks.join(", ") : "ingestion and accounting stay separate"
  );
}

console.log(
  `\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`
);
process.exit(failures === 0 ? 0 : 1);
