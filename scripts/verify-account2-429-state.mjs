#!/usr/bin/env node
/** Verify Account 2 durable 429 retry state in Supabase (read-only). */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { getMarketplaceAccountSyncState } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { commercialEntityStateAvailable, listCommercialEntityStates } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);
const { getAccountCommercialFreshness } = await import(
  "../src/services/commercial-continuity-service.ts"
);
const { classifyCommercialError } = await import("../src/lib/commercial-continuity/classify.ts");
const { readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);

const sb = createAdminClient();
const TARGET = "2026-08-27";

async function tableExists(name) {
  const { error } = await sb.from(name).select("*").limit(1);
  if (!error) return true;
  return !/does not exist|schema cache|Could not find/i.test(error.message);
}

console.log("=== DURABLE 429 RETRY STATE VERIFICATION ===\n");

const tables = {
  commercial_entity_sync_state: await tableExists("commercial_entity_sync_state"),
  commercial_sync_ticks: await tableExists("commercial_sync_ticks"),
  sync_runs: await tableExists("sync_runs"),
};

console.log("--- Table availability ---");
console.log(JSON.stringify(tables, null, 2));

for (const id of ["1", "2"]) {
  console.log(`\n--- Account ${id} marketplace metadata ---`);
  const meta = await getMarketplaceAccountSyncState(id);
  console.log(JSON.stringify(meta, null, 2));
}

console.log("\n--- Account 2 commercial_entity_sync_state (raw) ---");
if (!tables.commercial_entity_sync_state) {
  console.log("TABLE MISSING — migration not applied");
} else {
  const rows = await listCommercialEntityStates("2");
  console.log(JSON.stringify(rows, null, 2));
}

console.log("\n--- Account 2 finance row (direct query) ---");
if (tables.commercial_entity_sync_state) {
  const { data, error } = await sb
    .from("commercial_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", "2")
    .eq("entity", "finance")
    .maybeSingle();
  console.log(error ? error.message : JSON.stringify(data, null, 2));
}

console.log("\n--- Account 2 sync_runs (recent) ---");
if (!tables.sync_runs) {
  console.log("TABLE MISSING");
} else {
  const { data } = await sb
    .from("sync_runs")
    .select("*")
    .eq("marketplace_account_id", "2")
    .order("started_at", { ascending: false })
    .limit(5);
  console.log(JSON.stringify(data ?? [], null, 2));
}

console.log("\n--- commercial_sync_ticks (recent) ---");
if (!tables.commercial_sync_ticks) {
  console.log("TABLE MISSING");
} else {
  const { data } = await sb
    .from("commercial_sync_ticks")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);
  console.log(JSON.stringify(data ?? [], null, 2));
}

console.log("\n--- Account 2 freshness view (orchestrator helper) ---");
console.log(JSON.stringify(await getAccountCommercialFreshness("2"), null, 2));

console.log("\n--- Account 1 freshness view (isolation) ---");
console.log(JSON.stringify(await getAccountCommercialFreshness("1"), null, 2));

console.log("\n--- DB latest dates ---");
for (const id of ["1", "2"]) {
  const dates = {};
  for (const e of ["orders", "sales", "finance"]) {
    dates[e] = await readLatestDataDateFromDb(id, e);
  }
  console.log(`Account ${id}:`, dates);
}

const sample429 =
  'WB API error 429: {"status":429,"statusText":"Too Many Requests","detail":"rate limit exceeded"}';
console.log("\n--- classifyCommercialError(429 sample) ---");
console.log(classifyCommercialError(sample429));
