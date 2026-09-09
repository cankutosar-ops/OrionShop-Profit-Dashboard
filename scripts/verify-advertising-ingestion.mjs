/**
 * Advertising ingestion — correctness, idempotency and account isolation.
 *
 * Executes the real mapper, the real ingestion kernel and a real Supabase client
 * over a fake PostgREST server. Nothing is grepped: every assertion is about
 * what the code actually put on the wire.
 *
 * No Wildberries calls (the WB client is injected) and no production writes.
 */

import http from "node:http";

let failures = 0;
function check(label, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- Catalogues. Account 1 and Account 2 own disjoint nmIds, as WB guarantees. --
const PRODUCTS = {
  1: [
    { id: "101", nm_id: 1001, supplier_article: "A1-RED" },
    { id: "102", nm_id: 1002, supplier_article: "A1-BLUE" },
  ],
  2: [
    { id: "201", nm_id: 2001, supplier_article: "A2-RED" },
    // Same article string as Account 1 on purpose: article must never be a join key.
    { id: "202", nm_id: 2002, supplier_article: "A1-RED" },
  ],
};

// --- Fake PostgREST ----------------------------------------------------------
const requests = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
    requests.push({ method: req.method, url: req.url, body });

    if (req.method === "GET" && req.url.startsWith("/rest/v1/products")) {
      const m = /marketplace_account_id=eq\.([^&]+)/.exec(req.url);
      const rows = PRODUCTS[m?.[1]] ?? [];
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": `0-${rows.length}/*` });
      res.end(JSON.stringify(rows));
      return;
    }

    res.writeHead(req.method === "POST" ? 201 : 200, {
      "Content-Type": "application/json",
      "Content-Range": "*/0",
    });
    res.end("[]");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const mapper = await import("../src/lib/wildberries/ads-mapper.ts");
const constants = await import("../src/lib/wildberries/constants.ts");
const { runAdvertisingSyncForAccount } = await import(
  "../src/services/advertising-sync-service.ts"
);

const adsUpserts = () =>
  requests.filter((r) => r.method === "POST" && r.url.includes("/rest/v1/wb_ads"));
const adsRowsWritten = () => adsUpserts().flatMap((r) => JSON.parse(r.body ?? "[]"));

/** Builds a fullstats payload: one campaign, two platforms on the same day. */
function fullStatsFixture(advertId, nmIds, date) {
  return [
    {
      advertId,
      days: [
        {
          date: `${date}T00:00:00Z`,
          apps: [
            {
              appType: 1,
              nms: nmIds.map((nmId) => ({ nmId, views: 100, clicks: 10, sum: 50.5 })),
            },
            {
              appType: 32,
              nms: nmIds.map((nmId) => ({ nmId, views: 40, clicks: 4, sum: 20.25 })),
            },
          ],
        },
      ],
    },
  ];
}

function fakeWbClient({ campaigns = [777], onFullStats } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      fetchAdvertCampaignIds: async () => ({
        retrievable: campaigns,
        unretrievableCount: 0,
      }),
      fetchAdvertFullStats: async (ids, beginDate, endDate) => {
        calls.push({ ids: [...ids], beginDate, endDate });
        return onFullStats ? onFullStats(ids, beginDate, endDate) : [];
      },
    },
  };
}

const noSleep = async () => {};

// =====================================================================
console.log("\n--- A. Mapper: tree flattening and spend arithmetic ---");
// =====================================================================
{
  const { rows, skippedNoNmId } = mapper.flattenAdvertFullStats(
    fullStatsFixture(777, [1001], "2026-03-04")
  );
  check("one row per (campaign, product, day)", rows.length === 1, `${rows.length} row(s)`);
  check(
    "platform splits are summed, not duplicated",
    rows[0]?.spend === 70.75 && rows[0]?.clicks === 14 && rows[0]?.impressions === 140,
    `spend=${rows[0]?.spend} clicks=${rows[0]?.clicks} views=${rows[0]?.impressions}`
  );
  check(
    "campaign_date is WB's calendar day, not timezone-shifted",
    rows[0]?.campaignDate === "2026-03-04",
    rows[0]?.campaignDate
  );
  check("no nmId leaves were dropped", skippedNoNmId === 0, `skipped=${skippedNoNmId}`);
}

{
  const { rows, skippedNoNmId } = mapper.flattenAdvertFullStats([
    { advertId: 1, days: [{ date: "2026-03-04T00:00:00Z", apps: [{ nms: [{ sum: 9 }] }] }] },
  ]);
  check(
    "a stat leaf with no nmId is reported, never persisted as unattributed spend",
    rows.length === 0 && skippedNoNmId === 1,
    `rows=${rows.length} skipped=${skippedNoNmId}`
  );
}

{
  const a = mapper.buildAdsSourceKey(777, 1001, "2026-03-04");
  const b = mapper.buildAdsSourceKey(777, 1001, "2026-03-04");
  check("source_key is deterministic", a === b && a === "adv:777:1001:2026-03-04", a);
  check(
    "source_key separates campaigns, products and days",
    new Set([
      mapper.buildAdsSourceKey(777, 1001, "2026-03-04"),
      mapper.buildAdsSourceKey(778, 1001, "2026-03-04"),
      mapper.buildAdsSourceKey(777, 1002, "2026-03-04"),
      mapper.buildAdsSourceKey(777, 1001, "2026-03-05"),
    ]).size === 4
  );
}

// =====================================================================
console.log("\n--- B. Windowing respects the documented API limits ---");
// =====================================================================
{
  const windows = mapper.splitDateWindows("2026-01-01", "2026-09-09", constants.WB_ADVERT_FULLSTATS_MAX_DAYS);
  const spans = windows.map(
    (w) => (Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 86_400_000 + 1
  );
  check(
    "no window exceeds the 31-day maximum",
    spans.every((s) => s <= constants.WB_ADVERT_FULLSTATS_MAX_DAYS),
    `max span ${Math.max(...spans)}d over ${windows.length} window(s)`
  );
  check(
    "windows are contiguous and cover the whole range",
    windows[0].from === "2026-01-01" && windows[windows.length - 1].to === "2026-09-09",
    `${windows[0].from}..${windows[windows.length - 1].to}`
  );
  const gaps = windows.slice(1).filter(
    (w, i) => Date.parse(`${w.from}T00:00:00Z`) - Date.parse(`${windows[i].to}T00:00:00Z`) !== 86_400_000
  );
  check("windows do not overlap or skip days", gaps.length === 0, `${gaps.length} discontinuity`);
}

// =====================================================================
console.log("\n--- C. Account isolation ---");
// =====================================================================
{
  requests.length = 0;
  // Campaign reports spend for BOTH accounts' nmIds. Only Account 1's may persist.
  const { client } = fakeWbClient({
    onFullStats: () => fullStatsFixture(777, [1001, 2001], "2026-03-04"),
  });

  const result = await runAdvertisingSyncForAccount("1", {
    from: "2026-03-01",
    to: "2026-03-10",
    deps: { createClient: () => client, sleep: noSleep },
  });

  const written = adsRowsWritten();
  check(
    "only this account's nmId is persisted",
    written.length === 1 && written[0].nm_id === 1001,
    `wrote nm_ids=[${written.map((r) => r.nm_id).join(",")}]`
  );
  check(
    "the other account's nmId is reported as unmatched, not written",
    result.rowsUnmatched === 1 && result.unmatchedNmIds.includes(2001),
    `unmatched=${result.rowsUnmatched} nmIds=[${result.unmatchedNmIds.join(",")}]`
  );
  check(
    "unmatched spend is quantified rather than silently dropped",
    result.spendUnmatched === 70.75,
    `spendUnmatched=${result.spendUnmatched}`
  );
  check(
    "every persisted row carries the syncing account id",
    written.every((r) => String(r.marketplace_account_id) === "1"),
    written.map((r) => r.marketplace_account_id).join(",")
  );
  check(
    "product_id is resolved within the account",
    written[0]?.product_id === "101",
    `product_id=${written[0]?.product_id}`
  );
  check(
    "products are looked up with an account predicate",
    requests.some(
      (r) => r.method === "GET" && r.url.includes("products") && r.url.includes("marketplace_account_id=eq.1")
    ),
    "products?marketplace_account_id=eq.1"
  );
}

{
  // The reverse direction, and the article-collision trap: Account 2 owns nm 2002
  // whose supplier_article ("A1-RED") is identical to an Account 1 product.
  requests.length = 0;
  const { client } = fakeWbClient({
    onFullStats: () => fullStatsFixture(888, [1001, 2002], "2026-03-04"),
  });

  const result = await runAdvertisingSyncForAccount("2", {
    from: "2026-03-01",
    to: "2026-03-10",
    deps: { createClient: () => client, sleep: noSleep },
  });

  const written = adsRowsWritten();
  check(
    "Account 2 sync never writes Account 1's nmId",
    written.length === 1 && written[0].nm_id === 2002,
    `wrote nm_ids=[${written.map((r) => r.nm_id).join(",")}]`
  );
  check(
    "a colliding supplier_article does not cause cross-account attribution",
    written[0]?.product_id === "202" && String(written[0]?.marketplace_account_id) === "2",
    `product_id=${written[0]?.product_id} account=${written[0]?.marketplace_account_id}`
  );
  check(
    "Account 1's nmId is unmatched for Account 2",
    result.unmatchedNmIds.includes(1001),
    `unmatched=[${result.unmatchedNmIds.join(",")}]`
  );
}

// =====================================================================
console.log("\n--- D. Idempotency ---");
// =====================================================================
{
  const runOnce = async () => {
    requests.length = 0;
    const { client } = fakeWbClient({
      onFullStats: () => fullStatsFixture(777, [1001, 1002], "2026-03-04"),
    });
    await runAdvertisingSyncForAccount("1", {
      from: "2026-03-01",
      to: "2026-03-10",
      deps: { createClient: () => client, sleep: noSleep },
    });
    return adsRowsWritten();
  };

  const first = await runOnce();
  const second = await runOnce();

  check(
    "a re-run produces byte-identical source_keys",
    JSON.stringify(first.map((r) => r.source_key).sort()) ===
      JSON.stringify(second.map((r) => r.source_key).sort()),
    first.map((r) => r.source_key).sort().join(" ")
  );
  check(
    "source_key is always populated",
    first.every((r) => typeof r.source_key === "string" && r.source_key.length > 0),
    `${first.length} row(s)`
  );
  check(
    "source_keys within a run are unique",
    new Set(first.map((r) => r.source_key)).size === first.length,
    `${new Set(first.map((r) => r.source_key)).size}/${first.length} distinct`
  );

  const upsertUrl = adsUpserts()[0]?.url ?? "";
  check(
    "persistence upserts on (marketplace_account_id, source_key)",
    /on_conflict=marketplace_account_id%2Csource_key|on_conflict=marketplace_account_id,source_key/.test(
      upsertUrl
    ),
    upsertUrl
  );
  check(
    "no DELETE is ever issued against wb_ads",
    requests.filter((r) => r.method === "DELETE" && r.url.includes("wb_ads")).length === 0,
    "non-destructive"
  );
}

// =====================================================================
console.log("\n--- E. Rate limiting and batching ---");
// =====================================================================
{
  requests.length = 0;
  const many = Array.from({ length: 120 }, (_, i) => 1000 + i);
  const { client, calls } = fakeWbClient({ campaigns: many, onFullStats: () => [] });

  await runAdvertisingSyncForAccount("1", {
    from: "2026-01-01",
    to: "2026-02-15",
    deps: { createClient: () => client, sleep: noSleep },
  });

  check(
    "campaign ids are batched within the documented maximum",
    calls.every((c) => c.ids.length <= constants.WB_ADVERT_FULLSTATS_MAX_IDS),
    `max batch ${Math.max(...calls.map((c) => c.ids.length))} of ${constants.WB_ADVERT_FULLSTATS_MAX_IDS}`
  );
  check(
    "every campaign id is requested exactly once per window",
    new Set(calls.filter((c) => c.beginDate === "2026-01-01").flatMap((c) => c.ids)).size === 120,
    "120 ids covered"
  );
  check(
    "the fullstats pacing interval honours 3 requests/minute",
    constants.WB_ADVERT_FULLSTATS_INTERVAL_MS >= 20_000,
    `${constants.WB_ADVERT_FULLSTATS_INTERVAL_MS}ms`
  );
}

{
  // A deadline must stop the run cleanly rather than half-write a window.
  requests.length = 0;
  const { client } = fakeWbClient({ onFullStats: () => fullStatsFixture(777, [1001], "2026-03-04") });
  const result = await runAdvertisingSyncForAccount("1", {
    from: "2026-01-01",
    to: "2026-09-09",
    deadlineAt: Date.now() - 1,
    deps: { createClient: () => client, sleep: noSleep },
  });
  check(
    "an exhausted budget stops before issuing WB requests",
    result.fullstatsRequests === 0 && result.errors.some((e) => e.includes("deadline")),
    result.errors[0] ?? "no error recorded"
  );
}

// =====================================================================
console.log("\n--- F. Failure isolation ---");
// =====================================================================
{
  requests.length = 0;
  let call = 0;
  const { client } = fakeWbClient({
    onFullStats: () => {
      call += 1;
      if (call === 1) throw new Error("WB API error 429: Too Many Requests");
      return fullStatsFixture(777, [1001], "2026-03-04");
    },
  });

  const result = await runAdvertisingSyncForAccount("1", {
    from: "2026-01-01",
    to: "2026-03-10",
    deps: { createClient: () => client, sleep: noSleep },
  });

  check(
    "a failed window is recorded but does not abort the run",
    result.errors.length === 1 && result.errors[0].includes("429"),
    result.errors[0] ?? "none"
  );
  check(
    "later windows still persist after an earlier failure",
    result.rowsPersisted > 0,
    `rowsPersisted=${result.rowsPersisted}`
  );
}

// Non-vacuity: if the harness never saw an upsert, every assertion above is empty.
check(
  "the harness actually observed wb_ads upserts (assertions are meaningful)",
  requests.some((r) => r.method === "POST" && r.url.includes("/rest/v1/wb_ads"))
);

server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));

console.log(`\nRESULT: ${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
process.exitCode = failures === 0 ? 0 : 1;
