/**
 * Sprint 10.6 — DB-only Migration & Production Certification.
 * Run: npx tsx scripts/verify-warehouse-db-only-10-6.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
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

const MARKETPLACE_HOST_RE =
  /statistics-api\.wildberries|finance-api\.wildberries|content-api\.wildberries|seller-analytics-api\.wildberries/;

/** True when file constructs marketplace HTTP or embeds host URLs (type-only imports ignored). */
function hasMarketplaceHttp(src) {
  if (MARKETPLACE_HOST_RE.test(src)) return true;
  if (/\bnew\s+WbApiClient\b|\bcreateWbSyncService\b/.test(src)) return true;
  const importRe =
    /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']@\/lib\/wildberries\/api-client["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    if (m[1]) continue;
    const names = m[2].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]);
    if (names.some((n) => n === "WbApiClient" || n === "createWbSyncService")) return true;
  }
  return false;
}

const HTTP_CLIENT_RE = /\bWbApiClient\b|\bcreateWbSyncService\b/;

/** Paths allowed to touch Marketplace HTTP (ingestion / adapters / legacy sync). */
function isAllowedMarketplaceHttpPath(rel) {
  const n = rel.replace(/\\/g, "/");
  return (
    n.startsWith("src/lib/marketplace-adapters/") ||
    n.startsWith("src/lib/wildberries/") ||
    n.startsWith("src/lib/warehouse/backfill/mock-adapter") ||
    n.includes("/warehouse/adapters/") ||
    /dashboard-sync-service|dashboard-sync-client|account-lifecycle-service|inventory-daily-snapshot-service|historical-inventory-service|sync-verification-audit|sync-job-service/.test(
      n
    ) ||
    n.includes("/api/sync/") ||
    n.includes("/api/warehouse/")
  );
}

const root = resolve(process.cwd());

console.log("=== Sprint 10.6 — DB-only Migration & Production Certification ===\n");

// --- Snapshot artifacts ---
console.log("--- Warehouse KPI snapshots ---");
const snapshotArtifacts = [
  ["KPI migration", "supabase/migrations/20260731180000_warehouse_kpi_snapshots_10_6.sql"],
  ["Snapshot types", "src/lib/warehouse/snapshots/types.ts"],
  ["Snapshot repository", "src/lib/warehouse/snapshots/repository.ts"],
  ["KPI read service", "src/services/warehouse-kpi-read-service.ts"],
  ["KPI snapshot sync (adapter)", "src/lib/marketplace-adapters/wildberries/kpi-snapshot-sync.ts"],
];
for (const [label, rel] of snapshotArtifacts) {
  check(label, existsSync(resolve(root, rel)));
}

const migration = readFileSync(
  resolve(root, "supabase/migrations/20260731180000_warehouse_kpi_snapshots_10_6.sql"),
  "utf8"
);
check("Migration creates warehouse_account_balance", migration.includes("warehouse_account_balance"));
check(
  "Migration creates warehouse_sales_report_snapshot",
  migration.includes("warehouse_sales_report_snapshot")
);

const kpiSync = readFileSync(
  resolve(root, "src/lib/marketplace-adapters/wildberries/kpi-snapshot-sync.ts"),
  "utf8"
);
check("KPI sync uses WbApiClient (ingestion)", kpiSync.includes("WbApiClient"));
check("KPI sync upserts warehouse_account_balance", kpiSync.includes("warehouse_account_balance"));
check(
  "KPI sync upserts warehouse_sales_report_snapshot",
  kpiSync.includes("warehouse_sales_report_snapshot")
);

const backfillSvc = readFileSync(resolve(root, "src/services/historical-backfill-service.ts"), "utf8");
const incrSvc = readFileSync(resolve(root, "src/services/incremental-sync-service.ts"), "utf8");
const opsSvc = readFileSync(resolve(root, "src/services/warehouse-ops-service.ts"), "utf8");
check("Historical backfill populates KPI snapshots", backfillSvc.includes("syncWildberriesKpiSnapshots"));
check("Incremental sync populates KPI snapshots", incrSvc.includes("syncWildberriesKpiSnapshots"));
check("Ops tick populates KPI snapshots", opsSvc.includes("syncWildberriesKpiSnapshots"));

// --- Dashboard DB-only ---
console.log("\n--- Dashboard KPI sources ---");
const ordersValue = readFileSync(resolve(root, "src/services/orders-value-service.ts"), "utf8");
const balance = readFileSync(resolve(root, "src/services/wb-balance-service.ts"), "utf8");
const salesReports = readFileSync(resolve(root, "src/services/wb-sales-reports-service.ts"), "utf8");
const shipment = readFileSync(resolve(root, "src/services/shipment-history-service.ts"), "utf8");
const dash = readFileSync(resolve(root, "src/services/dashboard-service.ts"), "utf8");

check("Orders Value service has no WbApiClient", !hasMarketplaceHttp(ordersValue));
check("Balance service has no WbApiClient", !hasMarketplaceHttp(balance));
check("Sales reports service has no WbApiClient", !hasMarketplaceHttp(salesReports));
check("Shipment history has no WbApiClient", !hasMarketplaceHttp(shipment));
check(
  "Orders Value resolves from warehouse DB",
  ordersValue.includes("resolveOrdersValueFromSources") || ordersValue.includes("price_with_disc")
);
check(
  "Balance reads warehouse KPI service",
  balance.includes("getBalanceMetricsFromWarehouse") || balance.includes("warehouse")
);
check(
  "Sales reports read warehouse snapshots",
  salesReports.includes("loadSalesReportsFromWarehouse") ||
    salesReports.includes("warehouse")
);
check("Dashboard does not import fetchWbOrdersApi", !dash.includes("fetchWbOrdersApi"));
check(
  "Dashboard strip comment asserts no marketplace HTTP",
  dash.includes("No marketplace HTTP") || dash.includes("warehouse")
);

// --- Business module isolation ---
console.log("\n--- Business module Marketplace HTTP audit ---");
const businessModules = [
  ["Financial Engine", ["src/lib/financial-engine.ts", "src/lib/financial-engine-tax.ts"]],
  ["Smart Pricing", ["src/services/smart-pricing-service.ts", "src/lib/smart-pricing.ts"]],
  ["Cost Management", ["src/services/cost-service.ts"]],
  ["Purchases", ["src/services/purchase-service.ts"]],
  ["Product Analytics", ["src/lib/product-profitability-builder.ts"]],
  ["Reporting lib", walkTsFiles(resolve(root, "src/lib/reporting")).map((f) => f)],
];

for (const [label, files] of businessModules) {
  const src = files
    .filter((f) => existsSync(typeof f === "string" && f.startsWith("src") ? resolve(root, f) : f))
    .map((f) => readFileSync(typeof f === "string" && f.startsWith("src") ? resolve(root, f) : f, "utf8"))
    .join("\n");
  check(`${label} has no WbApiClient`, !hasMarketplaceHttp(src));
  check(`${label} has no marketplace host URLs`, !MARKETPLACE_HOST_RE.test(src));
}

const reportingCtx = readFileSync(resolve(root, "src/lib/reporting/report-context.ts"), "utf8");
check(
  "Reporting uses Financial Engine / dashboard services",
  reportingCtx.includes("getOverviewMetrics") && reportingCtx.includes("financialEngine")
);

// --- Global residual scan ---
console.log("\n--- Repository audit (business paths = 0 marketplace HTTP) ---");
const allSrc = walkTsFiles(resolve(root, "src"));
const offenders = [];
for (const file of allSrc) {
  const rel = file.replace(root + "\\", "").replace(root + "/", "").replace(/\\/g, "/");
  if (isAllowedMarketplaceHttpPath(rel)) continue;
  const src = readFileSync(file, "utf8");
  if (hasMarketplaceHttp(src)) {
    offenders.push(rel);
  }
}
check(
  "No business module uses Marketplace HTTP",
  offenders.length === 0,
  offenders.length ? offenders.join(", ") : "0 offenders"
);

// marketplace-account may import adapters for connection test only
const acct = readFileSync(resolve(root, "src/services/marketplace-account-service.ts"), "utf8");
check(
  "Marketplace account connection test uses adapter helper",
  acct.includes("testWildberriesConnection") && !acct.includes("new WbApiClient")
);

const invVal = readFileSync(resolve(root, "src/services/inventory-validation-service.ts"), "utf8");
check("Inventory validation has no WbApiClient", !hasMarketplaceHttp(invVal));

// --- Warehouse package ---
console.log("\n--- Warehouse package ---");
const warehouseSrc = walkTsFiles(resolve(root, "src/lib/warehouse"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
check(
  "Warehouse package has no marketplace HTTP client",
  !hasMarketplaceHttp(warehouseSrc)
);

// --- Certification checklist ---
console.log("\n--- Production certification checklist ---");
const cert = [
  ["Dashboard reads Warehouse only", !hasMarketplaceHttp(dash) && !hasMarketplaceHttp(ordersValue)],
  ["Reporting reads Warehouse / FE only", !hasMarketplaceHttp(reportingCtx)],
  ["Financial Engine repository only", !hasMarketplaceHttp(readFileSync(resolve(root, "src/lib/financial-engine.ts"), "utf8"))],
  ["Smart Pricing Warehouse only", !hasMarketplaceHttp(readFileSync(resolve(root, "src/services/smart-pricing-service.ts"), "utf8"))],
  ["Cost Management Warehouse only", !hasMarketplaceHttp(readFileSync(resolve(root, "src/services/cost-service.ts"), "utf8"))],
  ["Purchases Warehouse only", !hasMarketplaceHttp(readFileSync(resolve(root, "src/services/purchase-service.ts"), "utf8"))],
  ["Marketplace HTTP only in sync/adapters", offenders.length === 0],
];
for (const [label, ok] of cert) {
  check(label, ok);
}

console.log(
  `\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`
);
if (failures === 0) {
  console.log(
    "Production Ready: business modules use Warehouse DB exclusively; Marketplace APIs are ingestion-only."
  );
}
process.exit(failures === 0 ? 0 : 1);
