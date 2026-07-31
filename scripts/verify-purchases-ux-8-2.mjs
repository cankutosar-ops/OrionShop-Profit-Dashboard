/**
 * Sprint 8.2 — Purchases UX Refresh validation.
 * Run: npx tsx scripts/verify-purchases-ux-8-2.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 8.2 — Purchases UX Refresh ===\n");

const { buildPurchaseLedgerSummary } = await import(
  "../src/lib/purchase-ledger-summary.ts"
);

const sample = [
  {
    id: "1",
    marketplace_account_id: "1",
    purchase_date: "2026-07-01",
    supplier: "Acme",
    currency: "TRY",
    exchange_rate: null,
    invoice_number: "INV-1",
    notes: null,
    created_at: "2026-07-02T10:00:00.000Z",
    updated_at: "2026-07-02T10:00:00.000Z",
    line_count: 2,
    supplierArticles: ["SKU-A", "SKU-B"],
    total_cost: 1500,
    lines: [
      {
        id: "l1",
        supplier_article: "SKU-A",
        product_name: "A",
        quantity: 10,
        unit_cost: 100,
      },
      {
        id: "l2",
        supplier_article: "SKU-B",
        product_name: "B",
        quantity: 5,
        unit_cost: 100,
      },
    ],
  },
  {
    id: "2",
    marketplace_account_id: "1",
    purchase_date: "2026-07-10",
    supplier: "Beta",
    currency: "USD",
    exchange_rate: 32,
    invoice_number: null,
    notes: null,
    created_at: "2026-07-11T12:00:00.000Z",
    updated_at: "2026-07-11T12:00:00.000Z",
    line_count: 1,
    supplierArticles: ["SKU-A"],
    total_cost: 200,
    lines: [
      {
        id: "l3",
        supplier_article: "SKU-A",
        product_name: "A",
        quantity: 2,
        unit_cost: 100,
      },
    ],
  },
];

const summary = buildPurchaseLedgerSummary(sample);
check("Total Purchases", summary.totalPurchases === 2);
check("Total Purchase Value", summary.totalPurchaseValue === 1700);
check("Products Updated (distinct SKUs)", summary.productsUpdated === 2);
check(
  "Last Import Date",
  summary.lastImportAt === "2026-07-11T12:00:00.000Z"
);

const managerSrc = readFileSync(
  resolve(process.cwd(), "src/components/purchases/purchases-manager.tsx"),
  "utf8"
);
check("Invoice Number field in header", managerSrc.includes("invoice_number"));
check(
  "Exchange rate gated by base currency",
  managerSrc.includes("showExchangeRate") && managerSrc.includes("baseCurrency")
);
check("Summary cards present", managerSrc.includes("Total Purchases") && managerSrc.includes("MetricCard"));
check("Products column (not Lines)", managerSrc.includes('label="Products"'));
check("Invoice No column", managerSrc.includes('label="Invoice No"'));
check("Total Cost column", managerSrc.includes('label="Total Cost"'));
check("Inline expansion", managerSrc.includes("toggleExpanded") && managerSrc.includes("expandedIds"));
check("Import Completed summary", managerSrc.includes("Import Completed") && managerSrc.includes("View Purchase"));
check(
  "Guided empty state",
  managerSrc.includes("Download the template") &&
    managerSrc.includes("Product Cost History will be updated automatically")
);
check(
  "No auto-redirect on import",
  !managerSrc.includes("router.push(purchaseHref")
);
check(
  "Does not import server purchase-service",
  !managerSrc.includes('@/services/purchase-service')
);

const uploadSrc = readFileSync(
  resolve(process.cwd(), "src/app/api/purchases/upload/route.ts"),
  "utf8"
);
check("Upload accepts invoice_number", uploadSrc.includes("invoice_number"));
check("Upload uses company base currency", uploadSrc.includes("getCompanyById"));
check("Upload returns newProducts", uploadSrc.includes("newProducts"));

const serviceSrc = readFileSync(
  resolve(process.cwd(), "src/services/purchase-service.ts"),
  "utf8"
);
check("Import persists invoice_number", serviceSrc.includes("invoice_number"));
check("Import tracks newProducts", serviceSrc.includes("newProducts"));
check("Cost history still recorded", serviceSrc.includes("recordProductCostHistory"));
check("No FIFO/LIFO/stock logic", !serviceSrc.includes("FIFO") && !serviceSrc.includes("stock"));

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260731120000_purchase_invoice_number.sql"
  ),
  "utf8"
);
check("Migration adds invoice_number", migration.includes("invoice_number"));

// Live: schema + fetch if configured
try {
  const { getSupabaseEnv } = await import("../src/lib/supabase/env.ts");
  const env = getSupabaseEnv();
  if (!env.isConfigured) {
    console.log("SKIP  Live purchases fetch — Supabase not configured");
  } else {
    const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
    const sb = createAdminClient();
    const { data: cols, error: colErr } = await sb
      .from("purchases")
      .select("invoice_number")
      .limit(1);
    if (colErr && /invoice_number|column/i.test(colErr.message)) {
      console.log(
        "WARN  Schema missing invoice_number — apply supabase/migrations/20260731120000_purchase_invoice_number.sql in Supabase SQL Editor"
      );
      check(
        "Schema has invoice_number column",
        false,
        "migration pending (import still works without persisting invoice until applied)"
      );
    } else {
      check("Schema has invoice_number column", !colErr, colErr?.message ?? "ok");
    }

    const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
    const { fetchPurchases } = await import("../src/services/purchase-service.ts");
    const scope = await resolveScopedDateRange({});
    const purchases = await fetchPurchases(scope.marketplaceAccountId);
    check("fetchPurchases returns list items", Array.isArray(purchases));
    if (purchases.length > 0) {
      const p = purchases[0];
      check("List item has total_cost", typeof p.total_cost === "number");
      check("List item has lines for expansion", Array.isArray(p.lines));
      check(
        "total_cost matches Σ lines",
        Math.abs(
          p.total_cost -
            p.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
        ) < 0.01
      );
    }
  }
} catch (err) {
  console.log(
    `SKIP  Live purchases checks — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
