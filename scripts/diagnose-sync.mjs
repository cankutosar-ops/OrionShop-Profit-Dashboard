import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

function fmtError(label, error) {
  console.log(`\n--- ${label} ---`);
  if (!error) {
    console.log("OK (no error)");
    return;
  }
  console.log(JSON.stringify(error, null, 2));
  console.log("message:", error.message);
  console.log("code:", error.code);
  console.log("details:", error.details);
  console.log("hint:", error.hint);
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function probeTable(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  fmtError(`SELECT ${table}`, error);
  if (data) console.log(`sample columns from ${table}:`, data[0] ? Object.keys(data[0]) : "(empty)");
}

async function fetchOpenApiColumns() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  console.log("\n=== LIVE SUPABASE SCHEMA (OpenAPI) ===");
  for (const table of ["brands", "categories", "products", "wb_orders", "wb_sales", "wb_finance"]) {
    const props = spec.definitions?.[table]?.properties ?? {};
    console.log(`${table}: ${Object.keys(props).sort().join(", ")}`);
  }
}

async function main() {
  console.log("Supabase URL:", url);
  console.log("Using service role key:", key?.slice(0, 12) + "...");

  await fetchOpenApiColumns();

  for (const table of ["brands", "categories", "products", "wb_orders", "wb_sales", "wb_finance"]) {
    await probeTable(table);
  }

  // Step 1: brand insert (sync path)
  const brandPayload = { name: "__diag_test_brand__" };
  let brandRes = await supabase.from("brands").insert(brandPayload).select("id").single();
  fmtError("INSERT brands", brandRes.error);
  const brandId = brandRes.data?.id;

  // Step 2: category insert
  const categoryPayload = { name: "__diag_test_category__", parent_id: null };
  let categoryRes = await supabase.from("categories").insert(categoryPayload).select("id").single();
  fmtError("INSERT categories", categoryRes.error);
  const categoryId = categoryRes.data?.id;

  // Step 3: product insert (exact sync payload shape)
  const productPayload = {
    supplier_article: "__diag_test_article__",
    nm_id: 999999999,
    name: "Diagnostic Test Product",
    brand_id: brandId,
    category_id: categoryId,
    barcode: null,
  };
  let productRes = await supabase.from("products").insert(productPayload).select("id").single();
  fmtError("INSERT products (sync payload)", productRes.error);
  console.log("product payload:", JSON.stringify(productPayload, null, 2));
  const productId = productRes.data?.id;

  // Step 4: wb_orders
  const orderPayload = {
    srid: "__diag_srid_order__",
    nm_id: 999999999,
    product_id: productId,
    order_date: "2026-06-01",
    sale_date: null,
    price: 1000,
    quantity: 1,
    status: "active",
    warehouse: "test",
  };
  let orderRes = await supabase.from("wb_orders").insert(orderPayload).select("id").single();
  fmtError("INSERT wb_orders (sync payload)", orderRes.error);
  console.log("order payload:", JSON.stringify(orderPayload, null, 2));

  // Step 5: wb_sales
  const salePayload = {
    srid: "__diag_srid_sale__",
    nm_id: 999999999,
    product_id: productId,
    sale_date: "2026-06-01",
    revenue: 1000,
    quantity: 1,
    is_return: false,
    return_date: null,
  };
  let saleRes = await supabase.from("wb_sales").insert(salePayload).select("id").single();
  fmtError("INSERT wb_sales (sync payload)", saleRes.error);
  console.log("sale payload:", JSON.stringify(salePayload, null, 2));

  // Step 6: wb_finance
  const financePayload = {
    product_id: productId,
    nm_id: 999999999,
    operation_date: "2026-06-01",
    operation_type: "commission",
    amount: 100,
    source_key: "rrd:1234567:commission",
    description: "rrd:1234567:commission",
  };
  let financeRes = await supabase.from("wb_finance").insert(financePayload).select("id").single();
  fmtError("INSERT wb_finance (sync payload)", financeRes.error);
  console.log("finance payload:", JSON.stringify(financePayload, null, 2));

  // Cleanup diag rows
  if (financeRes.data?.id) await supabase.from("wb_finance").delete().eq("id", financeRes.data.id);
  if (saleRes.data?.id) await supabase.from("wb_sales").delete().eq("id", saleRes.data.id);
  if (orderRes.data?.id) await supabase.from("wb_orders").delete().eq("id", orderRes.data.id);
  if (productId) await supabase.from("products").delete().eq("id", productId);
  if (categoryId) await supabase.from("categories").delete().eq("id", categoryId);
  if (brandId) await supabase.from("brands").delete().eq("id", brandId);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
