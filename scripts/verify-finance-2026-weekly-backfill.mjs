#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  assertFinance2026Range,
  buildFinanceBackfillWindows,
  buildFinanceWeeklyReportPlan,
  financeControlTotalMatches,
  financeWeeklyReportTypeName,
  runWithSingleFinance429Retry,
} from "../src/lib/wildberries/finance-weekly-backfill.ts";
import {
  assertFinanceV1PeriodTokenReady,
  assertFinanceV1TokenReady,
  buildFinanceV1DetailedRequest,
  buildFinanceV1DetailedByReportIdRequest,
  financeV1DetailedByReportIdPath,
} from "../src/lib/wildberries/finance-v1.ts";

function unsignedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `x.${encoded}.x`;
}

assert.equal(financeWeeklyReportTypeName(1), "general");
assert.equal(financeWeeklyReportTypeName(2), "purchase");
assert.equal(financeWeeklyReportTypeName(9), "unknown");
assert.deepEqual(buildFinanceV1DetailedByReportIdRequest({ rrdId: 0 }), {
  limit: 100000,
  rrdId: 0,
});
assert.equal(
  financeV1DetailedByReportIdPath(855260153),
  "/api/finance/v1/sales-reports/detailed/855260153"
);
assert.deepEqual(
  buildFinanceV1DetailedRequest({
    dateFrom: "2026-09-21",
    dateTo: "2026-09-27",
    rrdId: 0,
    period: "weekly",
  }),
  {
    dateFrom: "2026-09-21",
    dateTo: "2026-09-27",
    limit: 100000,
    rrdId: 0,
    period: "weekly",
  }
);
const baseFinanceToken = unsignedToken({ acc: 1, t: false, s: 1 << 12 });
assert.equal(assertFinanceV1PeriodTokenReady(baseFinanceToken).tokenType, "base");
assert.throws(() => assertFinanceV1TokenReady(baseFinanceToken), /token type=base/);
assert.throws(
  () => assertFinanceV1PeriodTokenReady(unsignedToken({ acc: 1, t: false, s: 1 << 4 })),
  /Finance category/
);

const plan = buildFinanceWeeklyReportPlan({
  from: "2026-01-01",
  to: "2026-09-30",
  reports: [
    { reportId: 855260155, reportType: 2, dateFrom: "2026-09-21", dateTo: "2026-09-27", createDate: "2026-09-28", forPaySum: "10990.80" },
    { reportId: 855260153, reportType: 1, dateFrom: "2026-09-21", dateTo: "2026-09-27", createDate: "2026-09-28", forPaySum: "86417.95" },
    { reportId: 1, reportType: 1, dateFrom: "2025-12-22", dateTo: "2025-12-28", createDate: "2025-12-29", forPaySum: "1" },
  ],
});
assert.deepEqual(plan.map((item) => [item.reportId, item.reportTypeName]), [
  [855260153, "general"],
  [855260155, "purchase"],
]);
assert.equal(financeControlTotalMatches(86417.95, 86417.95), true);
assert.equal(financeControlTotalMatches(86417.95, 86417.97), false);
assert.throws(() => assertFinance2026Range("2025-01-01", "2026-09-30"));
assert.throws(() => assertFinance2026Range("2026-01-01", "2026-10-01"));
assert.deepEqual(
  buildFinanceBackfillWindows("2026-01-01", "2026-01-20"),
  [
    { from: "2026-01-01", to: "2026-01-07" },
    { from: "2026-01-08", to: "2026-01-14" },
    { from: "2026-01-15", to: "2026-01-20" },
  ]
);
const fullWindows = buildFinanceBackfillWindows("2026-01-01", "2026-09-30");
assert.equal(fullWindows[0].from, "2026-01-01");
assert.equal(fullWindows[0].to, "2026-01-07");
assert.equal(fullWindows.at(-1).to, "2026-09-30");
assert.ok(
  fullWindows.every((window, index) => {
    const days =
      (Date.parse(`${window.to}T12:00:00Z`) - Date.parse(`${window.from}T12:00:00Z`)) /
        86_400_000 +
      1;
    if (days < 1 || days > 7) return false;
    if (index === 0) return true;
    const previous = fullWindows[index - 1];
    return (
      Date.parse(`${window.from}T12:00:00Z`) -
        Date.parse(`${previous.to}T12:00:00Z`) ===
      86_400_000
    );
  })
);

{
  let calls = 0;
  const waits = [];
  const result = await runWithSingleFinance429Retry({
    operation: async () => ({ statusCode: ++calls === 1 ? 429 : 200 }),
    is429: (value) => value?.statusCode === 429,
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [70_000]);
  assert.equal(result.retryPerformed, true);
  assert.equal(result.value.statusCode, 200);
}

{
  let calls = 0;
  const result = await runWithSingleFinance429Retry({
    operation: async () => ({ statusCode: ++calls <= 2 ? 429 : 200 }),
    is429: (value) => value?.statusCode === 429,
    sleep: async () => {},
  });
  assert.equal(calls, 2, "a second 429 must not trigger a third request");
  assert.equal(result.value.statusCode, 429);
}

{
  let calls = 0;
  await assert.rejects(
    runWithSingleFinance429Retry({
      operation: async () => {
        calls += 1;
        throw Object.assign(new Error("429"), { statusCode: 429 });
      },
      is429: (value) => value?.statusCode === 429,
      sleep: async () => {},
    }),
    /429/
  );
  assert.equal(calls, 2, "a thrown second 429 must be terminal");
}

console.log("PASS finance 2026 weekly backfill offline verification");
