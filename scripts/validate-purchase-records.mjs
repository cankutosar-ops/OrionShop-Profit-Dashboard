#!/usr/bin/env node
/** Validate purchase template export/import and Product Analytics cost parity. */
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

const { fetchProductOptions } = await import("../src/services/cost-service.ts");
const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const {
  buildPurchaseTemplateRows,
  fetchPurchaseById,
  importPurchaseFromExcel,
} = await import("../src/services/purchase-service.ts");
const {
  buildPurchaseTemplateWorkbook,
  parsePurchaseExcel,
} = await import("../src/lib/purchase-excel.ts");

console.log(`=== Purchase records validation (account ${accountId}) ===\n`);

const supabase = createAdminClient();
const session = createValidationSession(supabase, accountId);
await session.begin();

async function snapshotLatestCosts() {
  const { data, error } = await supabase
    .from("product_cost_history")
    .select("product_id, cost, effective_from")
    .order("effective_from", { ascending: false });

  if (error) throw new Error(error.message);

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, supplier_article")
    .eq("marketplace_account_id", accountId);

  if (productsError) throw new Error(productsError.message);

  const productIds = new Set((products ?? []).map((row) => String(row.id)));
  const scoped = (data ?? []).filter((row) => productIds.has(String(row.product_id)));
  const productList = (products ?? []).map((row) => ({
    id: String(row.id),
    supplier_article: row.supplier_article,
  }));
  return buildLatestCostByProductId(
    scoped.map((row) => ({
      product_id: String(row.product_id),
      cost: Number(row.cost),
      effective_from: row.effective_from,
    })),
    productList
  );
}

let exitCode = 0;

try {
  const { error: schemaError } = await supabase.from("purchases").select("id").limit(1);
  if (schemaError?.message?.includes("Could not find the table")) {
    console.log("FAIL  purchases table missing — run scripts/apply-purchase-migrations.mjs first");
    exitCode = 1;
  } else if (schemaError) {
    throw new Error(schemaError.message);
  } else {
    const costsBefore = await snapshotLatestCosts();
    const products = await fetchProductOptions(accountId);
    const templateRows = await buildPurchaseTemplateRows(accountId);

    console.log(`Products in account: ${products.length}`);
    console.log(`Template rows: ${templateRows.length}`);
    console.log(
      products.length === templateRows.length
        ? "PASS  Export includes every product"
        : "FAIL  Row count mismatch"
    );

    const buf = buildPurchaseTemplateWorkbook(templateRows);
    const workbook = XLSX.read(buf, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] ?? [];
    console.log(`Template columns: ${headers.join(", ")}`);
    console.log(
      headers.join("|") === "Supplier Article|Quantity|Unit Cost"
        ? "PASS  Template has three columns only"
        : "FAIL  Unexpected template columns"
    );

    const parsedEmpty = parsePurchaseExcel(buf);
    console.log(`Parsed rows (blank template): ${parsedEmpty.rows.length}`);
    console.log(
      parsedEmpty.rows.length === 0
        ? "PASS  Blank template has no importable rows"
        : "CHECK  Blank template rows"
    );

    const sampleProducts = products.slice(0, 3);
    const importRows = sampleProducts.map((product, index) => ({
      "Supplier Article": product.supplier_article,
      Quantity: 100 + index,
      "Unit Cost": 12.5 + index,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importRows), "Purchases");
    const modBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const parsed = parsePurchaseExcel(modBuf);

    const purchaseDate = new Date().toISOString().split("T")[0];
    const importResult = await importPurchaseFromExcel(
      {
        marketplace_account_id: accountId,
        purchase_date: purchaseDate,
        supplier: "Validation Supplier",
        currency: "USD",
        exchange_rate: 1.25,
        notes: "Sprint 5 validation import",
      },
      parsed
    );

    console.log("\nImport result:");
    console.log(importResult);

    const purchase = await fetchPurchaseById(importResult.purchaseId, accountId, supabase);
    if (!purchase) {
      console.log("FAIL  Purchase not found after import");
      exitCode = 1;
    } else {
      const headerChecks = [
        purchase.supplier === "Validation Supplier",
        purchase.currency === "USD",
        purchase.exchange_rate === 1.25,
        purchase.purchase_date === purchaseDate,
        purchase.notes === "Sprint 5 validation import",
      ];

      console.log(
        headerChecks.every(Boolean)
          ? "PASS  Purchase header saved correctly (currency on header only)"
          : "FAIL  Purchase header mismatch",
        {
          supplier: purchase.supplier,
          currency: purchase.currency,
          exchange_rate: purchase.exchange_rate,
        }
      );

      const lineChecks = purchase.lines.every(
        (line) =>
          line.quantity > 0 &&
          line.unit_cost >= 0 &&
          line.purchase_id === purchase.id &&
          !("currency" in line)
      );

      console.log(
        lineChecks && purchase.lines.length === importResult.productsImported
          ? "PASS  Purchase lines contain article, quantity, unit cost only"
          : "FAIL  Purchase line validation",
        { lines: purchase.lines.length, imported: importResult.productsImported }
      );

      const rubImport = await importPurchaseFromExcel(
        {
          marketplace_account_id: accountId,
          purchase_date: purchaseDate,
          supplier: "RUB Supplier",
          currency: "RUB",
          exchange_rate: null,
          notes: null,
        },
        parsePurchaseExcel(modBuf)
      );
      const rubPurchase = await fetchPurchaseById(rubImport.purchaseId, accountId, supabase);
      console.log(
        rubPurchase?.currency === "RUB" && rubPurchase.exchange_rate === null
          ? "PASS  RUB purchase stores null exchange rate"
          : "FAIL  RUB exchange rate handling",
        { currency: rubPurchase?.currency, exchange_rate: rubPurchase?.exchange_rate }
      );

      const costsAfter = await snapshotLatestCosts();
      for (const [productId, beforeCost] of costsBefore) {
        const afterCost = costsAfter.get(productId);
        if (
          afterCost !== beforeCost &&
          !purchase.lines.some((line) => line.product_id === productId)
        ) {
          console.log(`FAIL  Unexpected cost change for product ${productId}`);
          exitCode = 1;
        }
      }

      for (const line of purchase.lines) {
        const afterCost = costsAfter.get(line.product_id);
        if (afterCost !== line.unit_cost) {
          console.log(
            `FAIL  Latest cost for ${line.supplier_article}: expected ${line.unit_cost}, got ${afterCost}`
          );
          exitCode = 1;
        }
      }

      if (exitCode === 0) {
        console.log("PASS  Product Analytics latest-cost path unchanged except for imported products");
      }
    }

    console.log("\nDone.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await session.cleanup();
}

process.exit(exitCode);
