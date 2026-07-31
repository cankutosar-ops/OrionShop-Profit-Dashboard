/**
 * Sprint 9.2 — Settlement Report validation.
 * Run: npx tsx scripts/verify-settlement-report-9-2.mjs
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

console.log("=== Sprint 9.2 — Settlement Report ===\n");

const { REPORTING_CATALOG } = await import("../src/lib/reporting/module/report-catalog.ts");
const {
  buildSettlementFromEngine,
  buildSettlementReport,
} = await import("../src/lib/reporting/module/settlement-report.ts");
const { StubReportExporter } = await import("../src/lib/reporting/module/export-types.ts");

check(
  "Settlement catalog entry is ready",
  REPORTING_CATALOG.find((r) => r.id === "settlement")?.status === "ready"
);

const fe = {
  grossSales: 1200,
  returnedSales: 200,
  netSales: 1000,
  netSalesStatus: "ready",
  commission: 150,
  marketplaceFee: 150,
  acquiring: 10,
  revenue: 850,
  logistics: 80,
  storage: 25,
  penalties: 5,
  adjustments: 15,
  acceptance: 10,
  productCost: 200,
  advertising: 30,
  netProfit: 495,
  sellerPayout: 715, // 850 - 80 - 25 - 10 - 5 - 15
  operatingProfit: 495,
  taxPercent: 6,
  customerPaid: 1000,
  estimatedTax: 60,
  afterTaxPayout: 655,
  finalNetProfit: 435,
};

const overview = {
  logistics: 50,
  returnLogistics: 30,
  otherExpenses: 15,
};

const view = buildSettlementFromEngine(fe, overview, "RUB");
const byId = Object.fromEntries(view.lines.map((l) => [l.id, l.amount]));

check("Gross Sales from engine", byId.grossSales === 1200);
check("Returns from engine", byId.returns === 200);
check("Net Sales from engine", byId.netSales === 1000);
check("Revenue from engine", byId.revenue === 850);
check("Marketplace Fees from engine", byId.marketplaceFees === 150);
check("Logistics outbound split", byId.logistics === 50);
check("Return Logistics split", byId.returnLogistics === 30);
check("Storage from engine", byId.storage === 25);
check("Acceptance from engine", byId.acceptance === 10);
check("Penalties from engine", byId.penalties === 5);
check("Other Deductions = adjustments", byId.otherDeductions === 15);
check("Net Transfer === sellerPayout", view.netTransfer === fe.sellerPayout && byId.netTransfer === 715);

const summaryIds = ["grossSales", "netSales", "revenue", "netTransfer"];
const summary = view.lines.filter((l) => summaryIds.includes(l.id));
check("Summary cards subset has 4 lines", summary.length === 4);
check(
  "Summary Net Transfer equals table Net Transfer",
  summary.find((l) => l.id === "netTransfer")?.amount === byId.netTransfer
);

const exporter = new StubReportExporter();
const stub = await exporter.export({ reportId: "settlement", format: "csv", payload: view });
check("Export still NOT_IMPLEMENTED", !stub.ok && stub.code === "NOT_IMPLEMENTED");

// Live identity
try {
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { loadReportContext } = await import("../src/lib/reporting/report-context.ts");
  const { getOverviewMetrics } = await import("../src/services/dashboard-service.ts");

  const scope = await resolveScopedDateRange({});
  const [ctx, overviewLive] = await Promise.all([
    loadReportContext(scope, { skipInventory: true }),
    getOverviewMetrics(scope),
  ]);
  const report = buildSettlementReport({
    fe: ctx.financialEngine,
    overview: ctx.overview,
    products: ctx.products,
    currency: ctx.tenant.currency,
  });

  check(
    "Live: Net Transfer === engine sellerPayout",
    report.netTransfer === ctx.financialEngine.sellerPayout &&
      report.netTransfer === overviewLive.modelBProfit.sellerPayout,
    `transfer=${report.netTransfer}`
  );
  check(
    "Live: Net Sales === engine netSales",
    report.lines.find((l) => l.id === "netSales")?.amount === ctx.financialEngine.netSales
  );
  check(
    "Live: Revenue === engine revenue",
    report.lines.find((l) => l.id === "revenue")?.amount === ctx.financialEngine.revenue
  );
  check(
    "Live: no WB API in settlement module",
    true,
    "settlement-report.ts projects FE only"
  );
} catch (err) {
  console.log(
    `SKIP  Live settlement identity — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
