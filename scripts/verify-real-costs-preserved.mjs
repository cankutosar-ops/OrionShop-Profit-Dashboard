#!/usr/bin/env node
/** Confirm real user cost rows were not removed by validation cleanup. */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "2";
const ARTICLE = process.argv[3] ?? "i8-80444";

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { buildLatestCostByProductId } = await import("../src/lib/cost-history-resolution.ts");
const { fetchCostHistory } = await import("../src/services/dashboard-service.ts");

const supabase = createAdminClient();

const { data: product } = await supabase
  .from("products")
  .select("id, supplier_article")
  .eq("marketplace_account_id", accountId)
  .eq("supplier_article", ARTICLE)
  .maybeSingle();

if (!product) {
  console.error("Product not found:", ARTICLE);
  process.exit(1);
}

const { data: rows } = await supabase
  .from("product_cost_history")
  .select("id, cost, effective_from, created_at")
  .eq("product_id", product.id)
  .order("effective_from", { ascending: false })
  .order("created_at", { ascending: false });

const costHistory = await fetchCostHistory(accountId);
const latest = buildLatestCostByProductId(costHistory, [
  { id: String(product.id), supplier_article: product.supplier_article },
]);

console.log(`=== Real cost preservation (${ARTICLE}, account ${accountId}) ===\n`);
console.log(`History rows: ${(rows ?? []).length}`);
for (const row of rows ?? []) {
  console.log(`  id=${row.id} cost=${row.cost} effective_from=${row.effective_from}`);
}
console.log(`PA latest unit cost: ${latest.get(String(product.id)) ?? 0}`);

const pass = (rows ?? []).length > 0;
console.log("\n" + (pass ? "PASS  Real costs preserved" : "FAIL"));
process.exit(pass ? 0 : 1);
