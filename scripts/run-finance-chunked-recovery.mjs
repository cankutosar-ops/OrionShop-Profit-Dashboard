#!/usr/bin/env node
/** Chunked finance recovery for rate-limited accounts (existing syncFinance path). */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "2";
const from = process.argv[3] ?? "2026-06-21";
const to = process.argv[4] ?? "2026-08-27";
const chunkDays = Number(process.argv[5] ?? 14);
const pauseMs = Number(process.argv[6] ?? 120000);

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
const { readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);
const { releaseStaleSyncLockIfNeeded } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { isFinanceHistoricalRecoveryActive } = await import(
  "../src/lib/finance-recovery/coordination.ts"
);

if (isFinanceHistoricalRecoveryActive(String(accountId))) {
  console.error(
    `BLOCKED: skipped_finance_recovery_active — Account ${accountId} Finance is reserved for Reports recovery. Refusing legacy run-finance-chunked-recovery (uses syncFinance / Statistics path).`
  );
  process.exit(2);
}

await releaseStaleSyncLockIfNeeded(accountId);
const svc = await createWbSyncService(accountId);

console.log(`Chunked finance recovery account ${accountId}: ${from} → ${to} (${chunkDays}d chunks, ${pauseMs}ms pause)\n`);
console.log("Finance before:", await readLatestDataDateFromDb(accountId, "finance"));

let cursor = from;
let chunk = 0;
while (cursor <= to) {
  chunk += 1;
  const chunkTo = addDays(cursor, chunkDays - 1);
  const end = chunkTo > to ? to : chunkTo;
  console.log(`\n--- Chunk ${chunk}: ${cursor} → ${end} ---`);
  try {
    const result = await svc.syncFinance(cursor, end);
    console.log(JSON.stringify({
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.slice(0, 3),
    }));
  } catch (e) {
    console.log("FAILED:", e instanceof Error ? e.message : e);
  }
  console.log("Finance latest:", await readLatestDataDateFromDb(accountId, "finance"));
  cursor = addDays(end, 1);
  if (cursor <= to) {
    console.log(`Pausing ${pauseMs}ms before next chunk...`);
    await new Promise((r) => setTimeout(r, pauseMs));
  }
}

console.log("\n=== DONE ===");
console.log("Finance after:", await readLatestDataDateFromDb(accountId, "finance"));
