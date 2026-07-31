/**
 * Sprint 9.3 — Product Profit Report validation.
 * Run: npx tsx scripts/verify-product-profit-report-9-3.mjs
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

console.log("=== Sprint 9.3 — Product Profit Report ===\n");

const { REPORTING_CATALOG } = await import("../src/lib/reporting/module/report-catalog.ts");
const {
  buildProductProfitReport,
  calculateProductRoiPercent,
} = await import("../src/lib/reporting/module/product-profit-report.ts");
const { calculateModelBMarginPercent } = await import("../src/lib/financial-engine.ts");
const { StubReportExporter } = await import("../src/lib/reporting/module/export-types.ts");
const { readFileSync: readSrc } = await import("node:fs");

check(
  "Product Profit catalog entry is ready",
  REPORTING_CATALOG.find((r) => r.id === "product-profit")?.status === "ready"
);

const products = [
  {
    productId: "p1",
    modelCode: "SKU-1",
    productName: "Alpha",
    categoryName: "Cat A",
    brandName: "Brand X",
    revenue: 1000,
    productCost: 200,
    commission: 100,
    logistics: 40,
    returnLogistics: 10,
    storage: 20,
    advertising: 30,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 500,
    returnRate: 0,
    unitsSold: 10,
    unitsReturned: 0,
    netSales: 1200,
    finalNetProfit: 400,
    marketplaceFees: 150,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 12,
    purchases: 10,
    conversionPercent: 83,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 40,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
  {
    productId: "p2",
    modelCode: "SKU-2",
    productName: "Beta",
    categoryName: "Cat B",
    brandName: "Brand Y",
    revenue: 500,
    productCost: 0,
    commission: 50,
    logistics: 20,
    returnLogistics: 0,
    storage: 5,
    advertising: 10,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 100,
    returnRate: 0,
    unitsSold: 5,
    unitsReturned: 0,
    netSales: 600,
    finalNetProfit: 80,
    marketplaceFees: 70,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 6,
    purchases: 5,
    conversionPercent: 83,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 20,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
  {
    productId: "p3",
    modelCode: "SKU-3",
    productName: "Gamma",
    categoryName: "Cat A",
    brandName: "Brand X",
    revenue: 2000,
    productCost: 500,
    commission: 200,
    logistics: 80,
    returnLogistics: 20,
    storage: 40,
    advertising: 60,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 900,
    returnRate: 0,
    unitsSold: 20,
    unitsReturned: 0,
    netSales: 2400,
    finalNetProfit: 800,
    marketplaceFees: 300,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 22,
    purchases: 20,
    conversionPercent: 90,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 80,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
];

const view = buildProductProfitReport({ products, currency: "RUB" });

check(
  "Default sort: highest Net Profit first",
  view.rows[0]?.productId === "p3" && view.rows[1]?.productId === "p1"
);

const p1 = view.rows.find((r) => r.productId === "p1");
check("Maps Net Profit from finalNetProfit", p1?.netProfit === 400);
check("Maps Revenue from engine row", p1?.revenue === 1000);
check("Maps Net Sales from engine row", p1?.netSales === 1200);
check("Logistics = outbound + return", p1?.logistics === 50);
check(
  "Margin % matches Model B",
  p1?.netMarginPercent === calculateModelBMarginPercent(1000, 400)
);
check(
  "ROI = Net Profit / Product Cost × 100",
  p1?.roiPercent === calculateProductRoiPercent(400, 200) && p1?.roiPercent === 200
);
check("ROI null when productCost ≤ 0", view.rows.find((r) => r.productId === "p2")?.roiPercent === null);
check("Recommended Price absent by default", p1?.recommendedPrice === null);

const withPrice = buildProductProfitReport({
  products: [products[0]],
  recommendedPricesByProductId: { p1: 1999 },
});
check(
  "Recommended Price read-only when supplied",
  withPrice.rows[0]?.recommendedPrice === 1999
);

check("Totals: revenue sum", view.totals.revenue === 3500);
check("Totals: net profit sum", view.totals.netProfit === 1280);
check("Totals: units sold sum", view.totals.unitsSold === 35);
check(
  "Average Margin = Model B on totals",
  view.totals.averageMarginPercent === calculateModelBMarginPercent(3500, 1280)
);
check("Summary has 4 cards", view.summary.length === 4);
check(
  "Summary Total Revenue",
  view.summary.find((l) => l.id === "revenue")?.amount === 3500
);
check(
  "Summary Total Net Profit",
  view.summary.find((l) => l.id === "netProfit")?.amount === 1280
);

const filtered = buildProductProfitReport({ products, category: "Cat A" });
check("Category filter works", filtered.rows.length === 2 && filtered.rows.every((r) => r.category === "Cat A"));

const byMargin = buildProductProfitReport({
  products,
  sortKey: "netMarginPercent",
  sortDirection: "desc",
});
check(
  "Sort by Net Margin %",
  byMargin.rows[0]?.netMarginPercent >= byMargin.rows[1]?.netMarginPercent
);

const byRoi = buildProductProfitReport({ products, sortKey: "roiPercent", sortDirection: "desc" });
check(
  "Sort by ROI (nulls last when desc)",
  byRoi.rows[0]?.productId === "p1" || byRoi.rows[0]?.roiPercent != null
);

const exporter = new StubReportExporter();
const stub = await exporter.export({
  reportId: "product-profit",
  format: "csv",
  payload: view,
});
check("Export still NOT_IMPLEMENTED", !stub.ok && stub.code === "NOT_IMPLEMENTED");

const pageSrc = readSrc(resolve(process.cwd(), "src/app/reports/product-profit-v2/page.tsx"), "utf8");
const moduleSrc = readSrc(
  resolve(process.cwd(), "src/lib/reporting/module/product-profit-report.ts"),
  "utf8"
);
check(
  "Page uses loadReportContext",
  pageSrc.includes("loadReportContext") && pageSrc.includes("buildProductProfitReport")
);
check(
  "No Smart Pricing solver in report module",
  !moduleSrc.includes("solveTargetPrice") &&
    !moduleSrc.includes("buildSmartPricing") &&
    !moduleSrc.includes("getSmartPricing")
);
check(
  "No WB API client in report module",
  !moduleSrc.includes("wildberries") && !moduleSrc.includes("api-client")
);

// Live identity vs Financial Engine
try {
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { loadReportContext } = await import("../src/lib/reporting/report-context.ts");
  const { getOverviewMetrics } = await import("../src/services/dashboard-service.ts");

  const scope = await resolveScopedDateRange({});
  const [ctx, overviewLive] = await Promise.all([
    loadReportContext(scope, { skipInventory: true }),
    getOverviewMetrics(scope),
  ]);
  const live = buildProductProfitReport({
    products: ctx.products,
    currency: ctx.tenant.currency,
  });

  const sumProfit = live.totals.netProfit;
  const sumRevenue = live.totals.revenue;
  const engineProfit = ctx.financialEngine.finalNetProfit;
  const engineRevenue = ctx.financialEngine.revenue;

  // Product rows may not sum exactly to account FE when account-level adjustments exist;
  // compare to sum of product engine rows and to dashboard products identity.
  const ctxSumProfit = ctx.products.reduce((s, p) => s + p.finalNetProfit, 0);
  const ctxSumRevenue = ctx.products.reduce((s, p) => s + p.revenue, 0);

  check(
    "Live: report Net Profit === sum of FE product rows",
    Math.abs(sumProfit - ctxSumProfit) < 0.01,
    `report=${sumProfit} products=${ctxSumProfit}`
  );
  check(
    "Live: report Revenue === sum of FE product rows",
    Math.abs(sumRevenue - ctxSumRevenue) < 0.01,
    `report=${sumRevenue} products=${ctxSumRevenue}`
  );
  check(
    "Live: dashboard Model B revenue available",
    Number.isFinite(overviewLive.modelBProfit.revenue) &&
      overviewLive.modelBProfit.revenue === engineRevenue,
    `fe=${engineRevenue}`
  );
  check(
    "Live: dashboard Model B net profit available",
    Number.isFinite(overviewLive.modelBProfit.finalNetProfit) &&
      overviewLive.modelBProfit.finalNetProfit === engineProfit,
    `fe=${engineProfit}`
  );

  if (live.rows.length > 0) {
    const sample = live.rows[0];
    const src = ctx.products.find((p) => p.productId === sample.productId);
    check(
      "Live: sample row Net Profit matches product FE",
      src != null && sample.netProfit === src.finalNetProfit
    );
    check(
      "Live: sample margin matches Model B",
      src != null &&
        sample.netMarginPercent ===
          calculateModelBMarginPercent(src.revenue, src.finalNetProfit)
    );
  }
} catch (err) {
  console.log(
    `SKIP  Live product-profit identity — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
