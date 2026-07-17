/**
 * Validate WB Settlement netForPay sources and auto-fallback logic.
 * Usage: npx tsx scripts/verify-wb-settlement-sources.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  resolveNetForPay,
  buildWbSettlementFromSources,
  sumNetForPayFromFinance,
} from "../src/lib/wb-settlement.ts";
import { summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";

const FROM = "2026-06-15";
const TO = "2026-07-05";

const sales = JSON.parse(
  readFileSync("exports/wb-raw-account1-portal-proof/sales.json", "utf8")
).data;
const finance = JSON.parse(
  readFileSync("exports/wb-raw-account1-portal-proof/finance.json", "utf8")
).data;
const weekly = JSON.parse(
  readFileSync("exports/wb-raw-account1-portal-proof/sales-reports-list-weekly.json", "utf8")
).data;

const inR = (d) => d >= FROM && d <= TO;
const r = (n) => Math.round(n * 100) / 100;

// Sales API forPay by sale date (NOT used for settlement — validation only)
let salesForPay = 0;
for (const s of sales) {
  const d = s.date.slice(0, 10);
  if (!inR(d)) continue;
  const fp = Math.abs(s.forPay || 0);
  salesForPay += String(s.saleID || "").startsWith("R") ? -fp : fp;
}

// Finance ppvz_for_pay simulated as for_pay sync lines
const financeForPayLines = [];
for (const row of finance) {
  const d = (row.rr_dt || row.sale_dt || "").slice(0, 10);
  if (!inR(d)) continue;
  if (!row.ppvz_for_pay || Math.abs(row.ppvz_for_pay) === 0) continue;
  const isReturn = row.supplier_oper_name === "Возврат" || row.doc_type_name === "Возврат";
  financeForPayLines.push({
    amount: isReturn ? -Math.abs(row.ppvz_for_pay) : Math.abs(row.ppvz_for_pay),
    source_key: `rrd:${row.rrd_id}:for_pay`,
    wb_source_suffix: "for_pay",
    operation_date: d,
    operation_type: "other",
  });
}

const financeNetForPay = financeForPayLines.reduce((s, row) => s + row.amount, 0);

const weeklyForPay = weekly
  .filter((rep) => rep.dateFrom <= TO && rep.dateTo >= FROM)
  .reduce((s, rep) => s + parseFloat(rep.forPaySum || 0), 0);

const weeklyBank = weekly
  .filter((rep) => rep.dateFrom <= TO && rep.dateTo >= FROM)
  .reduce((s, rep) => s + parseFloat(rep.bankPaymentSum || 0), 0);

const resolution = resolveNetForPay({
  finance: financeForPayLines,
  weeklyReports: weekly,
  scopeFrom: FROM,
  scopeTo: TO,
});

const cat = summarizeFinanceByCategory(
  finance.filter((row) => inR((row.rr_dt || row.sale_dt || "").slice(0, 10)))
);
const log = cat.LOGISTICS + cat.RETURN_LOGISTICS;
const settlement = buildWbSettlementFromSources(
  finance.filter((row) => inR((row.rr_dt || row.sale_dt || "").slice(0, 10))),
  log,
  resolution
);

console.log("WB Settlement Source Validation");
console.log(`Period: ${FROM} → ${TO}`);
console.log("");
console.log("=== Validation Questions ===");
console.log("1. Transaction-level netForPay available?");
console.log(`   Yes — Finance API ppvz_for_pay on sale/return rows (${financeForPayLines.length} lines)`);
console.log("2. Which API/table?");
console.log("   Finance API reportDetailByPeriod → wb_finance (for_pay suffix after sync)");
console.log("   Fallback: Finance API /api/finance/v1/sales-reports/list → forPaySum");
console.log("");
console.log("3. Mathematical equivalence to Weekly «К перечислению»?");
console.log(`   Finance ppvz_for_pay (rr_dt):  ${r(financeNetForPay)} ₽`);
console.log(`   Weekly forPaySum:              ${r(weeklyForPay)} ₽  (Excel: 411,046.13)`);
console.log(`   Sales API forPay (sale_date):  ${r(salesForPay)} ₽  ← NOT equivalent (+${r(salesForPay - financeNetForPay)})`);
console.log(`   Match finance vs weekly:       ${Math.abs(financeNetForPay - weeklyForPay) < 0.01 ? "EXACT" : "DIFF"}`);
console.log("");
console.log("4. Auto-fallback:");
console.log(`   Resolved source: ${resolution.dataSource}`);
console.log(`   Resolved netForPay: ${r(resolution.netForPay)} ₽`);
console.log("");
console.log("=== WB Settlement ===");
console.log(`netForPay:     ${r(settlement.netForPay)} ₽`);
console.log(`Logistics:     ${r(settlement.logistics)} ₽`);
console.log(`Storage:       ${r(settlement.storage)} ₽`);
console.log(`Penalties:     ${r(settlement.penalties)} ₽`);
console.log(`Deductions:    ${r(settlement.deductions)} ₽`);
console.log(`Acceptance:    ${r(settlement.acceptance)} ₽`);
console.log(`WB Settlement: ${r(settlement.settlement)} ₽`);
console.log(`Weekly bankPaymentSum (Итого): ${r(weeklyBank)} ₽`);
