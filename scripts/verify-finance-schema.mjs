#!/usr/bin/env node
/**
 * Verify wb_finance schema prerequisites for Sprint 6.17C finance sync.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        process.env[trimmed.slice(0, idx).trim()] ??= trimmed.slice(idx + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

async function probeUpsertConflict(supabase, onConflict) {
  const probeKey = `__schema_probe_${Date.now()}`;
  const row = {
    marketplace_account_id: "00000000-0000-0000-0000-000000000099",
    product_id: null,
    nm_id: null,
    operation_date: "2099-01-01",
    operation_type: "expense",
    amount: 0.01,
    source_key: probeKey,
    description: probeKey,
  };

  const { error } = await supabase.from("wb_finance").upsert(row, { onConflict });
  if (error) return { ok: false, error: error.message };

  await supabase.from("wb_finance").delete().eq("source_key", probeKey);
  return { ok: true };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const columns = {};
  for (const col of [
    "finance_category",
    "wb_source_suffix",
    "supplier_oper_name",
    "finance_nature",
    "source_key",
    "marketplace_account_id",
  ]) {
    const { error } = await supabase.from("wb_finance").select(col).limit(1);
    columns[col] = error ? `MISSING (${error.message})` : "PRESENT";
  }

  const composite = await probeUpsertConflict(supabase, "marketplace_account_id,source_key");
  const sourceKeyOnly = await probeUpsertConflict(supabase, "source_key");

  console.log("=== wb_finance schema verification ===\n");
  console.log("Columns:");
  for (const [col, status] of Object.entries(columns)) {
    console.log(`  ${col}: ${status}`);
  }
  console.log("\nUpsert onConflict probes:");
  console.log(
    `  marketplace_account_id,source_key: ${composite.ok ? "OK" : `FAIL — ${composite.error}`}`
  );
  console.log(`  source_key: ${sourceKeyOnly.ok ? "OK" : `FAIL — ${sourceKeyOnly.error}`}`);

  const { count: total } = await supabase
    .from("wb_finance")
    .select("*", { count: "exact", head: true });
  console.log(`\nTotal wb_finance rows: ${total ?? "unknown"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
