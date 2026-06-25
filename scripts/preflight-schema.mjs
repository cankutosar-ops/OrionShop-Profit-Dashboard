import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await res.json();

const SYNC_EXPECTED = {
  brands: { name: "text" },
  categories: { name: "text", parent_id: "bigint|null" },
  products: {
    supplier_article: "text",
    nm_id: "bigint",
    name: "text",
    brand_id: "bigint",
    category_id: "bigint",
    barcode: "text|null",
  },
  wb_orders: {
    srid: "text",
    nm_id: "bigint",
    product_id: "bigint",
    order_date: "timestamptz|date",
    sale_date: "date|null",
    price: "numeric",
    quantity: "integer",
    status: "text",
    warehouse: "text|null",
  },
  wb_sales: {
    srid: "text",
    nm_id: "bigint",
    product_id: "bigint",
    sale_date: "timestamptz|date",
    revenue: "numeric",
    quantity: "integer",
    is_return: "boolean",
    return_date: "date|null",
  },
  wb_finance: {
    product_id: "bigint|null",
    nm_id: "bigint|null",
    operation_date: "date",
    operation_type: "text",
    amount: "numeric",
    description: "text|null",
  },
};

console.log("=== TYPE MISMATCH REPORT ===\n");

let issues = 0;

for (const [table, cols] of Object.entries(SYNC_EXPECTED)) {
  const props = spec.definitions?.[table]?.properties ?? {};
  console.log(`Table: ${table} (id type: ${props.id?.format ?? props.id?.type ?? "?"})`);

  for (const [col, expected] of Object.entries(cols)) {
    const live = props[col];
    if (!live) {
      console.log(`  MISSING  ${col} (expected ${expected})`);
      issues++;
      continue;
    }
    const liveType = live.format ?? live.type;
    const ok =
      expected.includes("bigint") && liveType === "bigint" ||
      expected.includes("text") && (liveType === "text" || live.type === "string") ||
      expected.includes("numeric") && liveType === "numeric" ||
      expected.includes("integer") && liveType === "integer" ||
      expected.includes("boolean") && live.type === "boolean" ||
      expected.includes("date") && (liveType === "date" || liveType === "timestamp with time zone") ||
      expected.includes("null");

    if (!ok) {
      console.log(`  MISMATCH ${col}: live=${liveType} expected=${expected}`);
      issues++;
    } else {
      console.log(`  OK       ${col}: ${liveType}`);
    }
  }

  // Flag UUID columns that should be BIGINT
  for (const [col, meta] of Object.entries(props)) {
    if (meta.format === "uuid" && col.endsWith("_id")) {
      console.log(`  WARN     ${col} is UUID — sync expects BIGINT FK`);
      issues++;
    }
  }
  console.log("");
}

console.log(issues === 0 ? "✅ No mismatches detected" : `❌ ${issues} issue(s) found`);
process.exit(issues === 0 ? 0 : 1);
