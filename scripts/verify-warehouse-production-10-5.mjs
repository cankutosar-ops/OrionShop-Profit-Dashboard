/**
 * Sprint 10.5 — Production Hardening & DB-only Validation.
 * Updated in Sprint 10.6: Dashboard KPI services are warehouse-backed (PASS when no HTTP).
 * Run: npx tsx scripts/verify-warehouse-production-10-5.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

let failures = 0;
let warnings = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function warn(label, detail = "") {
  warnings += 1;
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ""}`);
}

function walkTsFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const HTTP_CLIENT_RE =
  /WbApiClient|createWbSyncService|from ["']@\/lib\/marketplace-adapters|from ["']@\/lib\/wildberries\/api-client/;
const MARKETPLACE_HOST_RE =
  /statistics-api\.wildberries|finance-api\.wildberries|content-api\.wildberries|seller-analytics-api\.wildberries/;

console.log("=== Sprint 10.5 — Production Hardening & DB-only Validation ===\n");

const root = resolve(process.cwd());

// --- Warehouse platform checklist ---
console.log("--- Warehouse platform integrity ---");
const warehouseChecks = [
  ["Foundation package", "src/lib/warehouse/index.ts"],
  ["Historical backfill engine", "src/lib/warehouse/backfill/engine.ts"],
  ["Incremental sync engine", "src/lib/warehouse/incremental/engine.ts"],
  ["Ops orchestrator", "src/lib/warehouse/ops/orchestrator.ts"],
  ["Scheduler", "src/lib/warehouse/ops/scheduler.ts"],
  ["Queue", "src/lib/warehouse/ops/queue.ts"],
  ["Retry engine", "src/lib/warehouse/ops/retry.ts"],
  ["Monitoring", "src/lib/warehouse/ops/monitoring.ts"],
  ["Foundation migration", "supabase/migrations/20260731140000_warehouse_platform_foundation_10_1.sql"],
  ["Ops migration", "supabase/migrations/20260731160000_warehouse_scheduler_monitoring_10_4.sql"],
  ["KPI snapshots migration", "supabase/migrations/20260731180000_warehouse_kpi_snapshots_10_6.sql"],
];
for (const [label, rel] of warehouseChecks) {
  check(label, existsSync(resolve(root, rel)));
}

const warehouseFiles = walkTsFiles(resolve(root, "src/lib/warehouse"));
const warehouseSrc = warehouseFiles.map((f) => readFileSync(f, "utf8")).join("\n");
check(
  "Warehouse package has no marketplace HTTP client",
  !/WbApiClient|createWbSyncService/.test(warehouseSrc) && !MARKETPLACE_HOST_RE.test(warehouseSrc)
);

// --- UI isolation ---
console.log("\n--- UI / components isolation ---");
const componentFiles = walkTsFiles(resolve(root, "src/components")).map((f) => ({
  path: f,
  src: readFileSync(f, "utf8"),
}));
const uiHttp = componentFiles.filter(
  (f) => /WbApiClient|createWbSyncService/.test(f.src) || MARKETPLACE_HOST_RE.test(f.src)
);
check("UI components do not import WbApiClient / sync service", uiHttp.length === 0);
const uiSql = componentFiles.filter(
  (f) =>
    /\.from\(["'][a-z_]+["']\)/.test(f.src) && /createAdminClient|createClient|supabase/.test(f.src)
);
check("UI components do not run direct Supabase queries", uiSql.length === 0);

// --- Financial Engine ---
console.log("\n--- Financial Engine ---");
const feFiles = [
  "src/lib/financial-engine.ts",
  "src/lib/financial-engine-tax.ts",
  "src/lib/profit-engine-model-b.ts",
  "src/lib/profit-engine-model-c.ts",
  "src/lib/sales-revenue-resolution.ts",
].map((rel) => resolve(root, rel));
const feSrc = feFiles.filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
check("Financial Engine has no WbApiClient", !/WbApiClient|createWbSyncService/.test(feSrc));
check(
  "Financial Engine tax uses finishedPrice / revenue path",
  feSrc.includes("buildNetFinishedPriceFromDb") || feSrc.includes("calculateEstimatedTax")
);
check("Financial Engine has no marketplace host URLs", !MARKETPLACE_HOST_RE.test(feSrc));

// --- Smart Pricing ---
console.log("\n--- Smart Pricing ---");
const spService = resolve(root, "src/services/smart-pricing-service.ts");
const spLib = resolve(root, "src/lib/smart-pricing.ts");
const spSrc = [spService, spLib].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
check("Smart Pricing has no WbApiClient", !/WbApiClient|createWbSyncService/.test(spSrc));
check(
  "Smart Pricing loads sales/finance/orders via DB fetch helpers",
  /fetchSalesInRange|fetchFinanceInRange|fetchOrdersInRange/.test(spSrc)
);

// --- Reporting ---
console.log("\n--- Reporting ---");
const reportingFiles = walkTsFiles(resolve(root, "src/lib/reporting")).map((f) => ({
  path: f,
  src: readFileSync(f, "utf8"),
}));
const reportingHttp = reportingFiles.filter((f) => /WbApiClient|createWbSyncService/.test(f.src));
check("Reporting lib has no direct marketplace HTTP", reportingHttp.length === 0);
const reportContext = readFileSync(resolve(root, "src/lib/reporting/report-context.ts"), "utf8");
check(
  "Reporting uses loadReportContext → Financial Engine / dashboard services",
  reportContext.includes("loadReportContext") &&
    reportContext.includes("getOverviewMetrics") &&
    reportContext.includes("financialEngine")
);
const settlement = readFileSync(
  resolve(root, "src/lib/reporting/module/settlement-report.ts"),
  "utf8"
);
check(
  "Settlement report is Financial Engine projection",
  settlement.includes("financialEngine") || settlement.includes("Model B")
);

// --- Cost / Purchases ---
console.log("\n--- Cost Management & Purchases ---");
const costSrc = readFileSync(resolve(root, "src/services/cost-service.ts"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/services/purchase-service.ts"), "utf8");
check("Cost service has no marketplace HTTP", !/WbApiClient|createWbSyncService/.test(costSrc));
check("Purchase service has no marketplace HTTP", !/WbApiClient|createWbSyncService/.test(purchaseSrc));
check("Cost service uses Supabase admin client", costSrc.includes("createAdminClient"));
check("Purchase service uses Supabase admin client", purchaseSrc.includes("createAdminClient"));

// --- Product analytics ---
console.log("\n--- Product Analytics ---");
const productBuilder = resolve(root, "src/lib/product-profitability-builder.ts");
check("Product profitability builder exists", existsSync(productBuilder));
const pbSrc = readFileSync(productBuilder, "utf8");
check(
  "Product analytics uses Financial Engine helpers",
  pbSrc.includes("calculateModelBNetProfit") || pbSrc.includes("financial-engine")
);
check("Product analytics has no WbApiClient", !/WbApiClient|createWbSyncService/.test(pbSrc));

// --- Dashboard DB-only gate (critical) ---
console.log("\n--- Dashboard data-source audit (critical) ---");
const dashService = readFileSync(resolve(root, "src/services/dashboard-service.ts"), "utf8");
check("Dashboard service reads wb_sales / wb_finance from DB", /\.from\(["']wb_sales["']\)/.test(dashService));
check(
  "Dashboard core profitability uses Financial Engine",
  dashService.includes("buildModelBProfitMetrics") || dashService.includes("financial-engine")
);
check("Dashboard does not call fetchWbOrdersApi", !dashService.includes("fetchWbOrdersApi"));

const kpiServices = [
  "src/services/orders-value-service.ts",
  "src/services/wb-balance-service.ts",
  "src/services/wb-sales-reports-service.ts",
  "src/services/shipment-history-service.ts",
];
let kpiHttp = 0;
for (const rel of kpiServices) {
  const src = readFileSync(resolve(root, rel), "utf8");
  if (/WbApiClient|createWbSyncService/.test(src)) {
    kpiHttp += 1;
    check(`KPI service DB-only: ${rel}`, false);
  }
}
check("Dashboard KPI services are warehouse DB-only", kpiHttp === 0);

// Residual inventory — ingestion paths may keep HTTP
const liveApiServices = [
  "src/services/orders-value-service.ts",
  "src/services/wb-balance-service.ts",
  "src/services/wb-sales-reports-service.ts",
  "src/services/shipment-history-service.ts",
  "src/services/inventory-validation-service.ts",
  "src/services/inventory-daily-snapshot-service.ts",
  "src/services/historical-inventory-service.ts",
  "src/services/sync-verification-audit-service.ts",
  "src/services/dashboard-sync-service.ts",
  "src/services/account-lifecycle-service.ts",
];
console.log("\n--- Residual marketplace HTTP inventory ---");
for (const rel of liveApiServices) {
  const full = resolve(root, rel);
  if (!existsSync(full)) continue;
  const src = readFileSync(full, "utf8");
  const hasHttp = /WbApiClient|createWbSyncService/.test(src);
  const isIngestion =
    /dashboard-sync|account-lifecycle|inventory-daily-snapshot|sync-verification|historical-inventory/.test(
      rel
    );
  if (hasHttp && isIngestion) {
    console.log(`INFO  ${rel} — ingestion/sync path (allowed)`);
  } else if (hasHttp) {
    failures += 1;
    console.log(`FAIL  ${rel} — live marketplace HTTP on business read path`);
  } else {
    console.log(`PASS  ${rel} — no marketplace HTTP`);
  }
}

// --- Adapter isolation ---
console.log("\n--- Marketplace adapter isolation ---");
const adapterImports = [];
for (const file of walkTsFiles(resolve(root, "src"))) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("@/lib/marketplace-adapters")) continue;
  const rel = file.replace(root + "\\", "").replace(root + "/", "").replace(/\\/g, "/");
  adapterImports.push(rel);
}
const allowedAdapterConsumers = [
  "src/services/historical-backfill-service.ts",
  "src/services/incremental-sync-service.ts",
  "src/services/warehouse-ops-service.ts",
  "src/services/marketplace-account-service.ts",
  "src/lib/marketplace-adapters/",
];
const forbiddenAdapter = adapterImports.filter(
  (rel) => !allowedAdapterConsumers.some((a) => rel.startsWith(a) || rel.includes("/marketplace-adapters/"))
);
check(
  "Marketplace adapters only used by warehouse sync / connection test",
  forbiddenAdapter.length === 0,
  forbiddenAdapter.join(", ") || "ok"
);

// --- Production checklist markers ---
console.log("\n--- Production checklist ---");
const guards = readFileSync(resolve(root, "src/lib/warehouse/utils/foundation-guards.ts"), "utf8");
check("Historical backfill enabled", guards.includes("WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL = true"));
check("Incremental sync enabled", guards.includes("WAREHOUSE_ALLOWS_INCREMENTAL_SYNC = true"));
check("Ops scheduler enabled", guards.includes("WAREHOUSE_ALLOWS_OPS_SCHEDULER = true"));

console.log("\n--- Performance review (recommendations) ---");
warn(
  "Apply KPI snapshot migration 20260731180000 if not applied",
  "balance / sales-report snapshots required for Cash Received, Expected Payout, Balance"
);
warn(
  "Apply ops migration 20260731160000 if not applied",
  "durable queue/history/alerts require schema"
);

const productionReady = failures === 0;
console.log(
  `\n=== Result: ${productionReady ? "PASS" : "FAIL"} (${failures} failure(s), ${warnings} warning(s)) ===`
);
process.exit(productionReady ? 0 : 1);
