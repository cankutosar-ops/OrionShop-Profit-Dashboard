#!/usr/bin/env node
/** Offline signed-fee regression across engine, products, reports, and exporters. */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calculateModelBNetProfit, marketplaceFeeFromSales } from "../src/lib/financial-engine.ts";
import { buildProductProfitabilityRows } from "../src/lib/product-profitability-builder.ts";
import { buildProductAnalyticsV3Rows } from "../src/lib/product-analytics.ts";
import { buildPnLFromModelB, buildPnLFromProductRows } from "../src/lib/reporting/module/pnl-report.ts";
import { buildProductProfitReport } from "../src/lib/reporting/module/product-profit-report.ts";
import { buildGroupPerformanceReport } from "../src/lib/reporting/module/group-performance-report.ts";
import { buildPnLExportDocument, buildProductProfitExportDocument, buildGroupPerformanceExportDocument } from "../src/lib/reporting/module/export/build-export-document.ts";
import { exportReportCsv } from "../src/lib/reporting/module/export/csv-exporter.ts";
import { exportReportExcel } from "../src/lib/reporting/module/export/excel-exporter.ts";
import { exportReportPdf } from "../src/lib/reporting/module/export/pdf-exporter.ts";
import { buildSettlementFromProductRows } from "../src/lib/reporting/module/settlement-report.ts";

const params = { grossSales: 1000, returnedSales: 0, netSales: 1000, netSalesStatus: "ready", salesForPay: 700,
  financeNetForPay: 500, acquiring: 3, logistics: 12, storage: 4, penalties: 2, adjustments: 5,
  acceptance: 1, productCost: 100, advertising: 10, customerPaid: 900 };
const positive = calculateModelBNetProfit(params);
const zero = calculateModelBNetProfit({ ...params, salesForPay: 1000 });
const negative = calculateModelBNetProfit({ ...params, netSales: 900, grossSales: 900, salesForPay: 950 });
const incomplete = calculateModelBNetProfit({ ...params, netSales: 900, grossSales: 900, salesForPay: 950, netSalesStatus: "unavailable" });
assert.equal(positive.marketplaceFee, 300);
assert.equal(positive.marketplaceFeeStatus, "ready");
assert.equal(zero.marketplaceFee, 0);
assert.equal(zero.marketplaceFeeStatus, "ready");
assert.equal(negative.marketplaceFee, -50);
assert.equal(negative.commission, -50);
assert.equal(negative.marketplaceFeeStatus, "anomaly");
assert.equal(incomplete.marketplaceFee, -50);
assert.equal(incomplete.marketplaceFeeStatus, "unavailable");
assert.equal(negative.finalNetProfit, positive.finalNetProfit);
assert.equal(marketplaceFeeFromSales(900, 950), -50);

const sale = (id, productId, price, forPay) => ({ id, marketplace_account_id: "1", product_id: productId,
  nm_id: Number(productId), srid: id, sale_date: "2026-09-01", revenue: price, price_with_disc: price,
  for_pay: forPay, quantity: 1, is_return: false });
const products = ["1", "2", "3", "4"].map((id) => ({ id, marketplace_account_id: "1", nm_id: Number(id),
  supplier_article: `SKU-${id}`, name: `Product ${id}`, brand: { name: "Brand" }, category: { name: "Category" } }));
const rows = buildProductProfitabilityRows({ products, orders: [], finance: [], ads: [], costHistory: [],
  sales: [sale("s1", "1", 900, 950), sale("s2", "2", 1000, 700), sale("s3", "3", 1000, 1000), sale("s4", "4", null, 950)] });
const byId = Object.fromEntries(rows.map((row) => [row.productId, row]));
assert.equal(byId["1"].marketplaceFees, -50);
assert.equal(byId["1"].marketplaceFeeStatus, "anomaly");
assert.equal(byId["2"].marketplaceFeeStatus, "ready");
assert.equal(byId["3"].marketplaceFees, 0);
assert.equal(byId["4"].netSalesStatus, "unavailable");
assert.equal(byId["4"].marketplaceFeeStatus, "unavailable");
assert.equal(buildProductAnalyticsV3Rows(rows).find((row) => row.productId === "1")?.marketplaceFeeStatus, "anomaly");

const productView = buildProductProfitReport({ products: rows.filter((row) => row.productId !== "4") });
const category = buildGroupPerformanceReport({ products: rows.filter((row) => row.productId !== "4"), dimension: "category" });
const brand = buildGroupPerformanceReport({ products: rows.filter((row) => row.productId !== "4"), dimension: "brand" });
assert.equal(productView.rows.find((row) => row.productId === "1")?.marketplaceFees, -50);
assert.equal(productView.rows.find((row) => row.productId === "1")?.marketplaceFeeStatus, "anomaly");
assert.equal(category.rows[0].marketplaceFees, 250);
assert.equal(category.rows[0].marketplaceFeeStatus, "anomaly");
assert.equal(brand.rows[0].marketplaceFees, 250);
assert.equal(brand.rows[0].marketplaceFeeStatus, "anomaly");
assert.equal(buildPnLFromProductRows([byId["1"]]).lines.find((line) => line.id === "marketplaceFees")?.amount, -50);
assert.equal(buildPnLFromProductRows([byId["1"]]).marketplaceFeeStatus, "anomaly");

const tenant = { companyName: "Test", marketplaceLabel: "WB", currency: "RUB" };
const common = { tenant, dateFrom: "2026-09-01", dateTo: "2026-09-01" };
const pnl = buildPnLFromModelB(negative);
const pnlDoc = buildPnLExportDocument({ ...common, source: pnl.source, lines: pnl.lines, summaryLines: pnl.lines,
  netSalesStatus: pnl.netSalesStatus, marketplaceFeeStatus: pnl.marketplaceFeeStatus });
const productDoc = buildProductProfitExportDocument({ ...common, source: productView.source, rows: productView.rows,
  summary: productView.summary, netSalesStatus: productView.netSalesStatus, marketplaceFeeStatus: productView.marketplaceFeeStatus });
const categoryDoc = buildGroupPerformanceExportDocument({ ...common, reportId: "category-performance", title: "Category",
  dimension: "category", rows: category.rows, summary: category.summary, netSalesStatus: category.netSalesStatus,
  marketplaceFeeStatus: category.marketplaceFeeStatus });
const brandDoc = buildGroupPerformanceExportDocument({ ...common, reportId: "brand-performance", title: "Brand",
  dimension: "brand", rows: brand.rows, summary: brand.summary, netSalesStatus: brand.netSalesStatus,
  marketplaceFeeStatus: brand.marketplaceFeeStatus });
for (const doc of [pnlDoc, productDoc, categoryDoc, brandDoc]) {
  assert.equal(doc.meta.filters.find((f) => f.label === "Marketplace Fee status")?.value, "anomaly");
  assert.ok(doc.meta.filters.some((f) => f.label === "Marketplace Fee warning"));
}
assert.equal(pnlDoc.rows.find((row) => row.label === "Marketplace Fee")?.amount, -50);
assert.equal(productDoc.rows.find((row) => row.sku === "SKU-1")?.marketplaceFees, -50);
assert.equal(categoryDoc.rows[0].marketplaceFees, 250);
assert.equal(brandDoc.rows[0].marketplaceFees, 250);
const csv = new TextDecoder().decode(exportReportCsv(pnlDoc));
assert.match(csv, /-50/);
assert.match(csv, /anomaly/);
const xlsx = await exportReportExcel(pnlDoc);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(xlsx));
const sheetText = workbook.worksheets[0].getRows(1, workbook.worksheets[0].rowCount)
  .flatMap((row) => row.values).join(" ");
assert.match(sheetText, /-50/);
assert.match(sheetText, /anomaly/);
const pdf = await exportReportPdf(pnlDoc);
assert.ok(pdf.byteLength > 1000);

const categorySettlement = buildSettlementFromProductRows([{ netSales: 100, netSalesStatus: "ready", marketplaceFees: -50,
  marketplaceFeeStatus: "anomaly", revenue: 80, logistics: 0, returnLogistics: 0, storage: 0,
  penalties: 0, otherExpenses: 7, accountAdjustments: 3 }]);
assert.equal(categorySettlement.netTransfer, 73);
assert.equal(categorySettlement.lines.find((line) => line.id === "otherDeductions")?.amount, 7);
console.log("PASS signed Marketplace Fee: positive, zero, negative, incomplete Sales, unchanged Net Profit, product/group/report/export propagation, unchanged category Settlement arithmetic");
