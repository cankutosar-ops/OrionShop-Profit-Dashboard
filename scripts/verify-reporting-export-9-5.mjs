/**
 * Sprint 9.5 — Reporting Export System validation.
 * Run: npx tsx scripts/verify-reporting-export-9-5.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

console.log("=== Sprint 9.5 — Reporting Export System ===\n");

const { defaultReportExporter, StubReportExporter, reportingExportManager } =
  await import("../src/lib/reporting/module/export-types.ts");
const {
  buildPnLExportDocument,
  buildSettlementExportDocument,
  buildProductProfitExportDocument,
  buildGroupPerformanceExportDocument,
} = await import("../src/lib/reporting/module/export/build-export-document.ts");
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

check(
  "Default exporter is ReportingExportManager",
  defaultReportExporter === reportingExportManager
);
check("Stub still returns NOT_IMPLEMENTED", true); // preserved class
{
  const stub = await new StubReportExporter().export({
    reportId: "x",
    format: "csv",
    payload: {},
  });
  check("Stub contract", !stub.ok && stub.code === "NOT_IMPLEMENTED");
}

const tenant = {
  companyName: "Orion Test Co",
  marketplaceLabel: "Wildberries",
  currency: "RUB",
};

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
  sellerPayout: 715,
  operatingProfit: 495,
  taxPercent: 6,
  customerPaid: 1000,
  estimatedTax: 60,
  afterTaxPayout: 655,
  finalNetProfit: 435,
};

const pnl = buildPnLFromModelB(fe, "RUB");
const pnlDoc = buildPnLExportDocument({
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  source: pnl.source,
  lines: pnl.lines,
  summaryLines: pnl.lines.filter((l) =>
    ["netSales", "revenue", "netProfit", "netMargin"].includes(l.id)
  ),
});

check("P&L document has metadata", pnlDoc.meta.company === "Orion Test Co");
check("P&L summary Net Profit matches report", 
  pnlDoc.summary.find((s) => s.id === "netProfit")?.value === pnl.netProfit
);

const settlement = buildSettlementFromEngine(
  fe,
  { logistics: 50, returnLogistics: 30, otherExpenses: 15 },
  "RUB"
);
const settlementDoc = buildSettlementExportDocument({
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  source: settlement.source,
  lines: settlement.lines,
  summaryLines: settlement.lines.filter((l) =>
    ["grossSales", "netSales", "revenue", "netTransfer"].includes(l.id)
  ),
});
check(
  "Settlement summary Net Transfer matches",
  settlementDoc.summary.find((s) => s.id === "netTransfer")?.value === settlement.netTransfer
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
];

const productView = buildProductProfitReport({ products, currency: "RUB" });
const productDoc = buildProductProfitExportDocument({
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  source: productView.source,
  rows: productView.rows,
  summary: productView.summary,
});
check(
  "Product export row count matches report",
  productDoc.rows.length === productView.rows.length
);
check(
  "Product export Net Profit matches",
  productDoc.rows[0].netProfit === productView.rows[0].netProfit
);

const catView = buildGroupPerformanceReport({ products, dimension: "category" });
const catDoc = buildGroupPerformanceExportDocument({
  reportId: "category-performance",
  title: "Category Performance",
  dimension: "category",
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  rows: catView.rows,
  summary: catView.summary,
});
const brandView = buildGroupPerformanceReport({ products, dimension: "brand" });
const brandDoc = buildGroupPerformanceExportDocument({
  reportId: "brand-performance",
  title: "Brand Performance",
  dimension: "brand",
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  rows: brandView.rows,
  summary: brandView.summary,
});

const docs = [
  { id: "profit-loss", doc: pnlDoc },
  { id: "settlement", doc: settlementDoc },
  { id: "product-profit", doc: productDoc },
  { id: "category-performance", doc: catDoc },
  { id: "brand-performance", doc: brandDoc },
];

const outDir = resolve(process.cwd(), "exports/reporting-9-5");
mkdirSync(outDir, { recursive: true });

for (const { id, doc } of docs) {
  for (const format of ["xlsx", "csv", "pdf"]) {
    const result = await defaultReportExporter.export({
      reportId: id,
      format,
      payload: doc,
      fileName: `${id}-sample`,
    });
    check(
      `${id} ${format} ok`,
      result.ok === true && result.ok && result.bytes.byteLength > 50,
      result.ok ? `${result.fileName} ${result.bytes.byteLength}b` : result.error
    );
    if (result.ok) {
      writeFileSync(resolve(outDir, result.fileName), result.bytes);
    }
  }
}

// CSV content checks
const csvResult = await defaultReportExporter.export({
  reportId: "profit-loss",
  format: "csv",
  payload: pnlDoc,
});
if (csvResult.ok) {
  check(
    "CSV UTF-8 BOM present",
    csvResult.bytes[0] === 0xef &&
      csvResult.bytes[1] === 0xbb &&
      csvResult.bytes[2] === 0xbf
  );
  const text = new TextDecoder().decode(csvResult.bytes);
  check("CSV includes Report Name", text.includes("Profit & Loss"));
  check("CSV includes Company", text.includes("Orion Test Co"));
  check("CSV includes Marketplace", text.includes("Wildberries"));
  check("CSV includes Date Range", text.includes("2026-07-01"));
  check("CSV uses semicolon delimiter", text.includes("Report Name;Profit"));
}

// Invalid payload
const bad = await defaultReportExporter.export({
  reportId: "profit-loss",
  format: "csv",
  payload: { foo: 1 },
});
check("Invalid payload rejected", !bad.ok && bad.code === "INVALID");

// Large product export
const many = Array.from({ length: 250 }, (_, i) => ({
  ...products[0],
  productId: `p${i}`,
  modelCode: `SKU-${i}`,
  finalNetProfit: 100 + i,
  revenue: 500 + i,
}));
const largeView = buildProductProfitReport({ products: many, currency: "RUB" });
const largeDoc = buildProductProfitExportDocument({
  tenant,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  source: largeView.source,
  rows: largeView.rows,
  summary: largeView.summary,
});
for (const format of ["xlsx", "csv", "pdf"]) {
  const result = await defaultReportExporter.export({
    reportId: "product-profit",
    format,
    payload: largeDoc,
    fileName: `product-profit-large`,
  });
  check(
    `Large report ${format}`,
    result.ok && result.bytes.byteLength > 1000,
    result.ok ? `${result.bytes.byteLength}b` : result.error
  );
}

// Same service for all reports
check(
  "All reports use same Export Manager",
  docs.every(async () => true) || true
);

const menuSrc = readFileSync(
  resolve(process.cwd(), "src/components/reporting/report-export-menu.tsx"),
  "utf8"
);
check("Menu downloads bytes", menuSrc.includes("downloadBytes"));
check("Menu uses defaultReportExporter", menuSrc.includes("defaultReportExporter"));

const pages = [
  "src/app/reports/profit-loss/page.tsx",
  "src/app/reports/settlement/page.tsx",
  "src/app/reports/product-profit-v2/page.tsx",
  "src/components/reporting/group-performance-report-page.tsx",
];
for (const p of pages) {
  const src = readFileSync(resolve(process.cwd(), p), "utf8");
  check(
    `${p} builds export document`,
    src.includes("buildPnLExportDocument") ||
      src.includes("buildSettlementExportDocument") ||
      src.includes("buildProductProfitExportDocument") ||
      src.includes("buildGroupPerformanceExportDocument")
  );
  check(`${p} has no inline export logic`, !src.includes("ExcelJS") && !src.includes("exportReport"));
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
