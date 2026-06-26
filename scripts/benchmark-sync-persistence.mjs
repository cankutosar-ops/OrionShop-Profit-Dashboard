#!/usr/bin/env node
/**
 * Benchmark orders + finance sync persistence (batched upserts).
 *
 * Usage: npx tsx scripts/benchmark-sync-persistence.mjs [dateFrom] [dateTo]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function estimateBeforeRequests(entity, rows) {
  if (entity === "orders") return rows * 2;
  if (entity === "finance") return rows * 2;
  return rows;
}

async function runStep(label, fn) {
  const started = Date.now();
  const result = await fn();
  const totalMs = Date.now() - started;
  return { label, result, totalMs };
}

async function main() {
  loadEnv();
  process.env.SYNC_LOG = "0";

  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
  const { resolveMarketplaceAccountId } = await import("../src/services/marketplace-account-service.ts");
  const { marketplaceAccountId } = await resolveMarketplaceAccountId(null, null);
  const svc = await createWbSyncService(marketplaceAccountId);

  console.log("=== Sync persistence benchmark ===");
  console.log(`Range: ${from} → ${to}`);
  console.log(`Marketplace account: ${marketplaceAccountId}\n`);
  console.log("Architecture BEFORE (row-by-row):");
  console.log("  orders:  SELECT srid + INSERT/UPDATE per row (~2 req/row)");
  console.log("  finance: SELECT source_key + INSERT/UPDATE per line (~2 req/line)\n");

  const orders = await runStep("orders", () => svc.syncOrders(from, to));
  const finance = await runStep("finance", () => svc.syncFinance(from, to));

  const rows = [
    {
      entity: "orders",
      rowsProcessed: orders.result.recordsProcessed,
      rowsUpdated: orders.result.recordsUpdated,
      totalSyncMs: orders.totalMs,
      estimatedBeforeDbRequests: estimateBeforeRequests("orders", orders.result.recordsUpdated || orders.result.recordsProcessed),
    },
    {
      entity: "finance",
      rowsProcessed: orders.result.recordsProcessed,
      financeLines: finance.result.recordsUpdated,
      totalSyncMs: finance.totalMs,
      estimatedBeforeDbRequests: estimateBeforeRequests("finance", finance.result.recordsUpdated),
    },
  ];

  console.log("\n=== AFTER (batched upserts) ===");
  console.log("entity   | total sync | rows persisted | est. before DB req | notes");
  console.log("---------|------------|----------------|--------------------|------");
  console.log(
    `orders   | ${(orders.totalMs / 1000).toFixed(1).padStart(8)}s | ${String(orders.result.recordsUpdated).padStart(14)} | ${String(rows[0].estimatedBeforeDbRequests).padStart(18)} | batch 200`
  );
  console.log(
    `finance  | ${(finance.totalMs / 1000).toFixed(1).padStart(8)}s | ${String(finance.result.recordsUpdated).padStart(14)} | ${String(rows[1].estimatedBeforeDbRequests).padStart(18)} | batch 500`
  );
  console.log("\nSee [SYNC METRICS] lines above for dbRequests, rows/sec, persistenceMs.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
