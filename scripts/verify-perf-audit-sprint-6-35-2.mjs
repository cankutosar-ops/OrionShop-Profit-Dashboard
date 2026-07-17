/**
 * Sprint 6.35.2 — Dashboard Performance Audit instrumentation checks.
 * Static + report generation. No optimization / no business math changes asserted.
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const root = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function mustInclude(rel, needle, label = needle) {
  const src = read(rel);
  if (!src.includes(needle)) fails.push(`${rel} missing: ${label}`);
}

// --- Core recorder ---
mustInclude("src/lib/perf/perf-recorder.ts", "runWithPerfRequest");
mustInclude("src/lib/perf/perf-recorder.ts", "recordPerfEvent");
mustInclude("src/lib/perf/perf-recorder.ts", "measureAsync");
mustInclude("src/lib/perf/perf-recorder.ts", "measureSync");
mustInclude("src/lib/perf/perf-recorder.ts", "buildPerfReport");
mustInclude("src/lib/perf/perf-recorder.ts", "writePerfReportMarkdown");
mustInclude("src/lib/perf/perf-recorder.ts", 'category: "duplicate"');
mustInclude("src/lib/perf/perf-recorder.ts", "timings.jsonl");
mustInclude("src/lib/perf/perf-recorder.ts", "PERFORMANCE_REPORT.md");

// --- SQL instrumentation ---
mustInclude("src/lib/supabase/paginate.ts", 'category: "sql"');
mustInclude("src/lib/supabase/paginate.ts", "recordPerfEvent");

// --- WB API instrumentation ---
mustInclude("src/lib/wildberries/api-client.ts", 'category: "wb_api"');
mustInclude("src/lib/wildberries/api-client.ts", "count429");
mustInclude("src/lib/wildberries/api-client.ts", 'cache: "miss"');

// --- Dashboard stages ---
mustInclude("src/services/dashboard-service.ts", "runWithPerfRequest");
mustInclude("src/services/dashboard-service.ts", "server.getDashboardData");
mustInclude("src/services/dashboard-service.ts", "server.fetchScopedDashboardRaw");
mustInclude("src/services/dashboard-service.ts", "server.buildOverviewAndProducts");

// --- Model B timing wrapper at server call site (math module stays client-safe) ---
mustInclude("src/services/dashboard-service.ts", "measureSync");
mustInclude("src/services/dashboard-service.ts", "model_b.calculateModelBNetProfit");
const modelB = read("src/lib/profit-engine-model-b.ts");
if (/from\s+["']@\/lib\/perf\/perf-recorder["']/.test(modelB)) {
  fails.push("profit-engine-model-b must not import perf-recorder (client-safe)");
}
if (!/sellerPayout\s*=/.test(modelB) || !/estimatedTax\s*=/.test(modelB)) {
  fails.push("Model B tax/payout formulas missing — unexpected math change");
}

// --- Client / nav ---
mustInclude("src/lib/perf/perf-client.ts", "markNavigationStart");
mustInclude("src/lib/perf/perf-client.ts", "markNavigationComplete");
mustInclude("src/components/perf/perf-page-probe.tsx", "page.dashboard.ready");
mustInclude("src/components/perf/perf-page-probe.tsx", "page.smart_pricing.ready");
mustInclude("src/components/layout/dashboard-layout.tsx", "PerfPageProbe");
mustInclude("src/components/layout/sidebar.tsx", "markNavigationStart");
mustInclude("src/components/layout/sidebar.tsx", "smart_pricing_open");

// --- API routes ---
mustInclude("src/app/api/perf/events/route.ts", "recordPerfEvent");
mustInclude("src/app/api/perf/report/route.ts", "writePerfReportMarkdown");

// --- gitignore ---
const gi = read(".gitignore");
if (!gi.split(/\r?\n/).some((l) => l.trim() === ".perf/" || l.trim() === ".perf")) {
  fails.push(".gitignore missing .perf/");
}

// --- Seed sample events + generate report ---
const perfDir = resolve(root, ".perf");
if (!existsSync(perfDir)) mkdirSync(perfDir, { recursive: true });
const requestId = randomUUID();
const seed = [
  {
    id: randomUUID(),
    ts: Date.now(),
    category: "page",
    name: "page.dashboard.ready",
    durationMs: 1200,
    requestId,
    route: "/",
  },
  {
    id: randomUUID(),
    ts: Date.now(),
    category: "sql",
    name: "sql.wb_sales.date_range",
    durationMs: 80,
    requestId,
    route: "/",
    meta: { table: "wb_sales", rows: 100 },
  },
  {
    id: randomUUID(),
    ts: Date.now() + 1,
    category: "sql",
    name: "sql.wb_sales.date_range",
    durationMs: 90,
    requestId,
    route: "/",
    meta: { table: "wb_sales", rows: 100 },
  },
  {
    id: randomUUID(),
    ts: Date.now(),
    category: "wb_api",
    name: "wb.request",
    durationMs: 400,
    requestId,
    route: "/",
    meta: { endpoint: "/api/v1/supplier/sales", retries: 1, count429: 1, cache: "miss" },
  },
  {
    id: randomUUID(),
    ts: Date.now(),
    category: "navigation",
    name: "nav.account_switch",
    durationMs: 2500,
    route: "/",
  },
  {
    id: randomUUID(),
    ts: Date.now(),
    category: "duplicate",
    name: "duplicate:sql:wb_sales",
    durationMs: 0,
    requestId,
    route: "/",
    meta: { fingerprint: "sql:wb_sales", count: 2, originalName: "sql.wb_sales.date_range" },
  },
];
writeFileSync(
  resolve(perfDir, "timings.jsonl"),
  seed.map((e) => JSON.stringify(e)).join("\n") + "\n",
  "utf8"
);

try {
  execSync("npx tsx scripts/generate-perf-report.mjs", {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, PERF_AUDIT: "1" },
  });
} catch (err) {
  fails.push(`generate-perf-report failed: ${err.message}`);
}

const reportMd = resolve(perfDir, "PERFORMANCE_REPORT.md");
const reportJson = resolve(perfDir, "PERFORMANCE_REPORT.json");
if (!existsSync(reportMd)) fails.push("PERFORMANCE_REPORT.md not generated");
if (!existsSync(reportJson)) fails.push("PERFORMANCE_REPORT.json not generated");
if (existsSync(reportMd)) {
  const md = readFileSync(reportMd, "utf8");
  if (!md.includes("Dashboard Performance Report")) {
    fails.push("Report markdown missing title");
  }
  if (!md.includes("SQL queries")) fails.push("Report missing SQL section");
  if (!md.includes("Wildberries API")) fails.push("Report missing WB API section");
  if (!md.includes("Duplicate work")) fails.push("Report missing duplicates section");
}

console.log("Sprint 6.35.2 — Dashboard Performance Audit");
if (fails.length) {
  console.log("FAIL");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("PASS");
console.log("✓ Perf recorder + duplicate detection");
console.log("✓ SQL / WB API / dashboard stage hooks");
console.log("✓ Client nav + page-ready probe");
console.log("✓ Performance report generated (.perf/)");
console.log("✓ Model B wrapped for timing only (formulas present)");
