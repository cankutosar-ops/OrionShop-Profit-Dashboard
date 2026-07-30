#!/usr/bin/env node
/**
 * Sprint 9.3.1 — Phase 4–5 pipeline + regression checks (read-only after one Orders sync).
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
  }
}

function d(iso) {
  return String(iso).slice(0, 10);
}

async function main() {
  loadEnv();
  const account = "1";
  const from = "2026-07-13";
  const to = "2026-07-24";

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );
  const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
  const { toDateString } = await import("../src/lib/wildberries/mappers.ts");
  const { checkSchemaCompatibility } = await import(
    "../src/lib/schema-compatibility-check.ts"
  );

  console.log("=== Phase 4: normal Orders sync ===");
  const sync = await createWbSyncService(account);
  const result = await sync.syncOrders(from, to);
  console.log(
    JSON.stringify(
      {
        processed: result.recordsProcessed,
        updated: result.recordsUpdated,
        errors: result.errors,
      },
      null,
      2
    )
  );

  async function count(table, col, f, t) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", account)
      .gte(col, f)
      .lte(col, t);
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
  }

  async function latest(table, col) {
    const { data, error } = await client
      .from(table)
      .select(col)
      .eq("marketplace_account_id", account)
      .order(col, { ascending: false })
      .limit(1);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data?.[0]?.[col] ? d(data[0][col]) : null;
  }

  const wb = await getMarketplaceAccountForSync(account);
  const api = new WbApiClient(wb.apiKey);
  const raw = await api.fetchOrders(`${from}T00:00:00`);
  const apiOrderDates = raw
    .map((o) => toDateString(o.date))
    .filter((x) => x >= from && x <= to)
    .sort();
  const apiLatest = apiOrderDates.at(-1) ?? null;
  const apiInWindow = apiOrderDates.length;

  const dbInWindow = await count("wb_orders", "order_date", from, to);
  const dbLatest = await latest("wb_orders", "order_date");
  const stockCount = await client
    .from("wb_stock")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", account);

  const schema = await checkSchemaCompatibility();

  const report = {
    generatedAt: new Date().toISOString(),
    account,
    window: { from, to },
    schemaCompatible: schema?.compatible ?? false,
    syncResult: {
      processed: result.recordsProcessed,
      updated: result.recordsUpdated,
      errors: result.errors,
      ok: result.errors.length === 0,
    },
    orders: {
      dbInWindow,
      dbLatest,
      apiInWindow,
      apiLatest,
      matchLatest: dbLatest === apiLatest,
      matchCount: dbInWindow === apiInWindow,
    },
    regression: {
      sales: {
        inWindow: await count("wb_sales", "sale_date", from, to),
        latest: await latest("wb_sales", "sale_date"),
      },
      finance: {
        inWindow: await count("wb_finance", "operation_date", from, to),
        latest: await latest("wb_finance", "operation_date"),
      },
      inventory: {
        total: stockCount.count ?? 0,
        latestSynced: await latest("wb_stock", "last_synced_at"),
      },
      note: "Sales/Finance/Inventory not re-synced; extents checked for presence/health only.",
    },
  };

  const outDir = resolve(process.cwd(), "exports/browser-proof/sprint-9-3-orders-recovery");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "pipeline-regression.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.syncResult.ok &&
    report.orders.matchLatest &&
    report.orders.matchCount &&
    report.schemaCompatible;
  console.log(ok ? "PIPELINE_AND_REGRESSION_OK" : "PIPELINE_OR_REGRESSION_FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
