import * as XLSX from "xlsx";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import {
  buildMarketplaceCostComposition,
  buildPortfolioConcentration,
} from "@/lib/reports/product-report-concentration";
import type {
  ProductReportAppendixData,
  ProductReportCostRow,
  ProductReportExecutiveData,
  ProductReportInventoryData,
  ProductReportMarketplaceCostData,
  ProductReportPerformanceRow,
  ProductReportPortfolioData,
  ProductReportPortfolioGroup,
  ProductReportProfitabilityData,
  ProductReportRankRow,
  ReportPayload,
} from "@/lib/reports/report-engine-types";

type SheetCell = string | number | null;

function money(value: number, currency: string): string {
  return formatCurrency(value, currency);
}

function qty(value: number): string {
  return formatNumber(value);
}

function pct(value: number): string {
  return formatPercent(value, 1);
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: SheetCell[][],
  colWidths?: number[]
) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) {
    worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

function buildCoverSheet(payload: ReportPayload): SheetCell[][] {
  const identity = payload.identity;
  return [
    ["ORION SHOP"],
    ["Product Performance Report"],
    [],
    [`${identity.marketplace} Marketplace`],
    [],
    ["Reporting Period", `${identity.reportingPeriod.from} → ${identity.reportingPeriod.to}`],
    ["Period", identity.reportingPeriod.presetLabel ?? "Custom Date Range"],
    ["Company", identity.company],
    ["Account", identity.account],
    ["Marketplace", identity.marketplace],
    ["Currency", identity.currency],
    ["Generated At", identity.generatedAt],
    ["Last Successful Synchronization", identity.lastSuccessfulSyncAt ?? "—"],
    ["Template Version", identity.templateVersion],
    [],
    ["Prepared automatically by", "WB Dashboard"],
  ];
}

function highlightLine(
  label: string,
  row: ProductReportRankRow | null,
  formatValue: (v: number) => string
): SheetCell[] {
  if (!row) return [label, "—", "—", "—"];
  return [label, row.sku, row.productName, formatValue(row.value)];
}

function buildExecutiveSheet(
  data: ProductReportExecutiveData | undefined,
  currency: string,
  performanceRows: ProductReportPerformanceRow[] = []
): SheetCell[][] {
  if (!data) {
    return [["Executive Summary"], [], ["No executive metrics available."]];
  }

  const concentration = buildPortfolioConcentration(performanceRows);

  const rows: SheetCell[][] = [
    ["Executive Summary"],
    ["Which products create value — and which require action"],
    [],
    ["Portfolio Snapshot"],
    ["Metric", "Value"],
    ["Total Products", qty(data.totalProducts)],
    ["Active Products", qty(data.activeProducts)],
    ["Products with Sales", qty(data.productsWithSales)],
    [
      "Average Margin",
      data.averageMarginPercent == null ? "—" : pct(data.averageMarginPercent),
    ],
    [
      "Average Selling Price",
      data.averageSellingPrice == null
        ? "—"
        : money(data.averageSellingPrice, currency),
    ],
    [
      "Inventory Units",
      data.inventoryUnits == null ? "—" : qty(data.inventoryUnits),
    ],
    [
      "Inventory Value",
      data.inventoryValue == null ? "—" : money(data.inventoryValue, currency),
    ],
    [],
    ["Product Highlights"],
    ["Insight", "SKU", "Product", "Value"],
    highlightLine("Top Revenue Product", data.topRevenueProduct, (v) =>
      money(v, currency)
    ),
    highlightLine("Top Profit Product", data.topProfitProduct, (v) =>
      money(v, currency)
    ),
    highlightLine("Highest Margin Product", data.highestMarginProduct, pct),
    highlightLine("Highest Conversion Product", data.highestConversionProduct, pct),
    highlightLine("Highest Return Product", data.highestReturnProduct, pct),
    highlightLine("Lowest Performing Product", data.lowestPerformingProduct, (v) =>
      money(v, currency)
    ),
  ];

  if (concentration) {
    rows.push(
      [],
      ["Portfolio Concentration"],
      ["Derived from Product Performance rows (share of period totals)"],
      [],
      ["Metric", "Value"],
      ["Top 5 Revenue Contribution", pct(concentration.top5RevenueSharePercent)],
      ["Top 5 Profit Contribution", pct(concentration.top5ProfitSharePercent)],
      ["Top Product Revenue Share", pct(concentration.topProductRevenueSharePercent)],
      ["Top Product Profit Share", pct(concentration.topProductProfitSharePercent)],
      [],
      ["Top 5 Products"],
      ["SKU", "Product", "Revenue", "Revenue %", "Profit", "Profit %"]
    );
    for (const product of concentration.top5Products) {
      rows.push([
        product.sku,
        product.productName,
        money(product.revenue, currency),
        pct(product.revenueSharePercent),
        money(product.profit, currency),
        pct(product.profitSharePercent),
      ]);
    }
    rows.push(
      [],
      [
        `Top 5 products generate ${concentration.top5RevenueSharePercent.toFixed(1)}% of total revenue.`,
      ],
      [
        `Top 5 products generate ${concentration.top5ProfitSharePercent.toFixed(1)}% of total profit.`,
      ],
      [
        `Top revenue product contributes ${concentration.topProductRevenueSharePercent.toFixed(1)}% of portfolio revenue.`,
      ],
      [
        `Top profit product contributes ${concentration.topProductProfitSharePercent.toFixed(1)}% of portfolio profit.`,
      ]
    );
  }

  rows.push([], ["Executive Insights"]);

  if (data.insights.length === 0) {
    rows.push(["No comparative insights available for this period."]);
  } else {
    for (const insight of data.insights) {
      rows.push([insight]);
    }
  }

  return rows;
}

function performanceHeader(): SheetCell[] {
  return [
    "Product",
    "Brand",
    "Category",
    "Revenue",
    "Profit",
    "Margin %",
    "Orders",
    "Buyout",
    "Conversion %",
    "Units Sold",
    "Inventory",
    "Marketplace Cost",
    "Advertising",
    "Status",
  ];
}

function performanceCells(
  row: ProductReportPerformanceRow,
  currency: string
): SheetCell[] {
  return [
    row.sku,
    row.brandName,
    row.categoryName,
    money(row.revenue, currency),
    money(row.profit, currency),
    pct(row.marginPercent),
    qty(row.orders),
    qty(row.purchases),
    pct(row.conversionPercent),
    qty(row.unitsSold),
    qty(row.inventory),
    money(row.marketplaceFees, currency),
    money(row.advertising, currency),
    row.status,
  ];
}

function buildPerformanceSheet(
  data: { rows: ProductReportPerformanceRow[] } | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Product Performance"], [], ["No product metrics available."]];
  }

  const rows: SheetCell[][] = [
    ["Product Performance"],
    ["Main product table for the selected period"],
    [],
    performanceHeader(),
  ];

  if (data.rows.length === 0) {
    rows.push(["—", "No products"]);
  } else {
    for (const row of data.rows) {
      rows.push(performanceCells(row, currency));
    }
  }

  return rows;
}

function rankBlock(
  title: string,
  rows: ProductReportRankRow[],
  valueHeader: string,
  formatValue: (value: number) => string
): SheetCell[][] {
  const out: SheetCell[][] = [
    [title],
    ["Rank", "SKU", "Product", "Brand", "Category", valueHeader],
  ];
  if (rows.length === 0) {
    out.push(["—", "—", "No rows", "—", "—", "—"]);
    return out;
  }
  for (const row of rows) {
    out.push([
      row.rank,
      row.sku,
      row.productName,
      row.brandName,
      row.categoryName,
      formatValue(row.value),
    ]);
  }
  return out;
}

function buildProfitabilitySheet(
  data: ProductReportProfitabilityData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Profitability Analysis"], [], ["No profitability metrics available."]];
  }

  return [
    ["Profitability Analysis"],
    ["Top and bottom products by Final Net Profit and Margin"],
    [],
    ...rankBlock("Top 20 Most Profitable", data.topProfit, "Final Net Profit", (v) =>
      money(v, currency)
    ),
    [],
    ...rankBlock("Bottom 20 Least Profitable", data.bottomProfit, "Final Net Profit", (v) =>
      money(v, currency)
    ),
    [],
    ...rankBlock("Highest Margin", data.highestMargin, "Margin %", pct),
    [],
    ...rankBlock("Lowest Margin", data.lowestMargin, "Margin %", pct),
    [],
    ...rankBlock("Negative Profit Products", data.negativeProfit, "Final Net Profit", (v) =>
      money(v, currency)
    ),
  ];
}

function costHeader(): SheetCell[] {
  return [
    "SKU",
    "Product",
    "Commission",
    "Logistics",
    "Return Logistics",
    "Storage",
    "Advertising",
    "Other Marketplace Costs",
    "Total Marketplace Cost",
  ];
}

function costCells(row: ProductReportCostRow, currency: string): SheetCell[] {
  return [
    row.sku,
    row.productName,
    money(row.commission, currency),
    money(row.logistics, currency),
    money(row.returnLogistics, currency),
    money(row.storage, currency),
    money(row.advertising, currency),
    money(row.otherMarketplaceCosts, currency),
    money(row.totalMarketplaceCost, currency),
  ];
}

function buildMarketplaceCostSheet(
  data: ProductReportMarketplaceCostData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Marketplace Cost Analysis"], [], ["No marketplace cost metrics available."]];
  }

  const composition = buildMarketplaceCostComposition(data.totals);
  const compositionTotal = composition.reduce((sum, slice) => sum + slice.value, 0);

  const rows: SheetCell[][] = [
    ["Marketplace Cost Analysis"],
    ["Marketplace cost components by product (existing Model B fields)"],
    [],
    ["Cost Composition"],
    ["Category", "Amount", "Share %"],
  ];

  for (const slice of composition) {
    const share =
      compositionTotal === 0 ? 0 : (slice.value / Math.abs(compositionTotal)) * 100;
    rows.push([slice.name, money(slice.value, currency), pct(share)]);
  }

  rows.push(
    ["Total Marketplace Cost", money(data.totals.totalMarketplaceCost, currency), pct(100)],
    [],
    ["Totals (detail)"],
    ["Commission", money(data.totals.commission, currency)],
    ["Logistics", money(data.totals.logistics, currency)],
    ["Return Logistics", money(data.totals.returnLogistics, currency)],
    ["Storage", money(data.totals.storage, currency)],
    ["Advertising", money(data.totals.advertising, currency)],
    ["Other Marketplace Costs", money(data.totals.otherMarketplaceCosts, currency)],
    ["Total Marketplace Cost", money(data.totals.totalMarketplaceCost, currency)],
    [],
    costHeader()
  );

  if (data.rows.length === 0) {
    rows.push(["—", "No products"]);
  } else {
    for (const row of data.rows) {
      rows.push(costCells(row, currency));
    }
  }

  return rows;
}

function buildInventorySheet(
  data: ProductReportInventoryData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Inventory Position"], [], ["No inventory metrics available."]];
  }

  const rows: SheetCell[][] = [
    ["Inventory Position"],
    [],
    ["Inventory Health"],
    ["Status", "Models"],
    ["Healthy Inventory", qty(data.health.healthy)],
    ["Low Stock", qty(data.health.lowStock)],
    ["Out of Stock", qty(data.health.outOfStock)],
    [
      "At Risk (Intelligence)",
      data.health.atRisk == null ? "—" : qty(data.health.atRisk),
    ],
    [],
    ["Stock Detail"],
    ["SKU", "Product", "Current Stock", "Days of Inventory", "Status"],
  ];

  if (data.stockRows.length === 0) {
    rows.push(["—", "No stock rows", "—", "—", "—"]);
  } else {
    for (const row of data.stockRows) {
      rows.push([
        row.sku,
        row.productName,
        qty(row.currentStock),
        row.daysLeft == null ? "—" : qty(Math.round(row.daysLeft)),
        row.status,
      ]);
    }
  }

  rows.push(
    [],
    ["Warehouse Sales"],
    [
      "Warehouse",
      "Orders",
      "Units",
      "Sales",
      "Order Share %",
      "Sales Share %",
    ]
  );

  if (data.warehouseDistribution.length === 0) {
    rows.push(["—", "—", "—", "—", "—", "—"]);
  } else {
    for (const row of data.warehouseDistribution) {
      rows.push([
        row.warehouse,
        qty(row.orders),
        qty(row.units),
        money(row.revenue, currency),
        pct(row.orderSharePercent),
        pct(row.revenueSharePercent),
      ]);
    }
  }

  if (data.notes.length > 0) {
    rows.push([], ["Notes"]);
    for (const note of data.notes) {
      rows.push([note]);
    }
  }

  return rows;
}

function portfolioTable(
  title: string,
  groups: ProductReportPortfolioGroup[],
  currency: string
): SheetCell[][] {
  const out: SheetCell[][] = [
    [title],
    [
      "Name",
      "Products",
      "Revenue",
      "Profit",
      "Revenue Share %",
      "Profit Share %",
    ],
  ];
  if (groups.length === 0) {
    out.push(["—", "—", "—", "—", "—", "—"]);
    return out;
  }
  for (const group of groups) {
    out.push([
      group.name,
      qty(group.productCount),
      money(group.revenue, currency),
      money(group.profit, currency),
      pct(group.revenueSharePercent),
      pct(group.profitSharePercent),
    ]);
  }
  return out;
}

function buildPortfolioSheet(
  data: ProductReportPortfolioData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Product Portfolio"], [], ["No portfolio metrics available."]];
  }

  return [
    ["Product Portfolio"],
    ["Grouped contribution by brand, category, and inventory status"],
    [],
    ["Highlights"],
    ["Largest Brand", data.largestBrand?.name ?? "—"],
    ["Largest Category", data.largestCategory?.name ?? "—"],
    ["Highest Revenue Category", data.highestRevenueCategory?.name ?? "—"],
    ["Highest Profit Category", data.highestProfitCategory?.name ?? "—"],
    [],
    ...portfolioTable("By Brand", data.byBrand, currency),
    [],
    ...portfolioTable("By Category", data.byCategory, currency),
    [],
    ...portfolioTable("By Status", data.byStatus, currency),
  ];
}

function buildAppendixSheet(
  data: ProductReportAppendixData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Appendix"], [], ["No appendix rows available."]];
  }

  const rows: SheetCell[][] = [
    ["Appendix"],
    ["Detailed product and marketplace cost fields for Excel analysis"],
    [],
    ["Product Detail"],
    performanceHeader(),
  ];

  for (const row of data.rows) {
    rows.push(performanceCells(row, currency));
  }

  rows.push([], ["Marketplace Cost Detail"], costHeader());
  for (const row of data.costRows) {
    rows.push(costCells(row, currency));
  }

  return rows;
}

/**
 * Product Report workbook — management presentation from ReportPayload only.
 */
export function buildProductReportWorkbook(payload: ReportPayload): ArrayBuffer {
  const currency = payload.identity.currency || "RUB";
  const executive = payload.sections.find((s) => s.id === "product-executive-summary")
    ?.data as ProductReportExecutiveData | undefined;
  const performance = payload.sections.find((s) => s.id === "product-performance")
    ?.data as { rows: ProductReportPerformanceRow[] } | undefined;
  const profitability = payload.sections.find((s) => s.id === "product-profitability")
    ?.data as ProductReportProfitabilityData | undefined;
  const marketplaceCost = payload.sections.find(
    (s) => s.id === "product-marketplace-cost"
  )?.data as ProductReportMarketplaceCostData | undefined;
  const inventory = payload.sections.find((s) => s.id === "product-inventory")
    ?.data as ProductReportInventoryData | undefined;
  const portfolio = payload.sections.find((s) => s.id === "product-portfolio")
    ?.data as ProductReportPortfolioData | undefined;
  const appendix = payload.sections.find((s) => s.id === "product-appendix")
    ?.data as ProductReportAppendixData | undefined;

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, "Cover", buildCoverSheet(payload), [38, 52]);
  appendSheet(
    workbook,
    "Executive Summary",
    buildExecutiveSheet(executive, currency, performance?.rows ?? []),
    [32, 18, 40, 22, 14, 12]
  );
  appendSheet(
    workbook,
    "Product Performance",
    buildPerformanceSheet(performance, currency),
    [16, 14, 14, 14, 14, 10, 10, 10, 12, 10, 10, 14, 12, 12]
  );
  appendSheet(
    workbook,
    "Profitability Analysis",
    buildProfitabilitySheet(profitability, currency),
    [8, 16, 36, 14, 14, 16]
  );
  appendSheet(
    workbook,
    "Marketplace Cost Analysis",
    buildMarketplaceCostSheet(marketplaceCost, currency),
    [16, 36, 14, 14, 14, 12, 12, 16, 16]
  );
  appendSheet(workbook, "Inventory Position", buildInventorySheet(inventory, currency), [
    22,
    36,
    14,
    16,
    14,
    14,
  ]);
  appendSheet(workbook, "Product Portfolio", buildPortfolioSheet(portfolio, currency), [
    24,
    12,
    14,
    14,
    14,
    14,
  ]);
  appendSheet(workbook, "Appendix", buildAppendixSheet(appendix, currency), [
    16,
    14,
    14,
    14,
    14,
    10,
    10,
    10,
    12,
    10,
    10,
    14,
    12,
    12,
  ]);

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
