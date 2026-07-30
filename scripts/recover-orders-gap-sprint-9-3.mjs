#!/usr/bin/env node
/**
 * Sprint 9.3 — Orders recovery sync for the missing window only.
 * Does NOT change sync algorithms; calls existing createWbSyncService.syncOrders.
 *
 * Usage:
 *   npx tsx scripts/recover-orders-gap-sprint-9-3.mjs --account 1 --from 2026-07-13 --to 2026-07-24
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
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

function parseArgs() {
  const args = process.argv.slice(2);
  let account = "1";
  let from = "2026-07-13";
  let to = "2026-07-24";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--account" && args[i + 1]) account = args[++i];
    else if (args[i] === "--from" && args[i + 1]) from = args[++i];
    else if (args[i] === "--to" && args[i + 1]) to = args[++i];
  }
  return { account, from, to };
}

function toDateString(iso) {
  return String(iso).slice(0, 10);
}

async function countOrdersInWindow(client, account, from, to) {
  const { count, error } = await client
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account)
    .gte("order_date", from)
    .lte("order_date", to);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function latestOrderDate(client, account) {
  const { data, error } = await client
    .from("wb_orders")
    .select("order_date")
    .eq("marketplace_account_id", account)
    .order("order_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.order_date ? toDateString(data[0].order_date) : null;
}

async function totalOrders(client, account) {
  const { count, error } = await client
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function probeSchema(client) {
  const price = await client.from("wb_orders").select("price_with_disc").limit(1);
  const change = await client.from("wb_orders").select("last_change_date").limit(1);
  return {
    price_with_disc: !price.error,
    last_change_date: !change.error,
  };
}

async function main() {
  loadEnv();
  const { account, from, to } = parseArgs();
  const outDir = resolve(process.cwd(), "exports/browser-proof/sprint-9-3-orders-recovery");
  mkdirSync(outDir, { recursive: true });

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log("=== Sprint 9.3 Orders gap recovery ===");
  console.log(`Account=${account} window=${from}→${to}\n`);

  const schema = await probeSchema(client);
  console.log("Schema gate:", schema);
  if (!schema.price_with_disc || !schema.last_change_date) {
    console.error(
      "FAIL: required wb_orders columns missing. Apply migration first:\n" +
        "  npx tsx scripts/apply-wb-orders-price-with-disc-migration.mjs"
    );
    process.exit(1);
  }

  const before = {
    total: await totalOrders(client, account),
    inWindow: await countOrdersInWindow(client, account, from, to),
    latestOrderDate: await latestOrderDate(client, account),
  };
  console.log("Before:", before);

  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
  const { isWithinDateRange, toDateString: toDate } = await import(
    "../src/lib/wildberries/mappers.ts"
  );

  const wbAccount = await getMarketplaceAccountForSync(account);
  const api = new WbApiClient(wbAccount.apiKey);
  const raw = await api.fetchOrders(`${from}T00:00:00`);
  const apiInWindow = raw.filter((o) => isWithinDateRange(toDate(o.date), from, to));
  const sampleSrids = apiInWindow.slice(0, 25).map(
    (o) => o.srid ?? o.gNumber ?? `${o.nmId}-${o.date}`
  );

  console.log(`\nAPI: raw=${raw.length} orderDateInWindow=${apiInWindow.length}`);
  console.log(`Sample SRIDs to verify: ${sampleSrids.length}`);

  console.log("\nRunning syncOrders only (existing service)...");
  const syncService = await createWbSyncService(account);
  const syncResult = await syncService.syncOrders(from, to);
  console.log("Sync result:", {
    processed: syncResult.recordsProcessed,
    updated: syncResult.recordsUpdated,
    inserted: syncResult.recordsInserted,
    errors: syncResult.errors,
  });

  const after = {
    total: await totalOrders(client, account),
    inWindow: await countOrdersInWindow(client, account, from, to),
    latestOrderDate: await latestOrderDate(client, account),
  };
  console.log("\nAfter:", after);

  let present = [];
  if (sampleSrids.length) {
    const { data, error } = await client
      .from("wb_orders")
      .select("srid,order_date,price_with_disc,last_change_date")
      .eq("marketplace_account_id", account)
      .in("srid", sampleSrids);
    if (error) throw new Error(error.message);
    present = data ?? [];
  }
  const presentSet = new Set(present.map((r) => r.srid));
  const missing = sampleSrids.filter((s) => !presentSet.has(s));

  const report = {
    generatedAt: new Date().toISOString(),
    account,
    window: { from, to },
    schema,
    before,
    after,
    api: {
      rawCount: raw.length,
      orderDateInWindow: apiInWindow.length,
      latestApiOrderDate: apiInWindow.length
        ? apiInWindow.map((o) => toDate(o.date)).sort().at(-1)
        : null,
    },
    syncResult: {
      recordsProcessed: syncResult.recordsProcessed,
      recordsUpdated: syncResult.recordsUpdated,
      recordsInserted: syncResult.recordsInserted,
      errors: syncResult.errors,
    },
    sridProbe: {
      sampleSize: sampleSrids.length,
      presentInDb: present.length,
      missingFromDb: missing.length,
      missingExamples: missing.slice(0, 10),
      presentExamples: present.slice(0, 5),
    },
    success:
      syncResult.errors.length === 0 &&
      after.inWindow > before.inWindow &&
      missing.length === 0 &&
      after.latestOrderDate != null &&
      after.latestOrderDate >= from,
  };

  const outPath = resolve(outDir, "recovery-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nWrote ${outPath}`);
  console.log(report.success ? "\nOK: recovery validation passed." : "\nFAIL: recovery validation incomplete.");
  process.exit(report.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
