#!/usr/bin/env node
/**
 * Sprint 11 — run warehouse historical backfill for inventory (idempotent).
 * Usage: npx tsx scripts/run-warehouse-inventory-backfill.mjs [accountId]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
  }
}

loadEnv();

const accountId = process.argv[2] || "1";
const { runWarehouseEntityHistoricalBackfill, getWarehouseFoundationStatus } = await import(
  "../src/services/historical-warehouse-orchestrator.ts"
);

const result = await runWarehouseEntityHistoricalBackfill({
  marketplaceAccountId: accountId,
  entity: "inventory",
  trigger: "manual",
});
console.log(JSON.stringify(result, null, 2));

const status = await getWarehouseFoundationStatus(accountId);
console.log(
  JSON.stringify(
    {
      accountLifecycleStatus: status.accountLifecycleStatus,
      entities: status.entities.map((e) => ({
        entity: e.entity,
        stage: e.stage,
        error: e.error_message,
      })),
      recentAudits: status.recentAudits.slice(0, 3).map((a) => ({
        entity: a.entity,
        status: a.status,
        records_read: a.records_read,
        rows_inserted: a.rows_inserted,
        validation_result: a.validation_result,
      })),
    },
    null,
    2
  )
);

if (result.status === "failed") process.exit(2);
