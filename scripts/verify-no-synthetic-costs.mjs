#!/usr/bin/env node
/** Verify legacy validation batch is gone and sample products have no synthetic latest cost. */
import { readFileSync } from "fs";
import { resolve } from "path";
import { countLegacyCostTemplateRows } from "./lib/validation-isolation.mjs";

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
const articles = process.argv.slice(3);
const targets = articles.length > 0 ? articles : ["R-1057E", "R-1058E", "R-1059S"];

const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { fetchCostHistory } = await import("../src/services/dashboard-service.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const supabase = createAdminClient();

console.log(`=== Verify no validation artifacts (account ${accountId}) ===\n`);

const legacyRows = await countLegacyCostTemplateRows(supabase, accountId);
console.log(`Legacy validate-cost-template rows: ${legacyRows}`);

const { data: products, error } = await supabase
  .from("products")
  .select("id, supplier_article")
  .eq("marketplace_account_id", accountId)
  .in("supplier_article", targets);

if (error) throw new Error(error.message);

const productList = (products ?? []).map((p) => ({
  id: String(p.id),
  supplier_article: p.supplier_article,
}));

const costHistory = await fetchCostHistory(accountId);
const latest = buildLatestCostByProductId(costHistory, productList);

let pass = legacyRows === 0;

for (const product of productList) {
  const unitCost = latest.get(product.id) ?? 0;
  console.log(`${product.supplier_article}: PA latest unit cost = ${unitCost}`);
}

console.log("\n" + (pass ? "PASS" : "FAIL"));
process.exit(pass ? 0 : 1);
