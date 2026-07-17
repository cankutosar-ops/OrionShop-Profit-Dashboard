#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { effectiveFinanceCategory, parseWbSourceSuffix } from "../src/lib/finance-category.ts";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const from = "2026-06-13";
const to = "2026-07-12";
const accountId = "1";
const client = createAdminClient();

const { data: company } = await client.from("companies").select("name").eq("id", "1").maybeSingle();
const { data: account } = await client
  .from("marketplace_accounts")
  .select("account_name")
  .eq("id", accountId)
  .maybeSingle();

console.log("Company:", company?.name);
console.log("Account:", account?.account_name);

const rows = [];
let offset = 0;
while (true) {
  const { data } = await client
    .from("wb_finance")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .gte("operation_date", from)
    .lte("operation_date", to)
    .range(offset, offset + 999);
  rows.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
  offset += 1000;
}

const adj = rows.filter((row) => effectiveFinanceCategory(row) === "ADJUSTMENT");
console.log("\nAccount Adjustments (" + adj.length + " rows):");
for (const row of adj) {
  console.log({
    date: row.operation_date,
    amount: row.amount,
    source_key: row.source_key,
    suffix: parseWbSourceSuffix(row.source_key, row.wb_source_suffix),
    oper: row.supplier_oper_name,
    category: effectiveFinanceCategory(row),
  });
}
