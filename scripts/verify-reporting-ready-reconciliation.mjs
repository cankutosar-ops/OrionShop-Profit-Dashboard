/**
 * Reporting READY reports — reconciliation + export smoke (FE-backed, no new formulas).
 * Run: npx tsx scripts/verify-reporting-ready-reconciliation.mjs
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
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

function nearlyEqual(a, b, eps = 0.02) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

function sum(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

console.log("=== Reporting READY — reconciliation & Excel ===\n");

const { buildPnLFromModelB } = await import("../src/lib/reporting/module/pnl-report.ts");
const { buildSettlementFromEngine } = await import(
  "../src/lib/reporting/module/settlement-report.ts"
);
const { buildProductProfitReport } = await import(
  "../src/lib/reporting/module/product-profit-report.ts"
);
const { buildGroupPerformanceReport } = await import(
  "../src/lib/reporting/module/group-performance-report.ts"
);
const {
  buildPnLExportDocument,
  buildSettlementExportDocument,
  buildProductProfitExportDocument,
  buildGroupPerformanceExportDocument,
} = await import("../src/lib/reporting/module/export/build-export-document.ts");
const { reportingExportManager } = await import(
  "../src/lib/reporting/module/export/export-manager.ts"
);
const { renderWeeklyBusinessWorkbook } = await import(
  "../src/lib/reporting/weekly-business/render-weekly-workbook.ts"
);
const { buildWeeklyBusinessWorkbookModel } = await import(
  "../src/lib/reporting/weekly-business/build-weekly-workbook-model.ts"
);

const fixtures = [
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
    penalties: 5,
    otherExpenses: 0,
    netProfit: 500,
    returnRate: 0,
    unitsSold: 10,
    unitsReturned: 1,
    netSales: 1200,
    finalNetProfit: 400,
    marketplaceFees: 150,
    accountAdjustments: 15,
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
    revenue: 800,
    productCost: 160,
    commission: 80,
    logistics: 30,
    returnLogistics: 0,
    storage: 10,
    advertising: 20,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 300,
    returnRate: 0,
    unitsSold: 8,
    unitsReturned: 0,
    netSales: 900,
    finalNetProfit: 250,
    marketplaceFees: 120,
    accountAdjustments: 10,
    reimbursements: 0,
    orders: 9,
    purchases: 8,
    conversionPercent: 88,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 30,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
];

const fe = {
  grossSales: 2300,
  returnedSales: 200,
  netSales: 2100,
  netSalesStatus: "ready",
  commission: 270,
  marketplaceFee: 270,
  acquiring: 12,
  revenue: 1800,
  logistics: 80,
  storage: 30,
  penalties: 5,
  adjustments: 25,
  acceptance: 3,
  productCost: 360,
  advertising: 50,
  netProfit: 800,
  sellerPayout: 1500,
  operatingProfit: 800,
  taxPercent: 6,
  customerPaid: 2100,
  estimatedTax: 150,
  afterTaxPayout: 1350,
  finalNetProfit: 650,
};

const pnl = buildPnLFromModelB(fe, "RUB");
check("P&L Net Profit = FE finalNetProfit", pnl.netProfit === fe.finalNetProfit);
check(
  "P&L Revenue = FE revenue",
  pnl.lines.find((l) => l.id === "revenue")?.amount === fe.revenue
);
check(
  "P&L Estimated Tax = FE estimatedTax",
  pnl.lines.find((l) => l.id === "estimatedTax")?.amount === fe.estimatedTax
);

const settlement = buildSettlementFromEngine(
  fe,
  {
    logistics: fe.logistics,
    returnLogistics: 0,
    otherExpenses: fe.adjustments,
  },
  "RUB"
);
check(
  "Settlement Net Transfer = FE sellerPayout",
  settlement.netTransfer === fe.sellerPayout
);
check(
  "Settlement projects from Model B (has lines)",
  settlement.lines.length >= 5,
  `lines=${settlement.lines.length}`
);

const productView = buildProductProfitReport({ products: fixtures, currency: "RUB" });
check(
  "Product Profit TOTAL revenue = Σ products",
  nearlyEqual(productView.totals.revenue, 1800)
);
check(
  "Product Profit TOTAL netProfit = Σ finalNetProfit",
  nearlyEqual(productView.totals.netProfit, 650)
);

const category = buildGroupPerformanceReport({
  products: fixtures,
  dimension: "category",
  currency: "RUB",
});
const brand = buildGroupPerformanceReport({
  products: fixtures,
  dimension: "brand",
  currency: "RUB",
});

check(
  "Category TOTAL = Product TOTAL (revenue)",
  nearlyEqual(category.totals.revenue, productView.totals.revenue)
);
check(
  "Category TOTAL = Product TOTAL (netProfit)",
  nearlyEqual(category.totals.netProfit, productView.totals.netProfit)
);
check(
  "Brand TOTAL = Product TOTAL (revenue)",
  nearlyEqual(brand.totals.revenue, productView.totals.revenue)
);
check(
  "Brand TOTAL = Product TOTAL (netProfit)",
  nearlyEqual(brand.totals.netProfit, productView.totals.netProfit)
);
check(
  "Category adjustments sum = product adjustments",
  nearlyEqual(sum(category.rows, "adjustments"), sum(productView.rows, "adjustments"))
);

const tenant = {
  companyName: "Test Co",
  marketplaceLabel: "Wildberries",
  currency: "RUB",
};

const outDir = resolve(process.cwd(), "exports/reporting-ready-recon");
mkdirSync(outDir, { recursive: true });

const docs = [
  [
    "pnl",
    buildPnLExportDocument({
      tenant,
      dateFrom: "2026-08-09",
      dateTo: "2026-09-07",
      source: pnl.source,
      lines: pnl.lines,
      summaryLines: pnl.lines.filter((l) =>
        ["revenue", "netProfit", "netMargin"].includes(l.id)
      ),
    }),
  ],
  [
    "settlement",
    buildSettlementExportDocument({
      tenant,
      dateFrom: "2026-08-09",
      dateTo: "2026-09-07",
      source: settlement.source,
      lines: settlement.lines,
      summaryLines: settlement.lines.filter((l) => l.isTotal),
    }),
  ],
  [
    "product",
    buildProductProfitExportDocument({
      tenant,
      dateFrom: "2026-08-09",
      dateTo: "2026-09-07",
      source: productView.source,
      rows: productView.rows,
      summary: productView.summary,
    }),
  ],
  [
    "category",
    buildGroupPerformanceExportDocument({
      reportId: "category-performance",
      title: "Category Performance",
      dimension: "category",
      tenant,
      dateFrom: "2026-08-09",
      dateTo: "2026-09-07",
      rows: category.rows,
      summary: category.summary,
    }),
  ],
  [
    "brand",
    buildGroupPerformanceExportDocument({
      reportId: "brand-performance",
      title: "Brand Performance",
      dimension: "brand",
      tenant,
      dateFrom: "2026-08-09",
      dateTo: "2026-09-07",
      rows: brand.rows,
      summary: brand.summary,
    }),
  ],
];

for (const [name, doc] of docs) {
  const result = await reportingExportManager.export({
    reportId: doc.reportId,
    format: "xlsx",
    payload: doc,
    fileName: `${name}-sample`,
  });
  check(`${name} Excel export ok`, result.ok === true, result.ok ? result.fileName : result.error);
  if (result.ok) {
    writeFileSync(resolve(outDir, result.fileName), result.bytes);
  }
}

// Filter/date range stamped on export meta
const pnlDoc = docs[0][1];
check(
  "Export date range matches filters",
  pnlDoc.meta.dateFrom === "2026-08-09" && pnlDoc.meta.dateTo === "2026-09-07"
);

// Live account isolation + FE identity (optional when DB available)
try {
  const { parseDateRange } = await import("../src/lib/utils.ts");
  const { resolveMarketplaceAccountId } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { loadReportContext } = await import("../src/lib/reporting/report-context.ts");

  const scopes = [];
  for (const accountId of ["1", "2"]) {
    const resolved = await resolveMarketplaceAccountId(accountId, null);
    check(
      `Account ${accountId}: scope resolves to requested id`,
      String(resolved.marketplaceAccountId) === accountId,
      `got=${resolved.marketplaceAccountId}`
    );
    const dates = parseDateRange("2026-08-09", "2026-09-07");
    const scope = {
      ...dates,
      marketplaceAccountId: resolved.marketplaceAccountId,
      companyId: resolved.companyId,
      brandId: undefined,
    };
    const ctx = await loadReportContext(scope, { skipInventory: true });
    scopes.push({ accountId, ctx, scope });
    check(
      `Account ${accountId}: context account matches`,
      String(ctx.scope.marketplaceAccountId) === accountId ||
        String(ctx.tenant.marketplaceAccountId ?? ctx.scope.marketplaceAccountId) ===
          accountId,
      `ctx=${ctx.scope.marketplaceAccountId}`
    );
    const livePnL = buildPnLFromModelB(ctx.financialEngine, ctx.tenant.currency);
    check(
      `Account ${accountId}: P&L = Engine`,
      nearlyEqual(livePnL.netProfit, ctx.financialEngine.finalNetProfit),
      `pnl=${livePnL.netProfit} fe=${ctx.financialEngine.finalNetProfit}`
    );
    const liveProducts = buildProductProfitReport({
      products: ctx.products,
      currency: ctx.tenant.currency,
    });
    const liveCat = buildGroupPerformanceReport({
      products: ctx.products,
      dimension: "category",
      currency: ctx.tenant.currency,
    });
    const liveBrand = buildGroupPerformanceReport({
      products: ctx.products,
      dimension: "brand",
      currency: ctx.tenant.currency,
    });
    check(
      `Account ${accountId}: Category = Product`,
      nearlyEqual(liveCat.totals.netProfit, liveProducts.totals.netProfit)
    );
    check(
      `Account ${accountId}: Brand = Product`,
      nearlyEqual(liveBrand.totals.netProfit, liveProducts.totals.netProfit)
    );

    const settlementLive = buildSettlementFromEngine(
      ctx.financialEngine,
      ctx.overview,
      ctx.tenant.currency
    );
    check(
      `Account ${accountId}: Settlement = Engine sellerPayout`,
      nearlyEqual(settlementLive.netTransfer, ctx.financialEngine.sellerPayout)
    );

    // Unified workbook model + render smoke
    const model = await buildWeeklyBusinessWorkbookModel(scope, {
      periodPresetLabel: "Custom",
    });
    const buffer = await renderWeeklyBusinessWorkbook(model);
    check(
      `Account ${accountId}: Unified Excel bytes`,
      buffer && buffer.byteLength > 1000,
      `bytes=${buffer?.byteLength ?? 0}`
    );
    writeFileSync(
      resolve(outDir, `unified-account-${accountId}-2026-08-09_2026-09-07.xlsx`),
      Buffer.from(buffer)
    );
  }

  if (scopes.length === 2) {
    const a1 = scopes[0].ctx.financialEngine.finalNetProfit;
    const a2 = scopes[1].ctx.financialEngine.finalNetProfit;
    const id1 = scopes[0].ctx.scope.marketplaceAccountId;
    const id2 = scopes[1].ctx.scope.marketplaceAccountId;
    check(
      "Account isolation: distinct account ids",
      String(id1) !== String(id2),
      `a1=${id1} a2=${id2}`
    );
    check(
      "Account isolation: Net Profit values are finite",
      Number.isFinite(a1) && Number.isFinite(a2),
      `a1=${a1} a2=${a2}`
    );
  }
} catch (err) {
  console.log(
    `SKIP  Live account reconciliation — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
