import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { fetchFinanceInRange, fetchSalesInRange } = await import(
  "../src/services/persisted-query-service.ts"
);
const { sumNetForPayFromFinance } = await import("../src/lib/wb-settlement.ts");
const { buildNetForPayFromDb } = await import("../src/lib/sales-revenue-resolution.ts");

const sb = createAdminClient();
const from = "2026-06-22";
const to = "2026-07-21";
const scope = { marketplaceAccountId: "1", from, to, brandId: null };

const { count: financeCount } = await sb
  .from("wb_finance")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", "1")
  .gte("operation_date", from)
  .lte("operation_date", to);

const { count: salesCount } = await sb
  .from("wb_sales")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", "1")
  .gte("sale_date", from)
  .lte("sale_date", to);

const { data: reports } = await sb
  .from("wb_sales_reports")
  .select("date_from,date_to,for_pay_sum")
  .eq("marketplace_account_id", "1")
  .order("date_from", { ascending: false })
  .limit(30);

const financePaged = await fetchFinanceInRange(scope, sb);
const salesPaged = await fetchSalesInRange(scope, sb);

const out = {
  financeCount,
  salesCount,
  financePagedLen: financePaged.length,
  salesPagedLen: salesPaged.length,
  financeNetForPayPaged: sumNetForPayFromFinance(financePaged),
  salesForPayPaged: buildNetForPayFromDb(salesPaged),
  reports: reports ?? [],
};
writeFileSync(
  resolve("exports/_tmp_finance_count_check.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
