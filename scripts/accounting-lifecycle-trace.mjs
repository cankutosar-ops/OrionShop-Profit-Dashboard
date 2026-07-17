#!/usr/bin/env node
/** Decompose legacy otherExpenses + trace sample sale lifecycle */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { effectiveFinanceCategory, parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { profitOperationTypeForRow } from "../src/lib/finance-category.ts";
import { fetchFinanceInRange, fetchSalesInRange, fetchProductsWithRelations } from "../src/services/persisted-query-service.ts";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-04-14";
const to = process.argv[4] ?? "2026-07-12";
const scope = { marketplaceAccountId: accountId, companyId: "", from, to };

const client = createAdminClient();
const products = await fetchProductsWithRelations(accountId, client);
const productIds = products.map((p) => String(p.id));
const [finance, sales] = await Promise.all([
  fetchFinanceInRange(scope, client, { productIds }),
  fetchSalesInRange(scope, client, { productIds }),
]);

// Legacy other bucket = operation_type other + unclassified
const otherByCategory = {};
const otherBySuffix = {};
let otherTotal = 0;
for (const row of finance) {
  if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) === "for_pay") continue;
  const op = profitOperationTypeForRow(row);
  if (op !== "other" && op !== "unclassified") continue;
  const cat = effectiveFinanceCategory(row);
  const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
  const amt = Math.abs(Number(row.amount));
  otherTotal += amt;
  otherByCategory[cat] = (otherByCategory[cat] ?? 0) + amt;
  otherBySuffix[suffix ?? "null"] = (otherBySuffix[suffix ?? "null"] ?? 0) + amt;
}

console.log("=== Legacy otherExpenses decomposition ===");
console.log(`Total other+unclassified: ${otherTotal.toFixed(2)}`);
console.log("By effectiveFinanceCategory:");
for (const [k, v] of Object.entries(otherByCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v.toFixed(2)}`);
}
console.log("By wb_source_suffix:");
for (const [k, v] of Object.entries(otherBySuffix).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v.toFixed(2)}`);
}

// Sales price_with_disc coverage
const completed = sales.filter((s) => !s.is_return);
const withPwd = completed.filter((s) => Number(s.price_with_disc) > 0);
const withForPay = sales.filter((s) => Number(s.for_pay) > 0);
console.log("\n=== Sales field coverage ===");
console.log(`Completed sales: ${completed.length}`);
console.log(`With price_with_disc > 0: ${withPwd.length}`);
console.log(`With for_pay > 0: ${withForPay.length}`);
console.log(`Sum revenue: ${completed.reduce((s, r) => s + r.revenue, 0).toFixed(2)}`);
console.log(`Sum price_with_disc: ${withPwd.reduce((s, r) => s + Math.abs(Number(r.price_with_disc)), 0).toFixed(2)}`);

// Sample sale with finance lines
const sample = completed.find((s) => Number(s.price_with_disc) > 0 && s.srid) ?? completed[0];
if (sample) {
  const srid = sample.srid;
  const finLines = finance.filter((f) => f.srid === srid);
  console.log("\n=== Sample transaction lifecycle ===");
  console.log(JSON.stringify({
    srid,
    sale_date: sample.sale_date,
    revenue: sample.revenue,
    price_with_disc: sample.price_with_disc,
    finished_price: sample.finished_price,
    for_pay: sample.for_pay,
    quantity: sample.quantity,
    finance_lines: finLines.map((f) => ({
      date: f.operation_date,
      suffix: parseWbSourceSuffix(f.source_key, f.wb_source_suffix),
      category: effectiveFinanceCategory(f),
      op_type: f.operation_type,
      amount: f.amount,
      description: f.description?.slice(0, 60),
    })),
  }, null, 2));
}
