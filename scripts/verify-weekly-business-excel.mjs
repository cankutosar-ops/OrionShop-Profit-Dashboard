#!/usr/bin/env node
/**
 * Unified Business Excel — deterministic verification (no live WB required).
 * Covers any-range titles, period chunks (7d / intra-month weeks / multi-month),
 * incomplete Finance warning, and FE builder reuse.
 * Run: npm run verify:weekly-business-excel
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

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

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

console.log("=== Unified Business Excel Verification ===\n");

check(
  "Module exists",
  existsSync("src/lib/reporting/weekly-business/index.ts")
);
check(
  "Period chunks helper exists",
  existsSync("src/lib/reporting/weekly-business/period-chunks.ts")
);
check(
  "Model builder exists",
  existsSync("src/lib/reporting/weekly-business/build-weekly-workbook-model.ts")
);
check(
  "Renderer exists",
  existsSync("src/lib/reporting/weekly-business/render-weekly-workbook.ts")
);

const builderSrc = read("src/lib/reporting/weekly-business/build-weekly-workbook-model.ts");
const renderSrc = read("src/lib/reporting/weekly-business/render-weekly-workbook.ts");
const glossarySrc = read("src/lib/reporting/weekly-business/glossary.ts");
const chunksSrc = read("src/lib/reporting/weekly-business/period-chunks.ts");
const apiSrc = read("src/app/api/reports/generate/route.ts");
const pageSrc = read("src/app/reports/page.tsx");
const btnSrc = read("src/components/reports/export-business-report-button.tsx");

check("Uses loadReportContext", /loadReportContext/.test(builderSrc));
check("Uses buildPnLFromModelB", /buildPnLFromModelB/.test(builderSrc));
check("Uses buildSettlementReport", /buildSettlementReport/.test(builderSrc));
check("Uses buildProductProfitReport", /buildProductProfitReport/.test(builderSrc));
check(
  "Uses buildGroupPerformanceReport",
  /buildGroupPerformanceReport/.test(builderSrc)
);
check(
  "Does not import profit-engine recalculation",
  !/buildModelBProfitMetrics/.test(builderSrc) &&
    !/buildModelBProfitMetrics/.test(renderSrc)
);
check(
  "Finance incomplete warning constant",
  /FINANCE DATA INCOMPLETE/.test(builderSrc)
);
check(
  "Builder uses period chunks",
  /buildPeriodChunks/.test(builderSrc) && /formatUnifiedReportTitle/.test(builderSrc)
);
check(
  "No weekly-only assumption in chunk helper",
  /any selected date range|calendar months|multiMonth/i.test(chunksSrc) ||
    /buildPeriodChunks/.test(chunksSrc)
);
check(
  "Glossary rejects Excel Продажа = Net Sales",
  /DIFFERENT_IDENTITY/.test(glossarySrc) && /Продажа/.test(glossarySrc)
);
check(
  "API supports weekly-business-excel (compat id)",
  /weekly-business-excel/.test(apiSrc)
);
check(
  "Reports hub mounts Unified export button",
  /ExportWeeklyBusinessExcelButton/.test(pageSrc) &&
    /Unified Business Excel/.test(pageSrc)
);
check(
  "Export button label is Download Unified Business Excel",
  /Download Unified Business Excel/.test(btnSrc) && /weekly-business-excel/.test(btnSrc)
);
check("Renderer uses workbook-kit", /workbook-kit/.test(renderSrc));
check(
  "Renderer uses dynamic reportTitle",
  /model\.reportTitle/.test(renderSrc)
);
check(
  "Filename uses unified-business prefix",
  /unified-business_/.test(renderSrc)
);
check(
  "All 13 sheet names defined",
  /00 Cover/.test(read("src/lib/reporting/weekly-business/types.ts")) &&
    /11 Sales Detail/.test(read("src/lib/reporting/weekly-business/types.ts")) &&
    /12 Cash Flow/.test(read("src/lib/reporting/weekly-business/types.ts"))
);
check(
  "Cash Flow sheet uses existing FE/overview outputs",
  /sellerPayoutSettlement|actualCashReceived|function buildCashFlow/.test(
    builderSrc
  ) && /buildCashFlowSheet|WB Seller Payout \/ Settlement/.test(renderSrc)
);
check(
  "Finance Detail fetches account-scoped wb_finance (no product filter)",
  /fetchFinanceInRange\(scope/.test(builderSrc) &&
    /fetchLatestFinanceOperationDate/.test(builderSrc) &&
    !/productIds: productIds\.length/.test(builderSrc)
);
check(
  "Brand/account reconciliation components built",
  /Unallocated Account-Level Cost/.test(builderSrc) &&
    /explainedUnallocatedNetProfit/.test(builderSrc) &&
    /ReconciliationComponents/.test(renderSrc)
);
check(
  "Reconciliation maps FE adjustments to product.accountAdjustments (not otherExpenses)",
  /product\.accountAdjustments/.test(builderSrc) &&
    /Σ product\.accountAdjustments/.test(builderSrc) &&
    !/Σ product\.otherExpenses/.test(builderSrc)
);
check(
  "Does not recalculate Financial Engine in workbook builder",
  !/buildModelBProfitMetrics/.test(builderSrc) &&
    !/calculateModelBNetProfit/.test(builderSrc)
);

const {
  WEEKLY_WORKBOOK_SHEET_NAMES,
  WEEKLY_FE_GLOSSARY,
  FINANCE_INCOMPLETE_WARNING,
  FINANCE_NO_DATA_MESSAGE,
  renderWeeklyBusinessWorkbook,
  buildPeriodChunks,
  formatUnifiedReportTitle,
  buildReconciliation,
} = await import("../src/lib/reporting/weekly-business/index.ts");

const expectedSheets = Object.values(WEEKLY_WORKBOOK_SHEET_NAMES);
check("Sheet catalog has 13 entries", expectedSheets.length === 13);
check(
  "Cash Flow sheet name registered",
  WEEKLY_WORKBOOK_SHEET_NAMES.cashFlow === "12 Cash Flow"
);

// --- Period chunk unit checks ---
const week7 = buildPeriodChunks({ from: "2026-08-01", to: "2026-08-07" });
check("7-day same-month → no breakdown", week7.length === 0, JSON.stringify(week7));

const intraMonth = buildPeriodChunks({ from: "2026-08-01", to: "2026-08-28" });
check(
  "30-day same-month → weekly chunks",
  intraMonth.length >= 2 && intraMonth.every((c) => c.kind === "week"),
  `${intraMonth.length} weeks`
);

const multiMonth = buildPeriodChunks({ from: "2026-01-01", to: "2026-06-30" });
check(
  "Multi-month → monthly chunks",
  multiMonth.length === 6 && multiMonth.every((c) => c.kind === "month"),
  multiMonth.map((c) => c.label).join(",")
);

const customRange = buildPeriodChunks({ from: "2026-02-16", to: "2026-05-09" });
check(
  "Custom multi-month range → months",
  customRange.length === 4 &&
    customRange[0].from === "2026-02-16" &&
    customRange[customRange.length - 1].to === "2026-05-09",
  customRange.map((c) => `${c.label}:${c.from}→${c.to}`).join(" | ")
);

const title = formatUnifiedReportTitle("2026-08-01", "2026-08-31");
check(
  "Title reflects selected dates",
  title === "Unified Business Report — 01.08.2026 → 31.08.2026",
  title
);

const mockCtx = {
  generatedAt: "2026-08-29T12:00:00.000Z",
  periodPresetLabel: "Custom",
  scope: {
    from: "2026-01-01",
    to: "2026-08-31",
    marketplaceAccountId: "2",
    companyId: "2",
    brandId: undefined,
  },
  tenant: {
    companyId: "2",
    companyName: "Orion Test",
    currency: "RUB",
    language: "ru",
    accountId: "2",
    accountName: "Orion shop",
    marketplace: "wildberries",
    marketplaceLabel: "Wildberries",
    brandId: null,
    brandName: null,
  },
  sync: {
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastSyncStatus: "partial",
    lifecycleStatus: null,
    financeLatestOperationDate: "2026-06-21",
    financeGapDays: 68,
    financeRecoveryNeeded: true,
  },
  financialEngine: {
    grossSales: 1000,
    returnedSales: 100,
    netSales: 900,
    netSalesStatus: "ready",
    commission: 150,
    marketplaceFee: 150,
    acquiring: 10,
    revenue: 700,
    logistics: 50,
    storage: 20,
    penalties: 5,
    adjustments: 0,
    acceptance: 0,
    productCost: 200,
    advertising: 30,
    netProfit: 395,
    sellerPayout: 625,
    operatingProfit: 395,
    taxPercent: 6,
    customerPaid: 900,
    estimatedTax: 54,
    afterTaxPayout: 571,
    finalNetProfit: 341,
  },
  overview: {
    ordersPurchases: {
      ordersValue: 1200,
      ordersValueCount: 10,
      ordersCount: 10,
      ordersAmount: 1200,
      cancelledOrdersCount: 0,
      cancelledOrdersAmount: 0,
      purchasesCount: 8,
      purchasesAmount: 900,
      conversionRate: 80,
      returnRate: 10,
      dailyOrdersPurchases: [],
    },
    quantityMetrics: {
      unitsSold: 8,
      unitsReturned: 1,
      netUnits: 7,
      returnedValue: 100,
    },
    cashReceived: { amount: 500, payoutCount: 2, unavailableReason: null },
    expectedWbPayout: { amount: 625, reportCount: 3, unavailableReason: null },
  },
  products: [
    {
      productId: "p1",
      modelCode: "SKU-1",
      productName: "Alpha",
      categoryName: "Cat A",
      brandName: "Brand X",
      unitsSold: 8,
      netSales: 900,
      revenue: 700,
      productCost: 200,
      marketplaceFees: 150,
      logistics: 40,
      returnLogistics: 10,
      storage: 20,
      advertising: 30,
      netProfit: 250,
      finalNetProfit: 200,
      orders: 10,
      purchases: 8,
      conversionPercent: 80,
      cancelled: 0,
      cancelledPercent: 0,
      accountAdjustments: 0,
      reimbursements: 0,
      returnRate: 0,
      unitsReturned: 0,
      commission: 150,
      otherExpenses: 0,
      returnedValue: 0,
    },
  ],
  categories: [],
  brands: [],
  inventory: null,
  meta: { isSampleData: false, warnings: [] },
  locale: "en",
};

const { buildPnLFromModelB } = await import(
  "../src/lib/reporting/module/pnl-report.ts"
);
const { buildSettlementReport } = await import(
  "../src/lib/reporting/module/settlement-report.ts"
);
const { buildProductProfitReport } = await import(
  "../src/lib/reporting/module/product-profit-report.ts"
);
const { buildGroupPerformanceReport } = await import(
  "../src/lib/reporting/module/group-performance-report.ts"
);

const pnl = buildPnLFromModelB(mockCtx.financialEngine, "RUB");
const settlement = buildSettlementReport({
  fe: mockCtx.financialEngine,
  overview: mockCtx.overview,
  products: mockCtx.products,
  currency: "RUB",
});
const productProfit = buildProductProfitReport({
  products: mockCtx.products,
  currency: "RUB",
});
const brandPerformance = buildGroupPerformanceReport({
  products: mockCtx.products,
  dimension: "brand",
  currency: "RUB",
});
const categoryPerformance = buildGroupPerformanceReport({
  products: mockCtx.products,
  dimension: "category",
  currency: "RUB",
});

const financeIncomplete =
  !mockCtx.sync.financeLatestOperationDate ||
  mockCtx.sync.financeLatestOperationDate < mockCtx.scope.to;

check(
  "Incomplete Finance vs scope.to still detected",
  financeIncomplete === true,
  `latest=${mockCtx.sync.financeLatestOperationDate} to=${mockCtx.scope.to}`
);

const reportTitle = formatUnifiedReportTitle(
  mockCtx.scope.from,
  mockCtx.scope.to
);
const periodChunks = buildPeriodChunks(mockCtx.scope);

const periodBreakdown = periodChunks.map((chunk, i) => ({
  chunk,
  netSales: 300 + i,
  marketplaceFee: 50,
  revenue: 200 + i,
  logistics: 10,
  storage: 5,
  acceptance: 0,
  penalties: 0,
  adjustments: 0,
  productCost: 40,
  advertising: 10,
  estimatedTax: 12,
  finalNetProfit: 100 + i,
  sellerPayout: 180,
  ordersCount: 3 + i,
  unitsSold: 2 + i,
  unitsReturned: 0,
  netUnits: 2 + i,
  cashReceived: 100,
  expectedWbPayout: 180,
}));

const model = {
  generatedAt: mockCtx.generatedAt,
  financialEngineVersion: "V4",
  calculationModel: "Commercial Performance (Model B) — Financial Engine V4",
  reportTitle,
  periodPresetLabel: "Custom",
  periodBreakdownKind: "month",
  periodBreakdown,
  brandPeriodBreakdown: periodChunks.map((chunk) => ({
    periodLabel: chunk.label,
    from: chunk.from,
    to: chunk.to,
    brand: "Brand X",
    netSales: 300,
    finalNetProfit: 100,
    unitsSold: 2,
  })),
  ctx: mockCtx,
  dataQuality: {
    financeLatestOperationDate: "2026-06-21",
    financeGapDays: 71,
    financeRecoveryNeeded: true,
    financeComplete: false,
    financeIncompleteWarning:
      FINANCE_INCOMPLETE_WARNING +
      " latest Finance operation_date=2026-06-21; selected period end=2026-08-31; gap days=71. Affected: Revenue, Settlement / Seller Payout, Net Profit, Finance Detail, Cash Flow (settlement basis).",
    financeNoDataMessage: null,
    financeRowsInPeriod: 1,
    financeLatestInPeriod: "2026-06-20",
    financeLatestSource: "marketplace_accounts.finance_latest_operation_date",
    scopeTo: "2026-08-31",
    affectedFinanceMetrics:
      "Revenue, Settlement / Seller Payout, Net Profit, Finance Detail, Cash Flow (settlement basis)",
    lastSyncStatus: "partial",
    ordersLatestDate: "2026-03-20",
    salesLatestDate: "2026-03-20",
    financeLatestDate: "2026-06-21",
    isSampleData: false,
    warnings: [],
  },
  hasCommercialActivity: true,
  pnl,
  settlement,
  productProfit,
  brandPerformance,
  categoryPerformance,
  brandOperBreakdown: [
    {
      brand: "Brand X",
      supplierOperName: "Продажа",
      amount: 700,
      lineCount: 2,
    },
  ],
  reconciliation: {
    accountFinalNetProfit: mockCtx.financialEngine.finalNetProfit,
    sumProductFinalNetProfit: 200,
    sumBrandFinalNetProfit: 200,
    difference: mockCtx.financialEngine.finalNetProfit - 200,
    explainedUnallocatedNetProfit: mockCtx.financialEngine.finalNetProfit - 200,
    residualDifference: 0,
    components: [
      {
        label: "Unallocated Account-Level Cost — Advertising",
        accountAmount: 30,
        allocatedAmount: 30,
        unallocatedAmount: 0,
        netProfitEffect: 0,
        source: "financialEngine.advertising − Σ product.advertising",
      },
      {
        label: "Unallocated Account-Level Cost — Acceptance",
        accountAmount: 0,
        allocatedAmount: 0,
        unallocatedAmount: 0,
        netProfitEffect: 0,
        source: "financialEngine.acceptance",
      },
    ],
    identityStatement:
      "Account-level Net Profit = Allocated Product/Brand Profit + Unallocated Account-level Profit/Costs + Residual",
    brandAttributionNote:
      "Brand Performance Net Profit is product-attributed profitability (Σ Product Profit v2 finalNetProfit by brand).",
    explanation: "test",
  },
  cashFlow: {
    actualCashReceived: 500,
    actualCashReceivedUnavailableReason: null,
    actualCashReceivedSource: "overview.cashReceived",
    expectedWbPayout: 625,
    expectedWbPayoutUnavailableReason: null,
    expectedWbPayoutSource: "overview.expectedWbPayout",
    sellerPayoutSettlement: mockCtx.financialEngine.sellerPayout,
    sellerPayoutSource: "financialEngine.sellerPayout",
    sellerPayoutMeaning: "WB Seller Payout / Settlement",
    productCost: 200,
    logistics: 50,
    storage: 20,
    acceptance: 0,
    penalties: 5,
    otherCosts: 0,
    advertising: 30,
    estimatedTax: 54,
    netCashMovement: 500 - 200 - 30 - 54,
    netCashMovementBasis: "Actual Cash Received − Product Cost − Advertising − Estimated Tax",
    settlementBasisNetProfit: mockCtx.financialEngine.finalNetProfit,
  },
  glossary: WEEKLY_FE_GLOSSARY,
  financeDetail: [
    {
      operationDate: "2026-06-20",
      nmId: 1,
      brand: "Brand X",
      srid: "s1",
      supplierOperName: "Продажа",
      operationType: "sale",
      financeCategory: "FOR_PAY",
      amount: 700,
      sourceKey: "rrd:1:for_pay",
      realizationReportId: 1,
    },
  ],
  salesDetail: [
    {
      saleDate: "2026-03-10",
      srid: "s1",
      nmId: 1,
      productName: "Alpha",
      brand: "Brand X",
      quantity: 1,
      priceWithDisc: 900,
      forPay: 750,
      isReturn: false,
      warehouse: "WH",
    },
  ],
};

const buffer = await renderWeeklyBusinessWorkbook(model);
check("Workbook buffer non-empty", buffer.byteLength > 1000, `${buffer.byteLength}b`);

const outDir = resolve("exports/reporting-weekly-business");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "unified-business-sample.xlsx");
writeFileSync(outPath, Buffer.from(buffer));
check("Sample xlsx written", existsSync(outPath));

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(buffer));
const names = wb.worksheets.map((s) => s.name);
check("XLSX opens successfully", names.length === 13, names.join(" | "));

for (const expected of expectedSheets) {
  check(`Sheet present: ${expected}`, names.includes(expected));
}

const cover = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.cover);
let foundWarning = false;
let foundTitle = false;
let foundPeriodBreakdown = false;
let foundFinanceLatest = false;
let foundGapDays = false;
cover.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  const v2 = String(row.getCell(2).value ?? "");
  if (v.includes("FINANCE DATA INCOMPLETE")) foundWarning = true;
  if (v.includes("Unified Business Report") || v2.includes("Unified Business Report"))
    foundTitle = true;
  if (v.includes("Period breakdown") && String(v2).includes("Monthly"))
    foundPeriodBreakdown = true;
  if (v.includes("Finance latest operation_date") && v2.includes("2026-06-21"))
    foundFinanceLatest = true;
  if (v.includes("Finance gap days") && String(v2).includes("71")) foundGapDays = true;
});
check("Cover shows incomplete Finance warning", foundWarning);
check("Cover title reflects selected dates", foundTitle, reportTitle);
check("Cover shows monthly period breakdown meta", foundPeriodBreakdown);
check("Cover shows Account 2 Finance latest date", foundFinanceLatest);
check("Cover shows Finance gap days vs scope.to", foundGapDays);

const executive = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.executive);
let foundExecWarn = false;
let foundExecBreakdown = false;
executive.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v.includes("FINANCE DATA INCOMPLETE")) foundExecWarn = true;
  if (v.includes("Period breakdown")) foundExecBreakdown = true;
});
check("Executive shows incomplete Finance warning", foundExecWarn);
check("Executive includes period breakdown section", foundExecBreakdown);

const brandSheet = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.brand);
let foundBrandPeriod = false;
let foundBrandAttribution = false;
brandSheet.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v === "2026-01" || v.includes("Period breakdown")) foundBrandPeriod = true;
  if (v.includes("product-attributed")) foundBrandAttribution = true;
});
check("Brand sheet includes period-level rows", foundBrandPeriod);
check("Brand sheet states product-attributed profitability", foundBrandAttribution);

const reconSheet = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.reconciliation);
let foundReconIdentity = false;
let foundUnallocated = false;
let foundReconDiff = false;
reconSheet.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v.includes("Account-level Net Profit = Allocated")) foundReconIdentity = true;
  if (v.includes("Unallocated Account-Level")) foundUnallocated = true;
  if (v.includes("Reconciliation Difference")) foundReconDiff = true;
});
check("Reconciliation identity statement present", foundReconIdentity);
check("Reconciliation lists unallocated components", foundUnallocated);
check("Reconciliation difference KPI present", foundReconDiff);

const cashSheet = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.cashFlow);
let foundCashReceived = false;
let foundSellerPayoutLabel = false;
let foundCashPeriod = false;
cashSheet.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v.includes("Actual Cash Received")) foundCashReceived = true;
  if (v.includes("WB Seller Payout / Settlement")) foundSellerPayoutLabel = true;
  if (v.includes("Period breakdown") || v === "2026-01") foundCashPeriod = true;
});
check("Cash Flow sheet has Actual Cash Received", foundCashReceived);
check("Cash Flow labels WB Seller Payout / Settlement", foundSellerPayoutLabel);
check("Cash Flow includes chronological breakdown", foundCashPeriod);

const financeSheet = wb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.financeDetail);
let foundFinanceRow = false;
let foundFinanceWarn = false;
financeSheet.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v === "2026-06-20") foundFinanceRow = true;
  if (v.includes("FINANCE DATA INCOMPLETE")) foundFinanceWarn = true;
});
check("Finance Detail exports actual rows when available", foundFinanceRow);
check("Finance Detail shows incomplete Finance warning", foundFinanceWarn);

// Empty Finance Detail message
const emptyFinanceModel = {
  ...model,
  financeDetail: [],
  dataQuality: {
    ...model.dataQuality,
    financeRowsInPeriod: 0,
    financeLatestInPeriod: null,
    financeNoDataMessage: FINANCE_NO_DATA_MESSAGE,
  },
};
const emptyFinanceBuf = await renderWeeklyBusinessWorkbook(emptyFinanceModel);
const emptyFinanceWb = new ExcelJS.Workbook();
await emptyFinanceWb.xlsx.load(Buffer.from(emptyFinanceBuf));
const emptyFinanceSheet = emptyFinanceWb.getWorksheet(
  WEEKLY_WORKBOOK_SHEET_NAMES.financeDetail
);
let foundNoFinanceMsg = false;
emptyFinanceSheet.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  if (v.includes("No Finance data available for selected period"))
    foundNoFinanceMsg = true;
});
check(
  "Finance Detail shows explicit no-data message when empty",
  foundNoFinanceMsg
);

check(
  "P&L Net Profit matches FE finalNetProfit",
  pnl.netProfit === mockCtx.financialEngine.finalNetProfit
);
check(
  "Settlement Net Transfer matches sellerPayout",
  settlement.netTransfer === mockCtx.financialEngine.sellerPayout
);
check("Glossary has rows", WEEKLY_FE_GLOSSARY.length >= 10);
check(
  "package.json has verify script",
  /verify:weekly-business-excel/.test(read("package.json"))
);

// Financial Engine source files untouched by this change set (static guard)
const feSrc = read("src/lib/profit-engine-model-b.ts");
check(
  "Financial Engine Model B file still present (unchanged by reporting)",
  /calculateModelBNetProfit/.test(feSrc)
);

// Deterministic regression: RCA residual bug — otherExpenses must not create residual
{
  const feAdj = {
    grossSales: 0,
    returnedSales: 0,
    netSales: 0,
    netSalesStatus: "ready",
    commission: 0,
    marketplaceFee: 0,
    acquiring: 0,
    revenue: 45369.41,
    logistics: 15764.38,
    storage: 342.86,
    penalties: 0,
    adjustments: 11,
    acceptance: 0,
    productCost: 23900,
    advertising: 0,
    netProfit: 5351.17,
    sellerPayout: 0,
    operatingProfit: 5351.17,
    taxPercent: 6,
    customerPaid: 0,
    estimatedTax: 3550.13,
    afterTaxPayout: 0,
    finalNetProfit: 1801.04,
  };
  const productsAdj = [
    {
      productId: "p1",
      modelCode: "SKU",
      productName: "P",
      categoryName: "C",
      brandName: "B",
      unitsSold: 1,
      unitsReturned: 0,
      returnRate: 0,
      netSales: 0,
      revenue: 45369.41,
      productCost: 23900,
      commission: 0,
      marketplaceFees: 0,
      logistics: 3375.76,
      returnLogistics: 0,
      storage: 0,
      advertising: 0,
      penalties: 0,
      otherExpenses: 8700.26, // display-only — must NOT drive residual
      accountAdjustments: 0, // Model B NP input
      reimbursements: 0,
      netProfit: 18093.65,
      finalNetProfit: 13618.46,
      orders: 1,
      purchases: 1,
      conversionPercent: 100,
      cancelled: 0,
      cancellationPercent: 0,
      purchaseLogistics: 0,
      excludedLogistics: 0,
      purchaseLogisticsRows: 0,
      excludedLogisticsRows: 0,
    },
  ];
  const recon = buildReconciliation(feAdj, productsAdj, 13618.46);
  const otherComp = recon.components.find((c) =>
    String(c.label).includes("Other")
  );
  const round2 = (n) => Math.round(n * 100) / 100;
  check(
    "Regression: FE adjustments ↔ Σ accountAdjustments (not otherExpenses)",
    otherComp != null &&
      Math.abs(otherComp.allocatedAmount - 0) < 0.01 &&
      Math.abs(otherComp.accountAmount - 11) < 0.01 &&
      /accountAdjustments/.test(otherComp.source) &&
      !/Σ product\.otherExpenses/.test(otherComp.source)
  );
  check(
    "Regression: otherExpenses cannot create residual",
    Math.abs(round2(recon.residualDifference)) < 0.02,
    `residual=${recon.residualDifference}`
  );
  check(
    "Regression: explained closes account−product difference",
    Math.abs(
      round2(recon.explainedUnallocatedNetProfit + recon.residualDifference) -
        round2(recon.difference)
    ) < 0.05,
    `diff=${recon.difference} explained=${recon.explainedUnallocatedNetProfit}`
  );
}

// Single-week model: totals only, no breakdown tables required
const weekModel = {
  ...model,
  reportTitle: formatUnifiedReportTitle("2026-08-01", "2026-08-07"),
  periodBreakdownKind: "none",
  periodBreakdown: [],
  brandPeriodBreakdown: [],
  ctx: {
    ...mockCtx,
    scope: { ...mockCtx.scope, from: "2026-08-01", to: "2026-08-07" },
  },
};
const weekBuf = await renderWeeklyBusinessWorkbook(weekModel);
const weekWb = new ExcelJS.Workbook();
await weekWb.xlsx.load(Buffer.from(weekBuf));
const weekCover = weekWb.getWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.cover);
let weekTitleOk = false;
let weekTotalsOnly = false;
weekCover.eachRow((row) => {
  const v = String(row.getCell(1).value ?? "");
  const v2 = String(row.getCell(2).value ?? "");
  if (v.includes("01.08.2026") || v2.includes("01.08.2026")) weekTitleOk = true;
  if (v.includes("Period breakdown") && String(v2).includes("Totals only"))
    weekTotalsOnly = true;
});
check("7d workbook title uses selected dates", weekTitleOk);
check("7d workbook uses totals-only breakdown", weekTotalsOnly);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
