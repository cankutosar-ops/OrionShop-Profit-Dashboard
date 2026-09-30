import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const serviceUrl = pathToFileURL(
  new URL("../src/services/dashboard-service.ts", import.meta.url).pathname
);
const { withDashboardDeadline } = await import(serviceUrl.href);

const fast = await withDashboardDeadline(Promise.resolve("ready"), 50);
assert.equal(fast, "ready", "fast optional data should be returned");

const started = Date.now();
await assert.rejects(
  withDashboardDeadline(new Promise(() => {}), 25),
  /optional data timed out/
);
assert.ok(Date.now() - started < 250, "deadline must stop a hanging optional segment quickly");

const errorBoundary = await readFile(
  new URL("../src/app/error.tsx", import.meta.url),
  "utf8"
);
assert.match(errorBoundary, /connection closed/i);
assert.match(errorBoundary, /sessionStorage/);
assert.match(errorBoundary, /reset\(\)/);

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

await assert.rejects(
  readFile(new URL("../src/app/loading.tsx", import.meta.url), "utf8"),
  /ENOENT/,
  "root loading boundary must not stream every data-heavy route"
);

const dashboardService = await readFile(
  new URL("../src/services/dashboard-service.ts", import.meta.url),
  "utf8"
);
assert.match(dashboardService, /withDashboardDeadline\(request, 45_000\)/);
assert.match(dashboardService, /const accountRangePromise = scope\.brandId/);

const supabaseFetch = await readFile(
  new URL("../src/lib/supabase/fetch.ts", import.meta.url),
  "utf8"
);
assert.match(supabaseFetch, /SUPABASE_REQUEST_TIMEOUT_MS = 20_000/);
assert.match(supabaseFetch, /AbortSignal\.timeout/);
assert.match(supabaseFetch, /AbortSignal\.any/);

console.log("PASS — application data loading is bounded and non-streaming");
