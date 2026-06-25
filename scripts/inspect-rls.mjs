#!/usr/bin/env node
/**
 * Inspect RLS effective access per table (anon vs service_role row counts).
 * Usage: node scripts/inspect-rls.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const TABLES = [
  "brands",
  "categories",
  "products",
  "wb_orders",
  "wb_sales",
  "wb_finance",
  "wb_ads",
  "product_cost_history",
];

async function count(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  return { count: count ?? 0, error: error?.message ?? null };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("=== RLS effective access (row counts) ===\n");
  console.log("table                  | service_role | anon  | inference");
  console.log("-----------------------|--------------|-------|------------------");

  for (const table of TABLES) {
    const [svc, pub] = await Promise.all([count(service, table), count(anon, table)]);
    let inference = "OK";
    if (svc.error) inference = `service error: ${svc.error}`;
    else if (pub.error) inference = `anon error: ${pub.error}`;
    else if (svc.count > 0 && pub.count === 0) inference = "RLS blocks anon SELECT";
    else if (svc.count > 0 && pub.count === svc.count) inference = "anon SELECT allowed";
    else if (svc.count > 0 && pub.count > 0 && pub.count < svc.count) inference = "partial anon access";
    else if (svc.count === 0) inference = "table empty";

    console.log(
      `${table.padEnd(22)} | ${String(svc.count).padStart(12)} | ${String(pub.count).padStart(5)} | ${inference}`
    );
  }

  console.log("\nNote: service_role bypasses RLS. anon count=0 with service count>0 => missing SELECT policy.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
