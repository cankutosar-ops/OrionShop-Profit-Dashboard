#!/usr/bin/env node
/** Validate cost management export/import for a marketplace account. */
import { readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
import { createValidationSession, getValidationAccountId, assertProductionValidationAllowed } from "./lib/validation-isolation.mjs";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = getValidationAccountId(process.argv[2] ?? "2");
assertProductionValidationAllowed(accountId);

const { buildCostTemplateRows, bulkImportCostRecords, fetchProductOptions } = await import(
  "../src/services/cost-service.ts"
);
const { buildCostTemplateWorkbook, parseCostExcel } = await import("../src/lib/cost-excel.ts");
const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { fetchCostHistory } = await import("../src/services/dashboard-service.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

console.log(`=== Cost Management validation (account ${accountId}) ===\n`);

const supabase = createAdminClient();
const session = createValidationSession(supabase, accountId);
await session.begin();

let exitCode = 0;

try {
  const products = await fetchProductOptions(accountId);
  const templateRows = await buildCostTemplateRows(accountId);

  console.log(`Products in account: ${products.length}`);
  console.log(`Template rows: ${templateRows.length}`);
  console.log(
    products.length === templateRows.length ? "PASS  Export includes every product" : "FAIL  Row count mismatch"
  );

  const withCost = templateRows.filter((r) => r.unit_cost !== null).length;
  const withoutCost = templateRows.filter((r) => r.unit_cost === null).length;
  console.log(`With Unit Cost: ${withCost} · Blank Unit Cost: ${withoutCost}`);

  const buf = buildCostTemplateWorkbook(templateRows);
  const workbook = XLSX.read(buf, { type: "array" });
  const headers =
    XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })[0] ?? [];
  console.log(`Template columns: ${headers.join(", ")}`);
  console.log(
    headers.join("|") === "Supplier Article|Unit Cost"
      ? "PASS  Two-column template"
      : "FAIL  Unexpected columns"
  );

  const parsed = parseCostExcel(buf);
  console.log(`Parsed import rows: ${parsed.length}`);

  const { count: purchasesBefore } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  const { count: purchaseLinesBefore } = await supabase
    .from("purchase_lines")
    .select("*", { count: "exact", head: true });

  const unchanged = await bulkImportCostRecords(parsed, accountId);
  console.log("\nImport unchanged template:");
  console.log(unchanged);
  console.log(
    unchanged.inserted === 0 && unchanged.skippedBlank === templateRows.length
      ? "PASS  Blank import updates nothing"
      : unchanged.inserted === 0 && unchanged.skippedUnchanged > 0
        ? "PASS  Unchanged import updates nothing"
        : "CHECK import unchanged result"
  );

  const sample = products.slice(0, 1)[0];
  if (sample) {
    const { data: beforeHistory } = await supabase
      .from("product_cost_history")
      .select("cost")
      .eq("product_id", sample.id)
      .order("effective_from", { ascending: false })
      .limit(1);

    const newCost = (beforeHistory?.[0]?.cost ?? 0) + 1;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const effectiveFrom = tomorrow.toISOString().split("T")[0];
    const changed = await bulkImportCostRecords(
      [
        {
          row: 2,
          supplier_article: sample.supplier_article.trim(),
          new_cost: newCost,
          effective_from: effectiveFrom,
        },
      ],
      accountId
    );
    console.log("\nImport single product cost update:");
    console.log(changed);

    const { data: history } = await supabase
      .from("product_cost_history")
      .select("product_id, cost, effective_from, created_at")
      .eq("product_id", sample.id)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const insertedCost = history?.[0]?.cost;
    console.log(
      Number(insertedCost) === newCost
        ? "PASS  Cost import writes product_cost_history"
        : "FAIL  Latest history row cost mismatch",
      { expected: newCost, actual: insertedCost }
    );

    const { data: allProducts } = await supabase
      .from("products")
      .select("id, supplier_article")
      .eq("marketplace_account_id", accountId);

    const costHistory = await fetchCostHistory(accountId);
    const latest = buildLatestCostByProductId(
      costHistory,
      (allProducts ?? []).map((p) => ({
        id: String(p.id),
        supplier_article: p.supplier_article,
      }))
    );

    console.log(
      latest.get(String(sample.id)) === newCost
        ? "PASS  Product Analytics latest cost reflects import"
        : "FAIL  PA latest cost mismatch",
      { expected: newCost, actual: latest.get(String(sample.id)) }
    );
  }

  const { count: purchasesAfter } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  const { count: purchaseLinesAfter } = await supabase
    .from("purchase_lines")
    .select("*", { count: "exact", head: true });

  console.log(
    purchasesBefore === purchasesAfter && purchaseLinesBefore === purchaseLinesAfter
      ? "\nPASS  Cost import does not create purchases or purchase_lines"
      : "\nFAIL  Cost import created purchase records",
    { purchasesBefore, purchasesAfter, purchaseLinesBefore, purchaseLinesAfter }
  );

  console.log("\nDone.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await session.cleanup();
}

process.exit(exitCode);
