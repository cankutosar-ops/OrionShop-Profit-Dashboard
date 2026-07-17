/**
 * Sprint 6.35.3 — Performance Phase 1 validation (static + structural).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function mustInclude(rel, needle, label = needle) {
  if (!existsSync(resolve(root, rel))) {
    fails.push(`missing file: ${rel}`);
    return;
  }
  const src = read(rel);
  if (!src.includes(needle)) fails.push(`${rel} missing: ${label}`);
}

function mustNotInclude(rel, needle, label = needle) {
  if (!existsSync(resolve(root, rel))) {
    fails.push(`missing file: ${rel}`);
    return;
  }
  const src = read(rel);
  if (src.includes(needle)) fails.push(`${rel} must not include: ${label}`);
}

function mustNotMatch(rel, regex, label) {
  if (!existsSync(resolve(root, rel))) {
    fails.push(`missing file: ${rel}`);
    return;
  }
  const src = read(rel);
  if (regex.test(src)) fails.push(`${rel} must not include: ${label}`);
}

// 1) Dashboard 500 root cause fixed: Model B must not import perf-recorder
mustNotMatch(
  "src/lib/profit-engine-model-b.ts",
  /from\s+["']@\/lib\/perf\/perf-recorder["']/,
  "perf-recorder import (breaks client bundle via async_hooks)"
);
mustInclude("src/services/dashboard-service.ts", "measureSync");
mustInclude("src/services/dashboard-service.ts", "model_b.calculateModelBNetProfit");

// Model B math intact
const modelB = read("src/lib/profit-engine-model-b.ts");
if (!/sellerPayout\s*=/.test(modelB) || !/estimatedTax\s*=/.test(modelB)) {
  fails.push("Model B tax/payout formulas missing — unexpected math change");
}

// 2) No duplicate date-range refresh
mustNotMatch(
  "src/components/dashboard/date-range-picker.tsx",
  /router\.push\([^)]*\);\s*\n\s*setOpen/,
  "date-range push without navigateScope/refresh"
);
mustInclude(
  "src/components/dashboard/date-range-picker.tsx",
  "navigateScope",
  "date-range navigateScope"
);
mustInclude("src/lib/scope-navigation.ts", "router.refresh()");

// 3) Critical path split
mustInclude("src/services/dashboard-service.ts", "getDashboardCoreData");
mustInclude("src/services/dashboard-service.ts", "loadDashboardWbStrip");
mustInclude("src/app/page.tsx", "getDashboardCoreData");
mustInclude("src/app/page.tsx", "DashboardWbDeferredSection");
mustInclude("src/app/page.tsx", "prefetchDashboardBackground");

// 4) Parallel WB + cache
mustInclude("src/lib/wb/wb-request-cache.ts", "cachedExternalRequest");
mustInclude("src/services/orders-value-service.ts", "fetchWbOrdersApi");
mustInclude("src/services/wb-sales-reports-service.ts", "cachedExternalRequest");
mustInclude("src/services/wb-balance-service.ts", "cachedExternalRequest");
mustInclude("src/services/dashboard-service.ts", "fetchWbOrdersApi(scope)");
mustInclude("src/services/wb-settlement-service.ts", "loadWbWeeklySalesReports");
mustNotInclude(
  "src/services/wb-settlement-service.ts",
  "loadWeeklyReportsForSettlement",
  "duplicate weekly reports fetch helper"
);

// 5) react.cache SQL dedupe
mustInclude("src/services/dashboard-service.ts", "getCachedDashboardSql");
mustInclude("src/services/dashboard-service.ts", 'from "react"');

console.log(
  fails.length
    ? `FAIL (${fails.length})\n` + fails.map((f) => ` - ${f}`).join("\n")
    : "PASS — Sprint 6.35.3 Phase 1 structural checks"
);
process.exit(fails.length ? 1 : 0);
