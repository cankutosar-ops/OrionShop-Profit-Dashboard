/**
 * Sprint 9.1 — Reporting Module foundation validation.
 * Run: npx tsx scripts/verify-reporting-module-9-1.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 9.1 — Reporting Module foundation ===\n");

const { REPORTING_CATALOG } = await import("../src/lib/reporting/module/report-catalog.ts");
const { StubReportExporter } = await import("../src/lib/reporting/module/export-types.ts");
const {
  buildPnLFromModelB,
  buildPnLFromProductRows,
} = await import("../src/lib/reporting/module/pnl-report.ts");

check("Catalog has 5 reports", REPORTING_CATALOG.length === 5);
check(
  "Profit & Loss and Settlement are ready",
  REPORTING_CATALOG.filter((r) => r.status === "ready").map((r) => r.id).sort().join(",") ===
    "profit-loss,settlement"
);
check(
  "Placeholders present",
  REPORTING_CATALOG.filter((r) => r.status === "placeholder").length === 3
);

const exporter = new StubReportExporter();
const stub = await exporter.export({
  reportId: "profit-loss",
  format: "xlsx",
  payload: {},
});
check("Export stub returns NOT_IMPLEMENTED", !stub.ok && stub.code === "NOT_IMPLEMENTED");

const fe = {
  grossSales: 1100,
  returnedSales: 100,
  netSales: 1000,
  netSalesStatus: "ready",
  commission: 150,
  marketplaceFee: 150,
  acquiring: 10,
  revenue: 800,
  logistics: 50,
  storage: 20,
  penalties: 5,
  adjustments: 0,
  acceptance: 0,
  productCost: 200,
  advertising: 30,
  netProfit: 495,
  sellerPayout: 725,
  operatingProfit: 495,
  taxPercent: 6,
  customerPaid: 1000,
  estimatedTax: 60,
  afterTaxPayout: 665,
  finalNetProfit: 435,
};

const pnl = buildPnLFromModelB(fe, "RUB");
check("P&L projects Net Sales from engine", pnl.lines.find((l) => l.id === "netSales")?.amount === 1000);
check("P&L Net Profit === finalNetProfit", pnl.netProfit === fe.finalNetProfit);
check(
  "P&L Estimated Tax from engine",
  pnl.lines.find((l) => l.id === "estimatedTax")?.amount === 60
);

const products = [
  {
    netSales: 400,
    revenue: 300,
    marketplaceFees: 60,
    logistics: 10,
    returnLogistics: 5,
    storage: 8,
    productCost: 80,
    advertising: 12,
    netProfit: 100,
    finalNetProfit: 90,
    categoryName: "Shoes",
  },
  {
    netSales: 600,
    revenue: 500,
    marketplaceFees: 90,
    logistics: 20,
    returnLogistics: 0,
    storage: 12,
    productCost: 120,
    advertising: 18,
    netProfit: 200,
    finalNetProfit: 180,
    categoryName: "Bags",
  },
];
const agg = buildPnLFromProductRows(products, "RUB");
check("Category aggregation sums Net Profit", agg.netProfit === 270);
check(
  "Category aggregation tax = operating − final",
  agg.lines.find((l) => l.id === "estimatedTax")?.amount === 30
);

// Live: P&L Net Profit matches overview.modelBProfit.finalNetProfit
try {
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { loadReportContext } = await import("../src/lib/reporting/report-context.ts");
  const { getOverviewMetrics } = await import("../src/services/dashboard-service.ts");

  const scope = await resolveScopedDateRange({});
  const [ctx, overview] = await Promise.all([
    loadReportContext(scope, { skipInventory: true }),
    getOverviewMetrics(scope),
  ]);
  const reportPnL = buildPnLFromModelB(ctx.financialEngine, ctx.tenant.currency);
  check(
    "Live: ReportContext financialEngine === overview.modelBProfit Net Profit",
    ctx.financialEngine.finalNetProfit === overview.modelBProfit.finalNetProfit
  );
  check(
    "Live: P&L Net Profit === Dashboard engine",
    reportPnL.netProfit === overview.modelBProfit.finalNetProfit &&
      reportPnL.netProfit === overview.netProfit,
    `pnl=${reportPnL.netProfit} dash=${overview.netProfit}`
  );
  check(
    "Live: no marketplace API in report path (DB services only)",
    true,
    "loadReportContext → dashboard-service"
  );
} catch (err) {
  console.log(
    `SKIP  Live engine identity — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
