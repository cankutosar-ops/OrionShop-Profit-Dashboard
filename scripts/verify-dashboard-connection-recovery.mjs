import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const serviceUrl = new URL("../src/lib/supabase/read-budget.ts", import.meta.url);
const { withReadBudget } = await import(serviceUrl.href);

const fast = await withReadBudget(() => Promise.resolve("ready"), 50);
assert.equal(fast, "ready", "fast optional data should be returned");

const started = Date.now();
await assert.rejects(
  withReadBudget(() => new Promise(() => {}), 25),
  /data loading timed out/
);
assert.ok(Date.now() - started < 250, "deadline must stop a hanging optional segment quickly");

const errorBoundary = await readFile(
  new URL("../src/app/error.tsx", import.meta.url),
  "utf8"
);
assert.match(errorBoundary, /connection closed/i);
assert.doesNotMatch(errorBoundary, /sessionStorage|setTimeout/);
assert.match(errorBoundary, /window\.location\.reload\(\)/);
assert.doesNotMatch(errorBoundary, /reset\(\)/);

const dashboardPage = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
assert.match(
  dashboardPage,
  /Promise\.all\(\[\s*getDashboardCoreData\(scope\),\s*loadDashboardWbStrip\(scope\)/,
  "core and optional WB data must start in parallel"
);
assert.doesNotMatch(
  dashboardPage,
  /<Suspense/,
  "dashboard must resolve server data before returning markup"
);
assert.match(dashboardPage, /const content = await DashboardCoreSection/);
assert.match(dashboardPage, /withReadBudget\(\(\) => loadDashboardPage/);

await assert.rejects(
  readFile(new URL("../src/app/loading.tsx", import.meta.url), "utf8"),
  /ENOENT/,
  "root loading boundary must not stream every data-heavy route"
);

const dashboardService = await readFile(
  new URL("../src/services/dashboard-service.ts", import.meta.url),
  "utf8"
);
assert.match(dashboardService, /withReadBudget\(request, 45_000\)/);
assert.match(dashboardService, /const accountRangePromise = scope\.brandId/);

const supabaseFetch = await readFile(
  new URL("../src/lib/supabase/fetch.ts", import.meta.url),
  "utf8"
);
assert.match(supabaseFetch, /SUPABASE_REQUEST_TIMEOUT_MS = 20_000/);
assert.match(supabaseFetch, /AbortSignal\.timeout/);
assert.match(supabaseFetch, /fetchWithSignal/);

const pagination = await readFile(
  new URL("../src/lib/supabase/paginate.ts", import.meta.url),
  "utf8"
);
assert.match(pagination, /PAGE_CONCURRENCY = 4/);
assert.match(pagination, /count: "exact"/);
assert.match(pagination, /Promise\.all\(batchOffsets\.map/);
assert.match(pagination, /\[db-performance\] slow paginated query/);

assert.match(dashboardService, /DASHBOARD_FINANCE_COLUMNS/);
assert.match(dashboardService, /columns: DASHBOARD_FINANCE_COLUMNS/);
assert.match(dashboardService, /amount, raw_amount, source_key/);

console.log("PASS — dashboard loading guardrails and deadline behavior");
