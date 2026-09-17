#!/usr/bin/env node
import assert from "node:assert/strict";
import { escapeSpreadsheetCsvCell } from "../src/lib/csv-cell.ts";
import { exportReportCsv } from "../src/lib/reporting/module/export/csv-exporter.ts";
import { verificationReportToCsv } from "../src/lib/sync-verification-audit/export.ts";

for (const marker of ["=", "+", "-", "@"]) {
  assert.equal(escapeSpreadsheetCsvCell(`${marker}cmd`), `'${marker}cmd`);
  assert.equal(escapeSpreadsheetCsvCell(` \t${marker}cmd`), `' \t${marker}cmd`);
}
assert.equal(escapeSpreadsheetCsvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
assert.equal(escapeSpreadsheetCsvCell("Ordinary SKU"), "Ordinary SKU");
assert.equal(escapeSpreadsheetCsvCell("-1 234,50 ₽", true), '"-1 234,50 ₽"');

const doc = {
  reportId: "sample",
  title: "=report",
  generatedAt: "2026-09-17",
  currency: "RUB",
  meta: { company: "@company", marketplace: "WB", dateFrom: "2026-09-01", dateTo: "2026-09-17", filters: [{ label: "+filter", value: "=value" }] },
  summary: [{ label: "=revenue", value: -12, type: "number" }],
  columns: [{ key: "sku", header: "=SKU", type: "text" }, { key: "amount", header: "Amount", type: "number" }],
  rows: [{ sku: "-danger", amount: -12 }],
};
const reportCsv = new TextDecoder().decode(exportReportCsv(doc));
assert.ok(reportCsv.startsWith("Report Name;'=report"));
assert.ok(reportCsv.includes("Company;'@company"));
assert.ok(reportCsv.includes("'+filter;'=value"));
assert.ok(reportCsv.includes("'=SKU;Amount"));
assert.ok(reportCsv.includes("'-danger;-12"));
assert.ok(reportCsv.includes("'=revenue;-12"));

const auditCsv = verificationReportToCsv({
  verified_at: "2026-09-17",
  marketplace_account_id: "1",
  health_score: 95,
  overall_result: "PASS",
  schema_status: "PASS",
  orders_status: "PASS",
  sales_status: "PASS",
  finance_status: "PASS",
  inventory_status: "PASS",
  sync_status: "PASS",
  sync_duration_ms: 1,
  snapshot: { orders: {}, sales: {}, finance: {}, inventory: {}, operationalAlerts: [] },
  failures: [{ category: "other", affectedEntity: "=entity", reason: "@reason" }],
});
assert.ok(auditCsv.includes("failure:other,'=entity | @reason"));
console.log("CSV formula safety checks OK");
