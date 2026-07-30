/**
 * ReportDocument → Business Intelligence Workbook (Excel).
 * Presentation only — never recalculates Financial Engine metrics.
 *
 * Sheet order (Workbook Blueprint):
 * 01 Cover
 * 02 Executive Summary
 * 03 Financial Summary
 * 04 Brand Analysis
 * 05 Product Analysis
 * 06 Marketplace Costs
 * 07 Settlement Reconciliation
 * 08 Inventory Summary
 * 09 Appendix
 */
import ExcelJS from "exceljs";
import type { ReportDocument } from "@/lib/reporting/types";
import type { CoverData } from "@/lib/reporting/sections/cover";
import type { ExecutiveSummaryData } from "@/lib/reporting/sections/executive-summary";
import type { FinancialSummaryData } from "@/lib/reporting/sections/financial-summary";
import type { FinancialRatiosData } from "@/lib/reporting/sections/financial-ratios";
import type { BrandProfitabilityData } from "@/lib/reporting/sections/brand-profitability";
import type { ProductPerformanceData } from "@/lib/reporting/sections/product-performance";
import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import type { SettlementReconciliationData } from "@/lib/reporting/sections/settlement-reconciliation";
import type { InventorySectionData } from "@/lib/reporting/sections/inventory";
import type { AppendixSectionData } from "@/lib/reporting/sections/appendix";
import type { ReportHealthData } from "@/lib/reporting/sections/report-health";
import {
  NOT_AVAILABLE,
  NUM_FMT,
  addBlankRow,
  addKpiBlock,
  addSectionHeader,
  applyColumnWidths,
  asExcelPercent,
  asNumber,
  findSectionData,
  freezeAtRow,
  textOrDash,
  writeExcelTable,
  writeSheetIntro,
  FONT,
  FILL,
} from "@/lib/reporting/excel/workbook-kit";

const SHEET_NAMES = {
  cover: "01 Cover",
  executive: "02 Executive Summary",
  financial: "03 Financial Summary",
  brands: "04 Brand Analysis",
  products: "05 Product Analysis",
  costs: "06 Marketplace Costs",
  settlement: "07 Settlement",
  inventory: "08 Inventory Summary",
  appendix: "09 Appendix",
} as const;

function buildCoverSheet(workbook: ExcelJS.Workbook, document: ReportDocument): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.cover);
  const cover = findSectionData<CoverData>(document.sections, "cover");
  const meta = document.metadata;

  writeSheetIntro(sheet, "ORION SHOP", "Business Performance Report");
  addSectionHeader(sheet, "Report Identity");

  const rows: Array<[string, string]> = [
    ["Company", cover?.company.name ?? meta.company.name],
    ["Marketplace", cover?.marketplace.marketplace ?? meta.marketplace.marketplace],
    ["Account", cover?.marketplace.accountName ?? meta.marketplace.accountName],
    [
      "Reporting Period",
      `${cover?.period.from ?? meta.period.from} → ${cover?.period.to ?? meta.period.to}`,
    ],
    [
      "Period Label",
      cover?.period.presetLabel ?? meta.period.presetLabel ?? "Custom Date Range",
    ],
    ["Generated At", cover?.generatedAt ?? meta.generatedAt],
    ["Model Version", `Business Report v${cover?.reportVersion ?? meta.version}`],
    ["Currency", cover?.currency ?? meta.company.currency],
    ["Locale", cover?.locale ?? meta.locale],
  ];

  for (const [label, value] of rows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = FONT.label;
    row.getCell(2).font = FONT.body;
  }

  applyColumnWidths(sheet, [28, 56]);
  freezeAtRow(sheet, 1);
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.executive);
  const data = findSectionData<ExecutiveSummaryData>(
    document.sections,
    "executive-summary"
  );

  writeSheetIntro(
    sheet,
    "Executive Summary",
    "Key management KPIs for the selected Report Scope"
  );

  if (!data) {
    sheet.addRow(["No executive metrics available."]);
    applyColumnWidths(sheet, [28, 36]);
    return;
  }

  addSectionHeader(sheet, "Management KPIs");
  addKpiBlock(sheet, [
    { label: "Revenue", value: data.revenue, numFmt: NUM_FMT.currency },
    { label: "Net Profit", value: data.netProfit, numFmt: NUM_FMT.currency },
    {
      label: "Margin",
      value: asExcelPercent(data.marginPercent),
      numFmt: NUM_FMT.percent,
    },
    { label: "Orders", value: data.orders, numFmt: NUM_FMT.integer },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "Highlights");
  addKpiBlock(sheet, [
    {
      label: "Best Brand",
      value: data.bestPerformingBrand
        ? `${data.bestPerformingBrand.name}`
        : "—",
    },
    {
      label: "Best Brand Net Profit",
      value: data.bestPerformingBrand?.finalNetProfit ?? NOT_AVAILABLE,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Best Product",
      value: data.bestProduct?.modelCode ?? "—",
    },
    {
      label: "Best Product Net Profit",
      value: data.bestProduct?.value ?? NOT_AVAILABLE,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Needs Attention",
      value: data.worstProduct?.modelCode ?? "—",
    },
    {
      label: "Needs Attention Net Profit",
      value: data.worstProduct?.value ?? NOT_AVAILABLE,
      numFmt: NUM_FMT.currency,
    },
  ]);

  applyColumnWidths(sheet, [28, 36]);
  freezeAtRow(sheet, 1);
}

function buildFinancialSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.financial);
  const financial = findSectionData<FinancialSummaryData>(
    document.sections,
    "financial-summary"
  );
  const ratios = findSectionData<FinancialRatiosData>(
    document.sections,
    "financial-ratios"
  );

  writeSheetIntro(
    sheet,
    "Financial Summary",
    financial
      ? `Commercial Performance · Engine ${financial.engineVersion}`
      : "Commercial Performance"
  );

  if (!financial) {
    sheet.addRow(["No financial metrics available."]);
    applyColumnWidths(sheet, [28, 18, 16]);
    return;
  }

  const fe = financial.modelB;
  const netMargin = ratios?.ratios.find((r) => r.id === "netMarginPercent");
  addSectionHeader(sheet, "Financial KPIs");
  addKpiBlock(sheet, [
    { label: "Revenue", value: fe.revenue, numFmt: NUM_FMT.currency },
    { label: "Net Profit", value: fe.finalNetProfit, numFmt: NUM_FMT.currency },
    {
      label: "Net Margin",
      value:
        netMargin?.value == null
          ? NOT_AVAILABLE
          : asExcelPercent(netMargin.value),
      numFmt: NUM_FMT.percent,
    },
    { label: "Net Sales", value: fe.netSales, numFmt: NUM_FMT.currency },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "P&L Summary");
  writeExcelTable(sheet, {
    name: "FinancialPnL",
    headers: ["Line", "Amount"],
    rows: financial.lines.map((line) => [line.label, line.amount]),
    columnFormats: [undefined, NUM_FMT.currency],
  });

  if (ratios && ratios.ratios.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Financial Ratios");
    const { headerRow } = writeExcelTable(sheet, {
      name: "FinancialRatios",
      headers: ["Ratio", "Value"],
      rows: ratios.ratios.map((r) => [
        r.label,
        r.value == null
          ? NOT_AVAILABLE
          : r.format === "percent"
            ? asExcelPercent(r.value)
            : r.value,
      ]),
    });
    ratios.ratios.forEach((r, i) => {
      const cell = sheet.getRow(headerRow + 1 + i).getCell(2);
      if (typeof cell.value === "number") {
        cell.numFmt =
          r.format === "percent" ? NUM_FMT.percent : NUM_FMT.currency;
      }
    });
  }

  applyColumnWidths(sheet, [32, 18, 16]);
  freezeAtRow(sheet, 1);
}

function buildBrandSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.brands);
  const data = findSectionData<BrandProfitabilityData>(
    document.sections,
    "brand-profitability"
  );

  writeSheetIntro(
    sheet,
    "Brand Analysis",
    "Brand contribution and cost structure from product-level Financial Engine outputs"
  );

  if (!data) {
    sheet.addRow(["No brand metrics available."]);
    applyColumnWidths(sheet, [20, 14]);
    return;
  }

  addSectionHeader(sheet, "Brand KPIs");
  addKpiBlock(sheet, [
    { label: "Brands", value: data.totals.brandCount, numFmt: NUM_FMT.integer },
    { label: "Revenue", value: data.totals.revenue, numFmt: NUM_FMT.currency },
    {
      label: "Net Profit",
      value: data.totals.finalNetProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Units Sold",
      value: data.totals.unitsSold,
      numFmt: NUM_FMT.integer,
    },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "Brand Comparison");

  const sorted = [...data.brands].sort((a, b) => b.netProfit - a.netProfit);

  const { headerRow } = writeExcelTable(sheet, {
    name: "BrandAnalysis",
    headers: [
      "Brand",
      "Revenue",
      "Orders",
      "Units",
      "Marketplace Fee",
      "Logistics",
      "Storage",
      "Product Cost",
      "Net Profit",
      "Net Margin %",
      "Contribution %",
      "Return Rate %",
      "Products",
    ],
    rows: sorted.map((b) => [
      b.brandName,
      b.revenue,
      b.orders,
      b.unitsSold,
      b.marketplaceFee,
      b.logistics,
      b.storage,
      b.productCost,
      b.netProfit,
      asExcelPercent(b.netMarginPercent),
      asExcelPercent(b.contributionPercent),
      asExcelPercent(b.returnRate),
      b.productCount,
    ]),
    columnFormats: [
      undefined,
      NUM_FMT.currency,
      NUM_FMT.integer,
      NUM_FMT.integer,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.percent,
      NUM_FMT.percent,
      NUM_FMT.percent,
      NUM_FMT.integer,
    ],
  });

  freezeAtRow(sheet, headerRow);
  applyColumnWidths(sheet, [
    18, 14, 10, 10, 14, 12, 12, 14, 14, 12, 14, 12, 10,
  ]);
}

function buildProductSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.products);
  const data = findSectionData<ProductPerformanceData>(
    document.sections,
    "product-performance"
  );

  writeSheetIntro(
    sheet,
    "Product Analysis",
    "Complete product portfolio for the selected Report Scope"
  );

  if (!data) {
    sheet.addRow(["No product metrics available."]);
    applyColumnWidths(sheet, [18, 28]);
    return;
  }

  addSectionHeader(sheet, "Portfolio KPIs");
  addKpiBlock(sheet, [
    {
      label: "Products",
      value: data.portfolioTotals.productCount,
      numFmt: NUM_FMT.integer,
    },
    {
      label: "Revenue",
      value: data.portfolioTotals.revenue,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Net Profit",
      value: data.portfolioTotals.netProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Orders",
      value: data.portfolioTotals.orders,
      numFmt: NUM_FMT.integer,
    },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "Product Portfolio");
  sheet.addRow([
    "Favorites, Cart, Stock, and Warehouse columns are Not available until Sales Funnel / warehouse metrics are in ReportDocument.",
  ]).getCell(1).font = FONT.subtitle;

  const portfolio = [...data.portfolio].sort((a, b) => b.netProfit - a.netProfit);

  const { headerRow } = writeExcelTable(sheet, {
    name: "ProductPortfolio",
    headers: [
      "SKU",
      "Product",
      "Brand",
      "Category",
      "Revenue",
      "Orders",
      "Buyout",
      "Conversion %",
      "Return %",
      "Marketplace Fee",
      "Logistics",
      "Product Cost",
      "Net Profit",
      "Margin %",
      "Contribution %",
      "Stock",
      "Warehouse",
      "Favorites",
      "Cart",
    ],
    rows: portfolio.map((p) => [
      p.sku,
      p.productName,
      p.brandName,
      p.categoryName,
      p.revenue,
      p.orders,
      p.purchases,
      asExcelPercent(p.conversionPercent),
      asExcelPercent(p.returnRate),
      p.marketplaceFees,
      p.logistics,
      p.productCost,
      p.netProfit,
      asExcelPercent(p.marginPercent),
      asExcelPercent(p.contributionPercent),
      NOT_AVAILABLE,
      NOT_AVAILABLE,
      NOT_AVAILABLE,
      NOT_AVAILABLE,
    ]),
    columnFormats: [
      undefined,
      undefined,
      undefined,
      undefined,
      NUM_FMT.currency,
      NUM_FMT.integer,
      NUM_FMT.integer,
      NUM_FMT.percent,
      NUM_FMT.percent,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.percent,
      NUM_FMT.percent,
      undefined,
      undefined,
      undefined,
      undefined,
    ],
  });

  freezeAtRow(sheet, headerRow);
  applyColumnWidths(sheet, [
    16, 32, 14, 14, 12, 10, 10, 12, 10, 14, 12, 12, 12, 10, 12, 12, 12, 12, 10,
  ]);
}

function buildCostsSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.costs);
  const data = findSectionData<MarketplaceCostsData>(
    document.sections,
    "marketplace-costs"
  );

  writeSheetIntro(
    sheet,
    "Marketplace Costs",
    "Marketplace expense breakdown with share of Revenue"
  );

  if (!data) {
    sheet.addRow(["No marketplace cost metrics available."]);
    applyColumnWidths(sheet, [24, 14, 14]);
    return;
  }

  addSectionHeader(sheet, "Cost KPIs");
  addKpiBlock(sheet, [
    { label: "Revenue Base", value: data.revenueBase, numFmt: NUM_FMT.currency },
    { label: "Total Costs", value: data.totalAmount, numFmt: NUM_FMT.currency },
    {
      label: "Total % of Revenue",
      value: asExcelPercent(data.totalPercentOfRevenue),
      numFmt: NUM_FMT.percent,
    },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "Cost Breakdown");
  const sorted = [...data.lines].sort((a, b) => b.amount - a.amount);
  writeExcelTable(sheet, {
    name: "MarketplaceCosts",
    headers: ["Cost", "Amount", "% of Revenue"],
    rows: sorted.map((line) => [
      line.label,
      line.amount,
      asExcelPercent(line.percentOfRevenue),
    ]),
    columnFormats: [undefined, NUM_FMT.currency, NUM_FMT.percent],
  });

  applyColumnWidths(sheet, [28, 16, 14]);
  freezeAtRow(sheet, 1);
}

function buildSettlementSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.settlement);
  const data = findSectionData<SettlementReconciliationData>(
    document.sections,
    "settlement-reconciliation"
  );

  writeSheetIntro(
    sheet,
    "Settlement Reconciliation",
    "Bridge Orion Commercial Performance to WB settlement"
  );

  if (!data) {
    sheet.addRow(["No settlement metrics available."]);
    applyColumnWidths(sheet, [32, 24]);
    return;
  }

  const trust = data.settlement.available
    ? `Trusted · ${data.settlement.source}${
        data.settlement.reportCount != null
          ? ` · ${data.settlement.reportCount} report(s)`
          : ""
      }`
    : "Settlement unavailable for this scope";

  addSectionHeader(sheet, "Settlement Bridge");
  addKpiBlock(sheet, [
    { label: "Revenue", value: data.revenue, numFmt: NUM_FMT.currency },
    {
      label: "Settlement Amount",
      value: asNumber(data.settlementAmount),
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Difference (Revenue − Settlement)",
      value: asNumber(data.difference),
      numFmt: NUM_FMT.currency,
    },
    { label: "Trust Indicator", value: trust },
  ]);

  addBlankRow(sheet);
  addSectionHeader(sheet, "Settlement Bridge Detail");
  addKpiBlock(sheet, [
    {
      label: "Seller Payout (FE)",
      value: data.sellerPayout,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Seller Payout vs Settlement",
      value: asNumber(data.sellerPayoutDifference),
      numFmt: NUM_FMT.currency,
    },
    { label: "Logistics", value: data.logistics, numFmt: NUM_FMT.currency },
    { label: "Storage", value: data.storage, numFmt: NUM_FMT.currency },
    { label: "Acceptance", value: data.acceptance, numFmt: NUM_FMT.currency },
    { label: "Penalties", value: data.penalties, numFmt: NUM_FMT.currency },
    {
      label: "Other Deductions",
      value: data.otherDeductions,
      numFmt: NUM_FMT.currency,
    },
  ]);

  if (data.notes.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Difference Explanations");
    for (const note of data.notes) {
      const row = sheet.addRow([note]);
      row.getCell(1).font = FONT.body;
      row.getCell(1).fill = FILL.callout;
    }
  }

  applyColumnWidths(sheet, [40, 36]);
  freezeAtRow(sheet, 1);
}

function buildInventorySheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.inventory);
  const data = findSectionData<InventorySectionData>(
    document.sections,
    "inventory"
  );

  writeSheetIntro(
    sheet,
    "Inventory Summary",
    "Current stock health (Live State) from the inventory module — no forecasting"
  );

  if (!data) {
    sheet.addRow(["No inventory metrics available."]);
    applyColumnWidths(sheet, [22, 36, 12, 12, 14]);
    return;
  }

  addSectionHeader(sheet, "Inventory KPIs");
  addKpiBlock(sheet, [
    {
      label: "Inventory Value",
      value: asNumber(data.inventoryValue),
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Active Products",
      value: data.activeProducts,
      numFmt: NUM_FMT.integer,
    },
    { label: "Healthy", value: data.healthy, numFmt: NUM_FMT.integer },
    { label: "Low Stock", value: data.lowStock, numFmt: NUM_FMT.integer },
    { label: "Out of Stock", value: data.outOfStock, numFmt: NUM_FMT.integer },
    { label: "Models", value: data.modelCount, numFmt: NUM_FMT.integer },
    {
      label: "Inventory Turnover",
      value: asNumber(data.inventoryTurnover),
    },
  ]);

  if (data.notes.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Coverage Notes");
    for (const note of data.notes) {
      sheet.addRow([note]).getCell(1).font = FONT.subtitle;
    }
  }

  if (data.available && data.models.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Stock Summary");
    const sorted = [...data.models].sort(
      (a, b) => b.currentStock - a.currentStock
    );
    const { headerRow } = writeExcelTable(sheet, {
      name: "InventoryStock",
      headers: ["SKU", "Product", "Stock", "Days Left", "Status"],
      rows: sorted.map((m) => [
        m.supplierArticle,
        m.productName,
        m.currentStock,
        m.daysLeft == null ? "—" : m.daysLeft,
        m.status,
      ]),
      columnFormats: [
        undefined,
        undefined,
        NUM_FMT.integer,
        NUM_FMT.integer,
        undefined,
      ],
    });
    freezeAtRow(sheet, headerRow);
  } else if (!data.available) {
    addBlankRow(sheet);
    sheet.addRow([NOT_AVAILABLE]).getCell(1).font = FONT.body;
    sheet.addRow([
      data.notes[0] ?? "Inventory report unavailable for this account context.",
    ]);
  }

  applyColumnWidths(sheet, [18, 40, 12, 12, 14]);
}

function buildAppendixSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.appendix);
  const appendix = findSectionData<AppendixSectionData>(
    document.sections,
    "appendix"
  );
  const health = findSectionData<ReportHealthData>(
    document.sections,
    "report-health"
  );
  const cover = findSectionData<CoverData>(document.sections, "cover");

  writeSheetIntro(
    sheet,
    "Appendix",
    "Identity, definitions, and report health"
  );

  addSectionHeader(sheet, "Report Identity");
  addKpiBlock(sheet, [
    {
      label: "Report",
      value: cover?.reportName ?? document.metadata.reportName,
    },
    {
      label: "Company",
      value: `${cover?.company.name ?? document.metadata.company.name} · ${
        cover?.marketplace.accountName ?? document.metadata.marketplace.accountName
      }`,
    },
    {
      label: "Period",
      value: `${cover?.period.from ?? document.metadata.period.from} → ${
        cover?.period.to ?? document.metadata.period.to
      }`,
    },
    {
      label: "Generated",
      value: cover?.generatedAt ?? document.metadata.generatedAt,
    },
  ]);

  if (appendix) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Filters");
    addKpiBlock(sheet, [
      { label: "Company", value: appendix.filters.companyName },
      { label: "Account", value: appendix.filters.marketplaceAccountName },
      { label: "Marketplace", value: appendix.filters.marketplace },
      {
        label: "Brand",
        value: textOrDash(
          appendix.filters.brandName ??
            (appendix.filters.brandId ? appendix.filters.brandId : "All")
        ),
      },
      {
        label: "Period",
        value: `${appendix.filters.periodFrom} → ${appendix.filters.periodTo}`,
      },
    ]);

    addBlankRow(sheet);
    addSectionHeader(sheet, "Model Information");
    addKpiBlock(sheet, [
      { label: "Model", value: appendix.calculationModel },
      { label: "Engine", value: appendix.financialEngineVersion },
      {
        label: "Report Version",
        value: `v${appendix.reportMetadata.reportVersion}`,
      },
    ]);
  }

  if (health) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Report Health");
    addKpiBlock(sheet, [
      {
        label: "Period",
        value: `${health.reportingPeriod.from} → ${health.reportingPeriod.to}${
          health.reportingPeriod.presetLabel
            ? ` (${health.reportingPeriod.presetLabel})`
            : ""
        } · ${health.reportingPeriod.dayCount} days`,
      },
      {
        label: "Settlement Coverage",
        value: health.settlementCoverage.available
          ? `available (${health.settlementCoverage.source})`
          : "unavailable",
      },
      {
        label: "Inventory Coverage",
        value: health.inventoryCoverage.available
          ? `${health.inventoryCoverage.modelCount} models`
          : "unavailable",
      },
      { label: "Model", value: health.calculationModel },
    ]);
  }

  const definitions = document.appendix.definitions ?? [];
  if (definitions.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Definitions");
    writeExcelTable(sheet, {
      name: "ReportDefinitions",
      headers: ["Term", "Definition"],
      rows: definitions.map((d) => [d.term, d.definition]),
    });
  }

  const sourceNotes = document.appendix.sourceNotes ?? [];
  if (sourceNotes.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Source Notes");
    for (const note of sourceNotes) {
      sheet.addRow([note]).getCell(1).font = FONT.body;
    }
  }

  const warnings = document.appendix.warnings ?? [];
  if (warnings.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(sheet, "Warnings");
    for (const w of warnings) {
      sheet.addRow([w]).getCell(1).font = FONT.body;
    }
  }

  applyColumnWidths(sheet, [28, 72]);
  freezeAtRow(sheet, 1);
}

/**
 * Render the Business Intelligence Workbook from ReportDocument.
 */
export async function renderBusinessReportWorkbook(
  document: ReportDocument
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OrionShop Profit Dashboard";
  workbook.created = new Date(document.metadata.generatedAt);
  workbook.modified = new Date();
  workbook.title = document.metadata.reportName;
  workbook.description =
    "Business Intelligence Workbook rendered from ReportDocument";

  buildCoverSheet(workbook, document);
  buildExecutiveSheet(workbook, document);
  buildFinancialSheet(workbook, document);
  buildBrandSheet(workbook, document);
  buildProductSheet(workbook, document);
  buildCostsSheet(workbook, document);
  buildSettlementSheet(workbook, document);
  buildInventorySheet(workbook, document);
  buildAppendixSheet(workbook, document);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function buildBusinessWorkbookFilename(
  document: ReportDocument,
  date = new Date()
): string {
  const day = date.toISOString().split("T")[0];
  const base =
    document.exportOptions.suggestedFilename ||
    `business-report_${document.metadata.period.from}_${document.metadata.period.to}`;
  return `${base}_${day}.xlsx`;
}

/** Empty when core commercial activity is zero for the period. */
export function isBusinessDocumentEmpty(document: ReportDocument): boolean {
  const executive = findSectionData<ExecutiveSummaryData>(
    document.sections,
    "executive-summary"
  );
  if (!executive) return true;
  return (
    executive.revenue === 0 &&
    executive.netProfit === 0 &&
    executive.orders === 0 &&
    executive.purchases === 0
  );
}

export { SHEET_NAMES as BUSINESS_WORKBOOK_SHEETS };
